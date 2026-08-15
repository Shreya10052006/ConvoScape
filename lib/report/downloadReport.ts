/**
 * downloadReport.ts
 * ---------------------------------------------------------------------------
 * Builds a self-contained HTML file the user can keep, open offline, or print
 * to PDF from the browser.
 *
 * HTML rather than a client-side PDF library, on purpose: pulling in jsPDF or
 * html2canvas to rasterise text produces a heavier bundle and a WORSE artifact
 * (blurry, unselectable, unsearchable). A single HTML file opens everywhere,
 * keeps text selectable, and Cmd/Ctrl+P → "Save as PDF" gives a clean
 * paginated document using the print stylesheet below. The @page rules and
 * page-break-inside guards are there so that path produces something properly
 * laid out rather than sections split across pages.
 *
 * The recording is intentionally NOT inlined. Base64-encoding a multi-megabyte
 * video into HTML produces a file too large to open comfortably; the video is
 * offered as a separate download instead.
 */

import type {
  CoachingReport,
  ProjectContext,
  SpeechMetrics,
  TranscriptTurn,
} from "@/lib/session/sessionTypes";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scoreRow(label: string, value: number): string {
  return `<div class="score"><span class="score-label">${esc(label)}</span><span class="score-value">${value}<em>/10</em></span></div>`;
}

export function buildReportHTML(
  project: ProjectContext,
  report: CoachingReport,
  metrics: SpeechMetrics,
  transcript: TranscriptTurn[]
): string {
  const fillers = Object.entries(metrics.fillerWordCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([w, c]) => `<li>${esc(w)} — ${c}</li>`)
    .join("");

  const qa = report.questionBreakdown
    .map(
      (q) => `
      <div class="qa">
        <p class="qa-q">${esc(q.question)}</p>
        <p><strong>Your answer:</strong> ${esc(q.answerSummary)}</p>
        <p><strong>What the judge was testing:</strong> ${esc(q.whatTheJudgeWasTesting)}</p>
        <p class="good"><strong>What worked:</strong> ${esc(q.whatWasGood)}</p>
        <p class="gap"><strong>What was weak:</strong> ${esc(q.whatWasWeak)}</p>
        <div class="stronger"><strong>A stronger version</strong><p>${esc(q.strongerAnswer)}</p></div>
      </div>`
    )
    .join("");

  const dialogue = transcript
    .filter((t) => t.kind === "CHARACTER_DIALOGUE")
    .map(
      (t) =>
        `<p class="line ${t.speaker === "user" ? "user" : "char"}"><span>${esc(
          t.speaker === "user" ? project.userName || "You" : t.speaker.toUpperCase()
        )}</span> ${esc(t.text)}</p>`
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>ConvoScape — ${esc(project.name)}</title>
<style>
  :root { --ink:#15171c; --muted:#6b7280; --line:#e5e7eb; --accent:#0369a1; }
  * { box-sizing:border-box; }
  body { margin:0; padding:48px 32px; font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
         color:var(--ink); max-width:820px; margin-inline:auto; background:#fff; }
  h1 { font-size:26px; margin:0 0 4px; font-weight:600; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:.16em; color:var(--muted);
       margin:44px 0 14px; font-weight:600; }
  .sub { color:var(--muted); margin:0 0 28px; font-size:14px; }
  .summary { font-size:19px; line-height:1.55; border-left:3px solid var(--accent);
             padding-left:18px; margin:0 0 8px; }
  .scores { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
  .score { border:1px solid var(--line); border-radius:6px; padding:12px; }
  .score-label { display:block; font-size:10px; text-transform:uppercase;
                 letter-spacing:.1em; color:var(--muted); }
  .score-value { font-size:24px; font-weight:300; }
  .score-value em { font-size:13px; color:var(--muted); font-style:normal; }
  ul { padding-left:20px; } li { margin-bottom:7px; }
  .qa { border:1px solid var(--line); border-radius:6px; padding:16px 18px; margin-bottom:16px; }
  .qa-q { font-weight:600; margin:0 0 10px; }
  .qa p { margin:6px 0; font-size:15px; }
  .good strong { color:#047857; } .gap strong { color:#b45309; }
  .stronger { background:#f0f9ff; border-radius:5px; padding:12px 14px; margin-top:10px; }
  .stronger p { margin:6px 0 0; }
  .line { margin:5px 0; font-size:14px; }
  .line span { display:inline-block; min-width:78px; font-size:10px; letter-spacing:.1em;
               color:var(--muted); text-transform:uppercase; }
  .line.user { color:var(--accent); }
  .note { background:#fffbeb; border:1px solid #fde68a; border-radius:6px;
          padding:12px 14px; font-size:14px; }
  footer { margin-top:56px; padding-top:16px; border-top:1px solid var(--line);
           color:var(--muted); font-size:12px; }
  @media print {
    body { padding:0; max-width:none; }
    h2 { margin-top:26px; }
    .qa, .stronger, .score { page-break-inside:avoid; }
    @page { margin:18mm; }
  }
</style></head><body>

<h1>${esc(project.name)}</h1>
<p class="sub">${esc(project.domain)}${project.college ? ` · ${esc(project.college)}` : ""}${
    project.userName ? ` · ${esc(project.userName)}` : ""
  } · ${new Date().toLocaleDateString()}</p>

${report.isFallback ? `<p class="note">The AI coaching layer was unavailable for this session, so this report was generated from directly measured speech data and the per-answer scoring collected during the conversation. Nothing here is estimated.</p>` : ""}

<p class="summary">${esc(report.narrativeSummary)}</p>

<h2>Overall performance</h2>
<div class="scores">
  ${scoreRow("Communication", report.overall.communicationScore)}
  ${scoreRow("Technical", report.overall.technicalExplanationScore)}
  ${scoreRow("Clarity", report.overall.clarityScore)}
  ${scoreRow("Confidence", report.overall.confidenceScore)}
  ${scoreRow("Q&A handling", report.overall.questionHandlingScore)}
  ${scoreRow("Specificity", report.overall.specificityScore)}
  ${scoreRow("Structure", report.overall.structureScore)}
  ${scoreRow("Relevance", report.overall.relevanceScore)}
</div>

<h2>What you did well</h2>
<ul>${report.whatYouDidWell.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>

<h2>What you missed</h2>
<ul>${report.whatYouMissed.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>

${report.communicationAnalysis ? `<h2>Communication analysis</h2><p>${esc(report.communicationAnalysis)}</p>` : ""}
${report.technicalCommunication ? `<h2>Technical communication</h2><p>${esc(report.technicalCommunication)}</p>` : ""}

<h2>Speaking patterns</h2>
<p>${esc(report.speakingPatterns)}</p>
<ul>
  <li>Responses: ${metrics.totalResponses}</li>
  <li>Average words per answer: ${metrics.avgWordsPerResponse.toFixed(0)}</li>
  <li>Pace: ${metrics.wordsPerMinute != null ? `${metrics.wordsPerMinute.toFixed(0)} wpm` : "not measurable (typed input)"}</li>
  <li>Long pauses: ${metrics.longPauseCount}</li>
</ul>
${fillers ? `<p><strong>Filler words</strong></p><ul>${fillers}</ul>` : ""}

<h2>Answer quality</h2>
<p>${esc(report.answerQuality)}</p>

${qa ? `<h2>Judge Q&amp;A breakdown</h2>${qa}` : ""}

<h2>Presentation behaviour</h2>
<p>${report.bodyLanguage ? esc(report.bodyLanguage) : "Camera analysis was not enabled. This section was intentionally skipped, and declining the camera did not affect any score above."}</p>

<h2>Most important improvement</h2>
<p>${esc(report.mostImportantImprovement)}</p>

<h2>How to practise</h2>
<p>${esc(report.howToPractice)}</p>

<h2>Transcript</h2>
${dialogue}

<footer>Generated by ConvoScape · ${new Date().toLocaleString()}</footer>
</body></html>`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — revoking synchronously can cancel the download
  // in some browsers before it's started reading.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName(s: string): string {
  return (s || "session").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

export function downloadReportHTML(
  project: ProjectContext,
  report: CoachingReport,
  metrics: SpeechMetrics,
  transcript: TranscriptTurn[]
): void {
  const html = buildReportHTML(project, report, metrics, transcript);
  triggerDownload(new Blob([html], { type: "text/html" }), `convoscape-${safeName(project.name)}.html`);
}

export function downloadRecording(blob: Blob, projectName: string): void {
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  triggerDownload(blob, `convoscape-${safeName(projectName)}-recording.${ext}`);
}
