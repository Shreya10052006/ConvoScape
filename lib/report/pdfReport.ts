/**
 * pdfReport.ts
 * ---------------------------------------------------------------------------
 * Generates a real PDF with pdf-lib.
 *
 * WHY pdf-lib RATHER THAN html2canvas/jsPDF
 *
 * The rasterise-the-DOM approach produces a PDF of *pictures of text*: blurry
 * when zoomed, unselectable, unsearchable, and enormous. pdf-lib draws real
 * text into real PDF primitives, so the output is selectable, searchable,
 * copy-pasteable, and a few dozen KB. It also runs without a DOM, which means
 * this same module can be unit-tested in Node — and is, in the test suite.
 *
 * INDEPENDENT OF GEMINI BY CONSTRUCTION. This takes a CoachingReport object and
 * knows nothing about where it came from. A deterministic fallback report
 * renders exactly as well as an AI-generated one; the only visible difference
 * is the degraded-mode banner, which comes from the report's own `isFallback`
 * flag. There is no code path where a Gemini failure prevents a PDF.
 */

// pdf-lib is imported DYNAMICALLY inside buildReportPDF, not at module scope.
//
// A static import pulled ~180 kB into the main bundle, which every user paid for
// on first paint of the immersive scene — before they had even spoken to Rahul,
// and whether or not they ever clicked Download PDF. Since the PDF is built at
// most once, at the very end of a session, deferring the cost to that click is
// strictly better: the scene loads light and the library streams in while the
// button shows "Building PDF…".
//
// Types are erased at compile time, so importing them statically costs nothing.
import type { PDFDocument as PDFDocumentType, PDFFont, PDFPage, RGB } from "pdf-lib";
// ColorTypes is a const enum-like VALUE, so it can't be imported as a type.
// Its RGB member is the string "RGB" at runtime; asserting through the imported
// RGB type keeps us structurally correct without a runtime pdf-lib import.

import type {
  CoachingReport,
  ProjectContext,
  SpeechMetrics,
  TranscriptTurn,
  WebcamResult,
} from "@/lib/session/sessionTypes";

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 54;
type Rgb = RGB;
const mkRgb = (red: number, green: number, blue: number): Rgb =>
  ({ type: "RGB", red, green, blue }) as Rgb;

const INK = mkRgb(0.09, 0.1, 0.12);
const MUTED = mkRgb(0.45, 0.47, 0.51);
const ACCENT = mkRgb(0.02, 0.42, 0.63);
const GOOD = mkRgb(0.02, 0.47, 0.34);
const WARN = mkRgb(0.7, 0.35, 0.05);
const RULE = mkRgb(0.85, 0.86, 0.88);

interface Ctx {
  doc: PDFDocumentType;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  pageNumber: number;
}

/**
 * pdf-lib's WinAnsi encoding throws on characters outside its range, which is
 * how a smart quote or an em-dash from model output can crash PDF generation
 * entirely. Normalising the common offenders is cheaper and safer than
 * embedding a full Unicode font for what is essentially punctuation.
 */
function sanitize(text: string): string {
  return String(text ?? "")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    .replace(/[\u2022]/g, "-")
    .replace(/[^\x20-\x7E\n]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      // A single word longer than the column (a URL, a long identifier) must be
      // hard-broken or it would overflow the page silently.
      if (font.widthOfTextAtSize(w, size) > maxWidth) {
        let chunk = "";
        for (const ch of w) {
          if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
            lines.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        line = chunk;
      } else line = w;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage(A4);
  ctx.pageNumber++;
  ctx.y = A4[1] - MARGIN;
}

function ensure(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN + 28) newPage(ctx);
}

function text(
  ctx: Ctx,
  content: string,
  opts: { size?: number; font?: PDFFont; color?: Rgb; indent?: number; gap?: number } = {}
): void {
  const size = opts.size ?? 10;
  const font = opts.font ?? ctx.regular;
  const indent = opts.indent ?? 0;
  const width = A4[0] - MARGIN * 2 - indent;
  const lines = wrap(content, font, size, width);
  const lineHeight = size * 1.45;

  for (const line of lines) {
    ensure(ctx, lineHeight);
    ctx.page.drawText(line, {
      x: MARGIN + indent,
      y: ctx.y - size,
      size,
      font,
      color: opts.color ?? INK,
    });
    ctx.y -= lineHeight;
  }
  ctx.y -= opts.gap ?? 0;
}

function heading(ctx: Ctx, label: string): void {
  ensure(ctx, 44);
  ctx.y -= 14;
  ctx.page.drawText(sanitize(label.toUpperCase()), {
    x: MARGIN,
    y: ctx.y - 9,
    size: 8,
    font: ctx.bold,
    color: MUTED,
  });
  ctx.y -= 15;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: A4[0] - MARGIN, y: ctx.y },
    thickness: 0.5,
    color: RULE,
  });
  ctx.y -= 12;
}

function bullets(ctx: Ctx, items: string[], color = INK): void {
  for (const item of items) {
    ensure(ctx, 16);
    ctx.page.drawText("-", { x: MARGIN, y: ctx.y - 10, size: 10, font: ctx.bold, color });
    text(ctx, item, { indent: 12, gap: 3 });
  }
}

function scoreGrid(ctx: Ctx, overall: CoachingReport["overall"]): void {
  const entries: Array<[string, number]> = [
    ["Communication", overall.communicationScore],
    ["Technical", overall.technicalExplanationScore],
    ["Clarity", overall.clarityScore],
    ["Confidence", overall.confidenceScore],
    ["Q&A handling", overall.questionHandlingScore],
    ["Specificity", overall.specificityScore],
    ["Structure", overall.structureScore],
    ["Relevance", overall.relevanceScore],
  ];
  const cols = 4;
  const cellW = (A4[0] - MARGIN * 2) / cols;
  const rows = Math.ceil(entries.length / cols);
  ensure(ctx, rows * 42 + 8);

  entries.forEach(([label, value], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = MARGIN + col * cellW;
    const y = ctx.y - row * 42;
    ctx.page.drawText(sanitize(label), { x, y: y - 8, size: 7, font: ctx.regular, color: MUTED });
    ctx.page.drawText(`${value}`, { x, y: y - 26, size: 17, font: ctx.bold, color: INK });
    ctx.page.drawText("/10", {
      x: x + ctx.bold.widthOfTextAtSize(`${value}`, 17) + 2,
      y: y - 26,
      size: 8,
      font: ctx.regular,
      color: MUTED,
    });
  });
  ctx.y -= rows * 42 + 6;
}

function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "not recorded";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

export interface PdfInput {
  project: ProjectContext;
  report: CoachingReport;
  metrics: SpeechMetrics;
  webcam: WebcamResult;
  transcript: TranscriptTurn[];
  hasRecording: boolean;
}

export async function buildReportPDF(input: PdfInput): Promise<Uint8Array> {
  const { project, report, metrics, webcam } = input;

  // Dynamic import: this is where the ~180 kB actually loads, on click.
  const { PDFDocument, StandardFonts } = await import("pdf-lib");

  const doc = await PDFDocument.create();
  doc.setTitle(`ConvoScape - ${sanitize(project.name)}`);
  doc.setSubject("Presentation practice coaching report");
  doc.setCreator("ConvoScape");

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ctx: Ctx = {
    doc,
    page: doc.addPage(A4),
    y: A4[1] - MARGIN,
    regular,
    bold,
    pageNumber: 1,
  };

  // --- Title block ---------------------------------------------------------
  ctx.page.drawText("CONVOSCAPE", {
    x: MARGIN, y: ctx.y - 10, size: 9, font: bold, color: ACCENT,
  });
  ctx.y -= 26;
  text(ctx, project.name || "Practice session", { size: 20, font: bold });
  ctx.y -= 2;

  const meta = [
    project.domain,
    project.userName,
    project.college,
    new Date(report.generatedAt ?? Date.now()).toLocaleString(),
  ].filter(Boolean).join("  |  ");
  text(ctx, meta, { size: 8.5, color: MUTED });
  if (report.sessionId) {
    text(ctx, `Session ${report.sessionId}`, { size: 7.5, color: MUTED });
  }

  if (report.isFallback) {
    ctx.y -= 8;
    ensure(ctx, 46);
    const boxTop = ctx.y;
    text(
      ctx,
      "The AI coaching layer was unavailable for this session. This report was built from directly measured speech data and the per-answer scoring collected during the conversation. Nothing here is estimated or invented.",
      { size: 8.5, color: WARN, indent: 8 }
    );
    ctx.page.drawLine({
      start: { x: MARGIN, y: boxTop - 2 },
      end: { x: MARGIN, y: ctx.y + 4 },
      thickness: 2,
      color: WARN,
    });
  }

  ctx.y -= 6;
  text(ctx, report.narrativeSummary, { size: 11, gap: 4 });

  // --- Session timing ------------------------------------------------------
  if (report.durations) {
    heading(ctx, "Session timing");
    const d = report.durations;
    text(ctx, `Total session: ${fmtDuration(d.totalSeconds)}`, { size: 9.5 });
    text(ctx, `Conversation with Rahul: ${fmtDuration(d.rahulSeconds)}`, { size: 9.5 });
    text(ctx, `Presentation: ${fmtDuration(d.presentationSeconds)}`, { size: 9.5 });
    text(ctx, `Judge Q&A: ${fmtDuration(d.judgeQnaSeconds)}`, { size: 9.5 });
  }

  // --- Scores --------------------------------------------------------------
  heading(ctx, "Overall performance");
  scoreGrid(ctx, report.overall);

  // --- Strengths / gaps ----------------------------------------------------
  if (report.whatYouDidWell.length) {
    heading(ctx, "What you did well");
    bullets(ctx, report.whatYouDidWell, GOOD);
  }
  if (report.whatYouMissed.length) {
    heading(ctx, "What you missed");
    bullets(ctx, report.whatYouMissed, WARN);
  }

  if (report.communicationAnalysis) {
    heading(ctx, "Communication analysis");
    text(ctx, report.communicationAnalysis);
  }
  if (report.technicalCommunication) {
    heading(ctx, "Technical communication");
    text(ctx, report.technicalCommunication);
  }

  // --- Speech metrics ------------------------------------------------------
  heading(ctx, "Speech metrics");
  text(ctx, report.speakingPatterns, { gap: 6 });

  const stats: string[] = [
    `Responses: ${metrics.totalResponses}`,
    `Average words per answer: ${metrics.avgWordsPerResponse.toFixed(0)}`,
    `Pace: ${metrics.wordsPerMinute != null ? `${metrics.wordsPerMinute.toFixed(0)} words/min` : "not measurable (typed input)"}`,
    `Average response delay: ${(metrics.avgResponseTimeMs / 1000).toFixed(1)}s`,
    `Long pauses before answering: ${metrics.longPauseCount}`,
    `Very short answers: ${metrics.shortAnswerCount}`,
    `Very long answers: ${metrics.longAnswerCount}`,
  ];
  bullets(ctx, stats);

  const fillers = Object.entries(metrics.fillerWordCounts).sort((a, b) => b[1] - a[1]);
  if (fillers.length) {
    ctx.y -= 4;
    text(ctx, "Filler words", { size: 9, font: bold, gap: 2 });
    text(ctx, fillers.map(([w, c]) => `${w} x${c}`).join("   "), { size: 9, color: MUTED });
  }

  // --- Repetition ----------------------------------------------------------
  const rep = metrics.repetition;
  if (rep) {
    heading(ctx, "Repetition");
    if (report.repetitionAnalysis) text(ctx, report.repetitionAnalysis, { gap: 6 });

    if (rep.topRepeatedWords.length) {
      text(ctx, "Immediate repeats (hesitation signal)", { size: 9, font: bold, gap: 2 });
      text(ctx, rep.topRepeatedWords.map((w) => `"${w.text}" x${w.count}`).join("   "), {
        size: 9, color: MUTED, gap: 4,
      });
    }
    if (rep.topRepeatedPhrases.length) {
      text(ctx, "Repeated phrases", { size: 9, font: bold, gap: 2 });
      bullets(ctx, rep.topRepeatedPhrases.map((p) => `"${p.text}" - ${p.count} times`));
    }
    if (rep.domainTermRepeats.length) {
      ctx.y -= 2;
      text(ctx, "Project vocabulary (not a problem)", { size: 9, font: bold, gap: 2 });
      text(
        ctx,
        `${rep.domainTermRepeats.map((w) => `${w.text} x${w.count}`).join("   ")}  -  these are your project's own terms. Repeating them is correct and consistent, not a fluency issue.`,
        { size: 9, color: MUTED }
      );
    }
    if (!rep.topRepeatedWords.length && !rep.topRepeatedPhrases.length) {
      text(ctx, "No unintentional repetition patterns were detected.", { size: 9.5, color: MUTED });
    }
  }

  // --- Interruptions -------------------------------------------------------
  if (report.interruptionNotes) {
    heading(ctx, "Possible interruptions");
    text(ctx, report.interruptionNotes);
  }

  // --- Answer quality ------------------------------------------------------
  if (report.answerQuality) {
    heading(ctx, "Answer quality");
    text(ctx, report.answerQuality);
  }

  // --- Judge Q&A -----------------------------------------------------------
  if (report.questionBreakdown.length) {
    heading(ctx, "Judge Q&A, question by question");
    report.questionBreakdown.forEach((q, i) => {
      ensure(ctx, 90);
      ctx.y -= 4;
      text(ctx, `${i + 1}. ${q.question}`, { size: 10.5, font: bold, gap: 3 });
      if (q.whatTheJudgeWasTesting) {
        text(ctx, `What they were testing: ${q.whatTheJudgeWasTesting}`, { size: 9, color: MUTED, gap: 2 });
      }
      if (q.answerSummary) text(ctx, `Your answer: ${q.answerSummary}`, { size: 9, gap: 2 });
      if (q.whatWasGood) text(ctx, `What worked: ${q.whatWasGood}`, { size: 9, color: GOOD, gap: 2 });
      if (q.whatWasWeak) text(ctx, `What was weak: ${q.whatWasWeak}`, { size: 9, color: WARN, gap: 2 });
      if (q.strongerAnswer) {
        text(ctx, "A stronger version:", { size: 9, font: bold, color: ACCENT, gap: 2 });
        text(ctx, q.strongerAnswer, { size: 9, indent: 10, gap: 6 });
      }
    });
  }

  // --- Camera --------------------------------------------------------------
  heading(ctx, "Presentation behaviour");
  if (webcam.enabled && report.bodyLanguage) {
    text(ctx, report.bodyLanguage, { gap: 6 });
    bullets(ctx, [
      `Forward-facing: ${(webcam.forwardFacingRatio * 100).toFixed(0)}% of samples`,
      `Average head turn: ${webcam.averageHeadTurnDegrees.toFixed(0)} degrees`,
      `Blink rate: ${webcam.blinkRatePerMinute.toFixed(0)} per minute`,
      `Samples analysed: ${webcam.sampleCount}`,
    ]);
    ctx.y -= 4;
    text(
      ctx,
      "Limitations: these are geometric measurements of head orientation and eyelid position from face landmarks. They are not measurements of attention, emotion or confidence, and should not be read as such.",
      { size: 8.5, color: MUTED }
    );
  } else {
    text(ctx, "Camera analysis was not enabled.", { size: 10 });
    text(
      ctx,
      "This section was intentionally skipped. Declining the camera did not affect any score in this report.",
      { size: 9, color: MUTED }
    );
  }

  // --- Recording -----------------------------------------------------------
  if (input.hasRecording) {
    heading(ctx, "Recording");
    text(
      ctx,
      "A video recording of this session was captured and kept on your own device. It was never uploaded. Download it from the report screen before closing the tab - it is not stored anywhere else.",
      { size: 9.5 }
    );
  }

  // --- Actions -------------------------------------------------------------
  heading(ctx, "Most important improvement");
  text(ctx, report.mostImportantImprovement, { size: 10.5 });

  heading(ctx, "How to practise");
  text(ctx, report.howToPractice, { size: 10.5 });

  // --- Footers -------------------------------------------------------------
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(sanitize(`ConvoScape  |  ${project.name}  |  ${i + 1} of ${pages.length}`), {
      x: MARGIN,
      y: MARGIN - 18,
      size: 7.5,
      font: regular,
      color: MUTED,
    });
  });

  return doc.save();
}

function safeName(s: string): string {
  return (s || "session").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

export async function downloadReportPDF(input: PdfInput): Promise<void> {
  const bytes = await buildReportPDF(input);
  // Copy into a fresh ArrayBuffer: the Uint8Array pdf-lib returns may be a view
  // over a larger buffer, and handing that straight to Blob can attach trailing
  // bytes and produce a file some readers reject.
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: "application/pdf" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `convoscape-${safeName(input.project.name)}-report.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
