/**
 * pdfReport.ts
 * ---------------------------------------------------------------------------
 * Generates a real, high-quality PDF report using pdf-lib.
 */

import type { PDFDocument as PDFDocumentType, PDFFont, PDFPage, RGB } from "pdf-lib";
import type {
  FinalReport,
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

function sanitize(str: string): string {
  if (!str) return "";
  return str
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, " ")
    .replace(/\s+/g, " ");
}

function ensure(ctx: Ctx, height: number): void {
  if (ctx.y - height < MARGIN + 24) {
    ctx.pageNumber += 1;
    ctx.page = ctx.doc.addPage(A4);
    ctx.y = A4[1] - MARGIN;
  }
}

function text(
  ctx: Ctx,
  content: string,
  opts: {
    size?: number;
    font?: PDFFont;
    color?: Rgb;
    gap?: number;
    indent?: number;
  } = {}
): void {
  const size = opts.size ?? 10;
  const font = opts.font ?? ctx.regular;
  const color = opts.color ?? INK;
  const gap = opts.gap ?? 4;
  const indent = opts.indent ?? 0;
  const maxWidth = A4[0] - MARGIN * 2 - indent;

  const clean = sanitize(content);
  if (!clean) return;

  const words = clean.split(" ");
  let line = "";

  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth) {
      ensure(ctx, size + 2);
      ctx.page.drawText(line, { x: MARGIN + indent, y: ctx.y, size, font, color });
      ctx.y -= size + 3;
      line = w;
    } else {
      line = test;
    }
  }

  if (line) {
    ensure(ctx, size + 2);
    ctx.page.drawText(line, { x: MARGIN + indent, y: ctx.y, size, font, color });
    ctx.y -= size + gap;
  }
}

function heading(ctx: Ctx, label: string): void {
  ensure(ctx, 32);
  ctx.y -= 8;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y + 12 },
    end: { x: A4[0] - MARGIN, y: ctx.y + 12 },
    thickness: 0.5,
    color: RULE,
  });
  ctx.page.drawText(sanitize(label).toUpperCase(), {
    x: MARGIN,
    y: ctx.y,
    size: 8.5,
    font: ctx.bold,
    color: ACCENT,
  });
  ctx.y -= 12;
}

function bullets(ctx: Ctx, items: string[], color: Rgb = INK): void {
  for (const item of items) {
    ensure(ctx, 16);
    ctx.page.drawText("-", { x: MARGIN, y: ctx.y, size: 10, font: ctx.bold, color });
    text(ctx, item, { indent: 12, gap: 3 });
  }
}

export interface PdfInput {
  project: ProjectContext;
  report: FinalReport;
  metrics: SpeechMetrics;
  webcam: WebcamResult;
  transcript: TranscriptTurn[];
  hasRecording: boolean;
}

export async function buildReportPDF(input: PdfInput): Promise<Uint8Array> {
  const { project, report, webcam } = input;
  const student = report.studentCommunication;

  const { PDFDocument, StandardFonts } = await import("pdf-lib");

  const doc = await PDFDocument.create();
  doc.setTitle(`ConvoScape - ${sanitize(project.name)}`);
  doc.setSubject("Student Communication Report");
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

  // Title block
  ctx.page.drawText("CONVOSCAPE STUDENT COMMUNICATION REPORT", {
    x: MARGIN,
    y: ctx.y - 10,
    size: 9,
    font: bold,
    color: ACCENT,
  });
  ctx.y -= 26;
  text(ctx, project.name || "Practice Session", { size: 20, font: bold });
  ctx.y -= 2;

  const meta = [
    project.domain,
    project.userName,
    project.college,
    new Date(report.generatedAt ?? Date.now()).toLocaleDateString(),
  ]
    .filter(Boolean)
    .join("  |  ");
  text(ctx, meta, { size: 8.5, color: MUTED });

  if (student) {
    heading(ctx, `Overall Performance: ${student.overallScore}/100`);
    text(ctx, student.overallSummary, { size: 10.5, gap: 6 });

    // Category breakdown
    heading(ctx, "Category Performance");
    const categories = [
      ["Clarity", student.categoryScores.clarity],
      ["Relevance", student.categoryScores.relevance],
      ["Structure", student.categoryScores.structure],
      ["Technical Communication", student.categoryScores.technicalCommunication],
      ["Spontaneous Thinking", student.categoryScores.spontaneousThinking],
      ["Conciseness", student.categoryScores.conciseness],
    ] as const;

    categories.forEach(([cat, score]) => {
      text(ctx, `${cat}: ${score}/100`, { size: 9, font: bold, gap: 2 });
    });

    if (student.strengths?.length) {
      heading(ctx, "Personal Strengths");
      bullets(ctx, student.strengths, GOOD);
    }

    if (student.recurringWeaknesses?.length) {
      heading(ctx, "Areas for Improvement");
      bullets(ctx, student.recurringWeaknesses, WARN);
    }

    if (student.questionAnalysis?.length) {
      heading(ctx, "Question Analysis (Q1 - Q10)");
      student.questionAnalysis.forEach((q) => {
        ensure(ctx, 35);
        text(ctx, `Q${q.questionNumber}: Score ${q.score}/100`, {
          size: 9.5,
          font: bold,
          gap: 2,
        });
        if (q.betterApproach) {
          text(ctx, `Approach: ${q.betterApproach}`, {
            size: 8.5,
            indent: 8,
            color: ACCENT,
            gap: 4,
          });
        }
      });
    }
  }

  // Camera Presence
  heading(ctx, "Camera & Speech Presence");
  if (webcam.enabled) {
    text(ctx, `Camera enabled — Forward-facing ratio: ${(webcam.forwardFacingRatio * 100).toFixed(0)}%`);
  } else {
    text(ctx, "Camera analysis was not enabled for this session (no score penalty applied).", {
      color: MUTED,
    });
  }

  // Footers
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

export async function downloadReportPDF(input: PdfInput): Promise<void> {
  const bytes = await buildReportPDF(input);
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: "application/pdf" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `convoscape-${projectToSlug(input.project.name)}-report.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function projectToSlug(s: string): string {
  return (s || "session").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}
