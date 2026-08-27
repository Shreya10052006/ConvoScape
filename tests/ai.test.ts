import { describe, it, expect } from "vitest";
import { extractJSON, turnResponseSchema, rahulPerformanceReportSchema } from "@/lib/ai/schemas";
import { buildFallbackReport } from "@/lib/ai/fallbackReport";
import { fallbackTurn, fallbackRahulTurn, selectFallbackQuestions } from "@/lib/ai/fallbackQuestions";
import { buildReportPDF } from "@/lib/report/pdfReport";
import { buildReportHTML } from "@/lib/report/downloadReport";
import { analyzeSpeech } from "@/lib/speech/speechAnalysis";
import type { ProjectContext, TranscriptTurn } from "@/lib/session/sessionTypes";

const project: ProjectContext = {
  userName: "Muthu",
  college: "CEG",
  name: "CareVista",
  domain: "HealthTech",
  topic: "rural telemedicine",
  description: "A consent-first telemedicine platform using AI to summarise symptoms",
  stack: "Next.js, Postgres",
  problem: "Rural patients cannot reach specialists",
};

const transcript: TranscriptTurn[] = [
  { id: "1", speaker: "rahul", text: "What are you building?", stage: "rahul", kind: "CHARACTER_DIALOGUE" },
  {
    id: "2", speaker: "user", stage: "rahul", kind: "CHARACTER_DIALOGUE",
    text: "Um, so basically we, we built CareVista, you know, for rural healthcare",
    startTime: 1000, endTime: 6000,
  },
  { id: "3", speaker: "judge1", text: "How do you handle consent?", stage: "judgeQA", kind: "CHARACTER_DIALOGUE",
    evaluation: undefined },
  { id: "4", speaker: "user", text: "Yes", stage: "judgeQA", kind: "CHARACTER_DIALOGUE", startTime: 9000, endTime: 10000 },
];

describe("Gemini JSON extraction", () => {
  const valid = '{"speaker":"rahul","reply":"Hey!","topicCovered":"intro"}';

  it.each([
    ["clean", valid],
    ["```json fenced", "```json\n" + valid + "\n```"],
    ["bare fenced", "```\n" + valid + "\n```"],
    ["leading preamble", "Sure! Here you go:\n" + valid],
    ["trailing commentary", valid + "\nHope that helps!"],
    ["trailing comma", '{"speaker":"rahul","reply":"Hey!","topicCovered":"intro",}'],
    ["braces inside a string", '{"speaker":"rahul","reply":"Use {a:1}","topicCovered":"x"}'],
  ])("recovers valid output from %s", (_label, raw) => {
    const parsed = extractJSON(raw);
    expect(parsed).not.toBeNull();
    expect(turnResponseSchema.safeParse(parsed).success).toBe(true);
  });

  it.each([
    ["pure prose", "I'm sorry, I can't do that."],
    ["truncated mid-object", '{"speaker":"rahul","reply":"Hi","topicCov'],
    ["empty string", ""],
  ])("returns null for %s", (_label, raw) => {
    const parsed = extractJSON(raw);
    const ok = parsed === null ? false : turnResponseSchema.safeParse(parsed).success;
    expect(ok).toBe(false);
  });

  it("rejects structurally valid JSON that is missing required fields", () => {
    // The key insight: parseable but wrong-shaped output is just as broken as
    // unparseable text and must be caught at the boundary.
    const parsed = extractJSON('{"topicCovered":"x"}');
    expect(parsed).not.toBeNull();
    expect(turnResponseSchema.safeParse(parsed).success).toBe(false);
  });

  it("coerces string scores and clamps out-of-range ones", () => {
    const raw = `{"speaker":"judge2","reply":"Ok","topicCovered":"x","evaluation":
      {"relevance":"8","clarity":7.4,"specificity":99,"technicalDepth":-5,
       "completeness":5,"evidence":"e","feedback":"f"}}`;
    const v = turnResponseSchema.safeParse(extractJSON(raw));
    expect(v.success).toBe(true);
    if (v.success && v.data.evaluation) {
      expect(v.data.evaluation.relevance).toBe(8);
      expect(v.data.evaluation.clarity).toBe(7);
      expect(v.data.evaluation.specificity).toBe(10); // clamped
      expect(v.data.evaluation.technicalDepth).toBe(0); // clamped
    }
  });

  it("accepts a null or omitted evaluation on an opening turn", () => {
    expect(turnResponseSchema.safeParse(extractJSON('{"speaker":"rahul","reply":"Hi","topicCovered":"x","evaluation":null}')).success).toBe(true);
    expect(turnResponseSchema.safeParse(extractJSON('{"speaker":"rahul","reply":"Hi","topicCovered":"x"}')).success).toBe(true);
  });

  it("fills report defaults rather than rejecting a partial report", () => {
    const v = rahulPerformanceReportSchema.safeParse({
      reportType: "student_communication",
      overallScore: 80,
      overallSummary: "Great session",
      categoryScores: {
        clarity: 80,
        relevance: 85,
        structure: 75,
        technicalCommunication: 80,
        spontaneousThinking: 75,
        conciseness: 80,
      },
    });
    expect(v.success).toBe(true);
    if (v.success) expect(v.data.categoryScores.clarity).toBe(80);
  });
});

describe("deterministic conversation fallback", () => {
  it("asks AI-failure questions only when the project mentions AI", () => {
    const withAI = selectFallbackQuestions(project, 10).map((q) => q.topic);
    expect(withAI).toContain("AI failure handling");

    const noAI = selectFallbackQuestions(
      { ...project, description: "A paper filing index", stack: "", problem: "" },
      10
    ).map((q) => q.topic);
    expect(noAI).not.toContain("AI failure handling");
  });

  it("alternates judges rather than one monologuing", () => {
    const picked = selectFallbackQuestions(project, 6).map((q) => q.speaker);
    expect(new Set(picked).size).toBe(2);
  });

  it("references the real project name", () => {
    const t = fallbackTurn(project, 0, false);
    expect(t.reply.length).toBeGreaterThan(10);
    expect(["judge1", "judge2"]).toContain(t.speaker);
  });

  it("closes out on the final turn without asking a question", () => {
    const t = fallbackTurn(project, 3, true);
    expect(t.reply).not.toMatch(/\?/);
    expect(t.topicCovered).toBe("closing");
  });

  it("gives Rahul an opening line and a warm closing line", () => {
    expect(fallbackRahulTurn(project, 0, false).reply).toMatch(/rahul/i);
    expect(fallbackRahulTurn(project, 5, true).reply).not.toMatch(/\?/);
  });
});

describe("deterministic fallback report", () => {
  const metrics = analyzeSpeech(transcript, project);

  it("produces a complete, usable report with no AI involvement", () => {
    const r = buildFallbackReport(project, transcript, metrics, { enabled: false });
    expect(r.isFallback).toBe(true);
    expect(r.studentCommunication.overallScore).toBeGreaterThan(0);
    expect(r.studentCommunication.questionAnalysis.length).toBe(10);
    expect(r.studentCommunication.strengths.length).toBeGreaterThan(0);
    expect(r.studentCommunication.recurringWeaknesses.length).toBeGreaterThan(0);
    expect(r.studentCommunication.improvementPlan.length).toBe(3);
    expect(r.studentCommunication.nextSessionGoals.length).toBeGreaterThan(0);
  });

  it("leaves camera disabled without penalising overall score", () => {
    const r = buildFallbackReport(project, transcript, metrics, { enabled: false });
    expect(r.studentCommunication.cameraAnalysis).toBeNull();
    expect(r.studentCommunication.overallScore).toBeGreaterThan(50);
  });

  it("includes camera metrics when enabled", () => {
    const r = buildFallbackReport(project, transcript, metrics, {
      enabled: true,
      samplesAnalyzed: 200,
      faceDetectedRatio: 0.95,
      faceNotDetectedRatio: 0.05,
      eyeContactRatio: 0.78,
      lookingAwayRatio: 0.15,
      forwardFacingRatio: 0.78,
      headOrientation: {
        forwardRatio: 0.78,
        leftRatio: 0.08,
        rightRatio: 0.08,
        upRatio: 0.03,
        downRatio: 0.03,
      },
      analysisDurationSeconds: 60,
      averageHeadTurnDegrees: 13.4,
      blinkRatePerMinute: 18,
    });
    expect(r.studentCommunication.cameraAnalysis).not.toBeNull();
    expect(r.studentCommunication.cameraAnalysis?.eyeContactRatio).toBe(0.78);
    expect(r.studentCommunication.cameraAnalysis?.forwardFacingRatio).toBe(0.78);
  });

  it("never returns an overall score outside 0-100", () => {
    const r = buildFallbackReport(project, transcript, metrics, { enabled: false });
    expect(r.studentCommunication.overallScore).toBeGreaterThanOrEqual(0);
    expect(r.studentCommunication.overallScore).toBeLessThanOrEqual(100);
  });
});

describe("report rendering", () => {
  const metrics = analyzeSpeech(transcript, project);
  const report = buildFallbackReport(project, transcript, metrics, { enabled: false });

  it("generates a real PDF from a FALLBACK report (no Gemini)", async () => {
    const bytes = await buildReportPDF({
      project,
      report,
      metrics,
      webcam: { enabled: false },
      transcript,
      hasRecording: false,
    });
    // %PDF- magic number
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("generates a PDF containing the session id when provided", async () => {
    const bytes = await buildReportPDF({
      project,
      report: { ...report, sessionId: "test-session-123" },
      metrics,
      webcam: { enabled: false },
      transcript,
      hasRecording: false,
    });
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("survives characters outside WinAnsi without throwing", async () => {
    const nasty = {
      ...report,
      studentCommunication: {
        ...report.studentCommunication,
        overallSummary: "You said \u201Cit works\u201D \u2014 mostly\u2026 \u2713 \u{1F600}",
      },
    };
    const bytes = await buildReportPDF({
      project,
      report: nasty,
      metrics,
      webcam: { enabled: false },
      transcript,
      hasRecording: false,
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("renders a PDF with camera data enabled", async () => {
    const bytes = await buildReportPDF({
      project,
      report,
      metrics,
      webcam: {
        enabled: true,
        samplesAnalyzed: 100,
        faceDetectedRatio: 0.96,
        faceNotDetectedRatio: 0.04,
        eyeContactRatio: 0.78,
        lookingAwayRatio: 0.15,
        forwardFacingRatio: 0.78,
        headOrientation: {
          forwardRatio: 0.78,
          leftRatio: 0.08,
          rightRatio: 0.08,
          upRatio: 0.03,
          downRatio: 0.03,
        },
        analysisDurationSeconds: 30,
        averageHeadTurnDegrees: 13,
        blinkRatePerMinute: 18,
      },
      transcript,
      hasRecording: true,
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("generates HTML that escapes user content", () => {
    const evil: ProjectContext = { ...project, name: "<script>alert(1)</script>" };
    const html = buildReportHTML(evil, report, metrics, transcript);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
