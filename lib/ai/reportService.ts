/**
 * reportService.ts
 * ---------------------------------------------------------------------------
 * SERVER-ONLY. One Gemini call combining the transcript, deterministic speech
 * metrics, the per-turn scores already collected during the conversation, and
 * optional webcam metrics, into the structured coaching report.
 *
 * THIS FUNCTION NEVER THROWS. The spec is explicit that the user must always
 * receive a report, and a black screen reading "Gemini response was not valid
 * JSON" is the exact outcome to design against. If the AI call fails for any
 * reason — network, quota, timeout, malformed output surviving both parse
 * attempts — we fall through to buildFallbackReport(), which assembles a real
 * report from measured data and flags itself as degraded.
 *
 * Honesty is enforced structurally rather than by asking nicely: every item in
 * whatYouDidWell / whatYouMissed must cite a specific moment, and
 * questionBreakdown requires a stronger rewrite of the user's OWN answer, which
 * is hard to fake generically.
 */

import "server-only";
import { generateJSON, zodValidator } from "./geminiClient";
import { coachingReportSchema } from "./schemas";
import { buildFallbackReport } from "./fallbackReport";
import {
  computeDurations,
  type CoachingReport,
  type InterruptionMetrics,
  type ProjectContext,
  type SessionTimestamps,
  type SpeechMetrics,
  type TranscriptTurn,
  type WebcamResult,
} from "@/lib/session/sessionTypes";
import { describeInterruptions } from "@/lib/speech/interruptionTracker";

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    narrativeSummary: { type: "string" },
    overall: {
      type: "object",
      properties: {
        communicationScore: { type: "integer" },
        technicalExplanationScore: { type: "integer" },
        clarityScore: { type: "integer" },
        confidenceScore: { type: "integer" },
        questionHandlingScore: { type: "integer" },
        specificityScore: { type: "integer" },
        structureScore: { type: "integer" },
        relevanceScore: { type: "integer" },
      },
      required: [
        "communicationScore", "technicalExplanationScore", "clarityScore",
        "confidenceScore", "questionHandlingScore", "specificityScore",
        "structureScore", "relevanceScore",
      ],
    },
    whatYouDidWell: { type: "array", items: { type: "string" } },
    whatYouMissed: { type: "array", items: { type: "string" } },
    communicationAnalysis: { type: "string" },
    technicalCommunication: { type: "string" },
    questionBreakdown: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          answerSummary: { type: "string" },
          whatWasGood: { type: "string" },
          whatWasWeak: { type: "string" },
          whatTheJudgeWasTesting: { type: "string" },
          strongerAnswer: { type: "string" },
        },
        required: [
          "question", "answerSummary", "whatWasGood",
          "whatWasWeak", "whatTheJudgeWasTesting", "strongerAnswer",
        ],
      },
    },
    speakingPatterns: { type: "string" },
    answerQuality: { type: "string" },
    bodyLanguage: { type: "string", nullable: true },
    mostImportantImprovement: { type: "string" },
    howToPractice: { type: "string" },
    repetitionAnalysis: {
      type: "string",
      description: "Distinguish hesitation-driven repetition from deliberate emphasis and from correct reuse of the project's own vocabulary. Never tell the student to stop naming their own project.",
    },
  },
  required: [
    "narrativeSummary", "overall", "whatYouDidWell", "whatYouMissed",
    "communicationAnalysis", "technicalCommunication", "questionBreakdown",
    "speakingPatterns", "answerQuality", "mostImportantImprovement", "howToPractice",
    "repetitionAnalysis",
  ],
  propertyOrdering: [
    "narrativeSummary", "overall", "whatYouDidWell", "whatYouMissed",
    "communicationAnalysis", "technicalCommunication", "speakingPatterns",
    "answerQuality", "bodyLanguage", "mostImportantImprovement",
    "howToPractice", "repetitionAnalysis", "questionBreakdown",
  ],
};

const SYSTEM = `You are an experienced, honest presentation coach reviewing a student's hackathon practice session: first a casual conversation with a peer, then a judging panel that heard a short presentation and asked questions.

RULES:
- Be direct and evidence-based. Never inflate scores to be encouraging. A weak answer must be named as weak, with the specific thing that was missing.
- Every claim must be traceable to the transcript or the metrics provided. Never invent details, features, or quotes.
- In questionBreakdown, "strongerAnswer" must rewrite the student's OWN answer using their REAL project. Never invent capabilities they didn't mention.
- Explain WHY something was weak and what it cost them, not just that it was weak.
- Write like a human mentor talking to the student, using "you". Not a graded rubric.
- If camera metrics are absent, set bodyLanguage to null and never mention body language or the camera.
- Never diagnose emotional or psychological states. Say "your head turned away frequently", never "you were nervous".
- Use the pre-computed speech metrics as given. Do not recompute or contradict them.

FOR EVERY SIGNIFICANT WEAKNESS you must cover four things, in prose rather than as labelled fields: WHAT happened (quote or closely paraphrase the moment), WHY it costs them (what the judge concluded or couldn't conclude), HOW to fix it (a concrete structural change), and a BETTER VERSION written using their REAL project. Never write a bare score with no explanation attached. "Clarity: 6/10" on its own is a failure of this instruction.

On repetition: immediate repeats ("I, I think") signal hesitation. Repeating the project's own name or technical vocabulary is CORRECT and consistent — never flag it as a problem or tell them to vary it.`;

function formatTranscript(transcript: TranscriptTurn[]): string {
  return transcript
    .filter((t) => t.speaker !== "system")
    .map((t) => {
      const label = t.speaker === "user" ? "STUDENT" : t.speaker.toUpperCase();
      const scores = t.evaluation
        ? ` [live scoring — relevance ${t.evaluation.relevance}, clarity ${t.evaluation.clarity}, specificity ${t.evaluation.specificity}, technicalDepth ${t.evaluation.technicalDepth}]`
        : "";
      return `[${t.stage}] ${label}: ${t.text}${scores}`;
    })
    .join("\n");
}

function formatSpeechMetrics(m: SpeechMetrics): string {
  const fillers =
    Object.entries(m.fillerWordCounts).map(([w, c]) => `${w}×${c}`).join(", ") || "none detected";
  return [
    `Total responses: ${m.totalResponses}`,
    `Average words per response: ${m.avgWordsPerResponse.toFixed(0)}`,
    m.wordsPerMinute != null
      ? `Speaking pace: ${m.wordsPerMinute.toFixed(0)} words/min`
      : "Speaking pace: unavailable (typed input)",
    `Average response delay: ${(m.avgResponseTimeMs / 1000).toFixed(1)}s`,
    `Filler words: ${fillers} (total ${m.totalFillerWords})`,
    `Long pauses before answering: ${m.longPauseCount}`,
    `Very short answers (<8 words): ${m.shortAnswerCount}`,
    `Very long answers (>120 words): ${m.longAnswerCount}`,
  ].join("\n");
}

function formatRepetition(m: SpeechMetrics): string {
  const r = m.repetition;
  if (!r) return "Not analysed.";
  const lines = [
    `Immediate repeats (hesitation signal): ${r.repeatedWordCount}`,
    r.topRepeatedWords.length
      ? `Most repeated: ${r.topRepeatedWords.map((w) => `"${w.text}" x${w.count}`).join(", ")}`
      : `No immediate word repeats detected.`,
    r.topRepeatedPhrases.length
      ? `Repeated phrases: ${r.topRepeatedPhrases.map((p) => `"${p.text}" x${p.count}`).join(", ")}`
      : `No repeated phrases detected.`,
  ];
  if (r.domainTermRepeats.length) {
    lines.push(
      `Project vocabulary repeated (this is CORRECT, do not criticise it): ${r.domainTermRepeats
        .map((w) => `${w.text} x${w.count}`)
        .join(", ")}`
    );
  }
  return lines.join("\n");
}

function formatWebcam(w: WebcamResult): string {
  if (!w.enabled) return "Camera was NOT enabled. Set bodyLanguage to null and do not mention it.";
  return [
    `Camera was enabled.`,
    `Forward-facing ratio: ${(w.forwardFacingRatio * 100).toFixed(0)}%`,
    `Average head turn: ${w.averageHeadTurnDegrees.toFixed(0)} degrees`,
    `Blink rate: ${w.blinkRatePerMinute.toFixed(0)}/min`,
    `Samples: ${w.sampleCount}`,
  ].join("\n");
}

export interface ReportInput {
  project: ProjectContext;
  transcript: TranscriptTurn[];
  speechMetrics: SpeechMetrics;
  webcam: WebcamResult;
  sessionId?: string;
  timestamps?: SessionTimestamps;
  interruptions?: InterruptionMetrics;
}

export async function generateReport(input: ReportInput): Promise<CoachingReport> {
  const userMessage = `PROJECT
Title: ${input.project.name}
Domain: ${input.project.domain}
Student: ${input.project.userName || "(unknown)"} — ${input.project.college || "(college unknown)"}
Description: ${input.project.description}
${input.project.problem ? `Problem: ${input.project.problem}` : ""}
${input.project.stack ? `Stack: ${input.project.stack}` : ""}

FULL TRANSCRIPT
${formatTranscript(input.transcript)}

SPEECH METRICS (pre-computed — use these numbers directly)
${formatSpeechMetrics(input.speechMetrics)}

REPETITION (pre-computed)
${formatRepetition(input.speechMetrics)}

CAMERA METRICS
${formatWebcam(input.webcam)}

Produce the coaching report as structured JSON. In questionBreakdown, cover the 3-5 most significant judge questions.`;

  try {
    const report = await generateJSON(
      {
        systemInstruction: SYSTEM,
        history: [],
        userMessage,
        responseSchema: REPORT_SCHEMA,
        temperature: 0.6,
        maxOutputTokens: 3000,
        timeoutMs: 45_000,
      },
      zodValidator(coachingReportSchema)
    );

    const normalised: CoachingReport = {
      ...report,
      sessionId: input.sessionId,
      generatedAt: new Date().toISOString(),
      durations: input.timestamps ? computeDurations(input.timestamps) : undefined,
      interruptionNotes: input.interruptions
        ? describeInterruptions(input.interruptions)
        : undefined,
      bodyLanguage: input.webcam.enabled ? (report.bodyLanguage ?? null) : null,
      isFallback: false,
    };
    return normalised;
  } catch {
    // Deliberately swallowed. The caller's job is to always return a report;
    // an error here means the AI layer is unavailable, not that the session's
    // measured data is gone. The fallback flags itself as degraded.
    return {
      ...buildFallbackReport(input.project, input.transcript, input.speechMetrics, input.webcam),
      sessionId: input.sessionId,
      generatedAt: new Date().toISOString(),
      durations: input.timestamps ? computeDurations(input.timestamps) : undefined,
      interruptionNotes: input.interruptions
        ? describeInterruptions(input.interruptions)
        : undefined,
    };
  }
}
