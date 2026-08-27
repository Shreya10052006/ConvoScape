/**
 * downloadReport.ts
 * ---------------------------------------------------------------------------
 * Builds a self-contained HTML file for offline viewing or printing.
 */

import type {
  FinalReport,
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
  return `<div class="score"><span class="score-label">${esc(label)}</span><span class="score-value">${value}<em>/100</em></span></div>`;
}

export function buildReportHTML(
  project: ProjectContext,
  report: FinalReport,
  _metrics: SpeechMetrics,
  transcript: TranscriptTurn[]
): string {
  const student = report.studentCommunication;
  if (!student) return "<html><body><p>No report available.</p></body></html>";

  const userTurns = transcript.filter((t) => t.speaker === "user");
  const characterTurns = transcript.filter(
    (t) => t.speaker === "rahul" || t.kind === "CHARACTER_DIALOGUE"
  );

  const qa = student.questionAnalysis
    .map((q) => {
      const qText = characterTurns[q.questionNumber]?.text || `Question ${q.questionNumber}`;
      const aText = userTurns[q.questionNumber]?.text || userTurns[q.questionNumber - 1]?.text || "";
      return `
      <div class="qa">
        <p class="qa-q">Q${q.questionNumber}: ${esc(qText)}</p>
        ${aText ? `<p><strong>Your answer:</strong> <em>${esc(aText)}</em></p>` : ""}
        <p class="score-tag"><strong>Score:</strong> ${q.score}/100</p>
        <p class="good"><strong>What worked:</strong> ${esc(q.whatWorked.join(" • "))}</p>
        <p class="gap"><strong>Could improve:</strong> ${esc(q.whatCouldImprove.join(" • "))}</p>
        ${
          q.betterApproach
            ? `<div class="stronger"><strong>Suggested Better Approach:</strong><p>${esc(
                q.betterApproach
              )}</p></div>`
            : ""
        }
      </div>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>ConvoScape Student Report — ${esc(project.name)}</title>
<style>
  :root { --ink:#15171c; --muted:#6b7280; --line:#e5e7eb; --accent:#0369a1; }
  * { box-sizing:border-box; }
  body { margin:0; padding:48px 32px; font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
         color:var(--ink); max-width:860px; margin-inline:auto; background:#fff; }
  h1 { font-size:26px; margin:0 0 4px; font-weight:600; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.14em; color:var(--muted);
       margin:40px 0 14px; font-weight:700; border-bottom:1px solid var(--line); padding-bottom:6px; }
  .sub { color:var(--muted); margin:0 0 24px; font-size:14px; }
  .summary { font-size:17px; line-height:1.6; border-left:3px solid var(--accent);
             padding-left:18px; margin:0 0 20px; color:#1e293b; }
  .scores { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
  .score { border:1px solid var(--line); border-radius:8px; padding:12px; background:#fafafa; }
  .score-label { display:block; font-size:11px; text-transform:uppercase;
                 letter-spacing:.08em; color:var(--muted); font-weight:600; }
  .score-value { font-size:22px; font-weight:700; color:#0f172a; }
  .score-value em { font-size:12px; color:var(--muted); font-style:normal; }
  ul { padding-left:20px; } li { margin-bottom:7px; font-size:14px; }
  .qa { border:1px solid var(--line); border-radius:8px; padding:16px 18px; margin-bottom:16px; background:#fafafa; }
  .qa-q { font-weight:700; margin:0 0 8px; color:#0f172a; font-size:15px; }
  .qa p { margin:6px 0; font-size:14px; }
  .good strong { color:#047857; } .gap strong { color:#b45309; }
  .stronger { background:#f0f9ff; border:1px solid #bae6fd; border-radius:6px; padding:12px 14px; margin-top:10px; font-size:13px; }
  .stronger p { margin:4px 0 0; }
  footer { margin-top:48px; padding-top:16px; border-top:1px solid var(--line);
           color:var(--muted); font-size:12px; }
  @media print {
    body { padding:0; max-width:none; }
    .qa, .stronger, .score { page-break-inside:avoid; }
    @page { margin:15mm; }
  }
</style></head><body>

<h1>${esc(project.name)}</h1>
<p class="sub">${esc(project.domain)}${project.college ? ` · ${esc(project.college)}` : ""}${
    project.userName ? ` · ${esc(project.userName)}` : ""
  } · ${new Date().toLocaleDateString()}</p>

<h2>Student Communication Performance (${student.overallScore}/100)</h2>
<div class="scores">
  ${scoreRow("Clarity", student.categoryScores.clarity)}
  ${scoreRow("Relevance", student.categoryScores.relevance)}
  ${scoreRow("Structure", student.categoryScores.structure)}
  ${scoreRow("Technical Communication", student.categoryScores.technicalCommunication)}
  ${scoreRow("Spontaneous Thinking", student.categoryScores.spontaneousThinking)}
  ${scoreRow("Conciseness", student.categoryScores.conciseness)}
</div>

<h2>Communication Summary</h2>
<p class="summary">${esc(student.overallSummary)}</p>

<h2>Question-by-Question Analysis (Q1–Q10)</h2>
${qa}

<h2>Personal Strengths</h2>
<ul>${student.strengths.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>

<h2>Areas for Improvement</h2>
<ul>${student.recurringWeaknesses.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>

<h2>Recommended Next Session Goals</h2>
<ul>${student.nextSessionGoals.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>

<footer>ConvoScape Presentation Simulator • Practice before it counts.</footer>
</body></html>`;
}

export function downloadReportHTML(
  project: ProjectContext,
  report: FinalReport,
  metrics: SpeechMetrics,
  transcript: TranscriptTurn[]
): void {
  const html = buildReportHTML(project, report, metrics, transcript);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `convoscape-report-${project.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadRecording(blob: Blob, projectName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `convoscape-recording-${projectName.toLowerCase().replace(/[^a-z0-9]/g, "-")}.webm`;
  a.click();
  URL.revokeObjectURL(url);
}
