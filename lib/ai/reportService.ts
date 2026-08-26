/**
 * reportService.ts
 * ---------------------------------------------------------------------------
 * SERVER-ONLY. Evaluates the completed Rahul conversation session and generates
 * the structured Student Communication Report.
 *
 * GUARANTEES:
 * 1. Single Gemini call per session — cached by sessionId.
 * 2. Compact token-efficient prompt (excludes internal logs, Wav2Lip, URLs).
 * 3. Token-optimized response (Gemini returns only analysis; frontend/server
 *    joins stored Q&A).
 * 4. Privacy-first camera integration: receives only aggregate numerical metrics
 *    (zero raw frames/images ever uploaded).
 * 5. Strictly objective behavioral feedback (no confidence or emotion mind-reading).
 * 6. Never throws — falls back to deterministic buildFallbackReport() if offline.
 */

import "server-only";
import { generateJSON, zodValidator } from "./geminiClient";
import { studentCommunicationReportSchema } from "./schemas";
import { buildFallbackReport } from "./fallbackReport";
import type {
  CompactQuestionTurn,
  CompactStudentReportInput,
  FinalReport,
  InterruptionMetrics,
  ProjectContext,
  SessionTimestamps,
  SpeechMetrics,
  StudentCommunicationReport,
  TranscriptTurn,
  WebcamResult,
} from "@/lib/session/sessionTypes";

// Server-side in-memory cache to prevent duplicate Gemini calls on page reload/navigation
const studentReportCache = new Map<string, StudentCommunicationReport>();

const STUDENT_REPORT_JSON_SCHEMA = {
  type: "object",
  properties: {
    reportType: { type: "string", enum: ["student_communication"] },
    overallScore: { type: "integer" },
    overallSummary: { type: "string" },
    categoryScores: {
      type: "object",
      properties: {
        clarity: { type: "integer" },
        relevance: { type: "integer" },
        structure: { type: "integer" },
        technicalCommunication: { type: "integer" },
        spontaneousThinking: { type: "integer" },
        conciseness: { type: "integer" },
      },
      required: [
        "clarity",
        "relevance",
        "structure",
        "technicalCommunication",
        "spontaneousThinking",
        "conciseness",
      ],
    },
    questionAnalysis: {
      type: "array",
      items: {
        type: "object",
        properties: {
          questionNumber: { type: "integer" },
          score: { type: "integer" },
          whatWorked: { type: "array", items: { type: "string" } },
          whatCouldImprove: { type: "array", items: { type: "string" } },
          betterApproach: { type: "string" },
          communicationTags: { type: "array", items: { type: "string" } },
        },
        required: [
          "questionNumber",
          "score",
          "whatWorked",
          "whatCouldImprove",
          "betterApproach",
          "communicationTags",
        ],
      },
    },
    strongestAnswers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          questionNumber: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["questionNumber", "reason"],
      },
    },
    answersNeedingImprovement: {
      type: "array",
      items: {
        type: "object",
        properties: {
          questionNumber: { type: "integer" },
          reason: { type: "string" },
          improvement: { type: "string" },
        },
        required: ["questionNumber", "reason", "improvement"],
      },
    },
    strengths: { type: "array", items: { type: "string" } },
    recurringWeaknesses: { type: "array", items: { type: "string" } },
    unexpectedQuestionPerformance: {
      type: "object",
      properties: {
        score: { type: "integer" },
        summary: { type: "string" },
        observations: { type: "array", items: { type: "string" } },
      },
      required: ["score", "summary", "observations"],
    },
    technicalCommunication: {
      type: "object",
      properties: {
        score: { type: "integer" },
        summary: { type: "string" },
        strengths: { type: "array", items: { type: "string" } },
        improvements: { type: "array", items: { type: "string" } },
      },
      required: ["score", "summary", "strengths", "improvements"],
    },
    improvementPlan: {
      type: "array",
      items: {
        type: "object",
        properties: {
          priority: { type: "integer" },
          area: { type: "string" },
          whyItMatters: { type: "string" },
          howToPractice: { type: "string" },
        },
        required: ["priority", "area", "whyItMatters", "howToPractice"],
      },
    },
    nextSessionGoals: { type: "array", items: { type: "string" } },
    cameraAnalysis: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        eyeContactRatio: { type: "number" },
        forwardFacingRatio: { type: "number" },
        faceDetectedRatio: { type: "number" },
        headOrientation: {
          type: "object",
          properties: {
            forwardRatio: { type: "number" },
            leftRatio: { type: "number" },
            rightRatio: { type: "number" },
            upRatio: { type: "number" },
            downRatio: { type: "number" },
          },
        },
        interruptions: {
          type: "object",
          properties: {
            faceLostCount: { type: "number" },
            prolongedLookAwayCount: { type: "number" },
          },
        },
        observations: { type: "string" },
        note: { type: "string" },
      },
      nullable: true,
    },
  },
  required: [
    "reportType",
    "overallScore",
    "overallSummary",
    "categoryScores",
    "questionAnalysis",
    "strongestAnswers",
    "answersNeedingImprovement",
    "strengths",
    "recurringWeaknesses",
    "unexpectedQuestionPerformance",
    "technicalCommunication",
    "improvementPlan",
    "nextSessionGoals",
  ],
};

const SYSTEM_INSTRUCTION = `You are ConvoScape's communication coach reviewing a student's simulated conversation with Rahul, a friendly 3rd-year CS student who asked about the student's project.

YOUR ROLE:
- Your job is NOT to judge whether the project idea is good or bad.
- Your job is to evaluate how effectively the student COMMUNICATED their project and handled unexpected questions across questions Q1 to Q10.
- Be constructive, specific, encouraging, and evidence-based. Do not act like a strict examiner or criticize the student personally.
- Ground every weakness in the student's actual responses.

CRITICAL INSTRUCTIONS:
1. In questionAnalysis, evaluate all 10 questions (Q1 to Q10).
2. DO NOT echo back the full question or full answer in your output (the frontend already stores them). Only return your analysis: score (0-100), whatWorked, whatCouldImprove, betterApproach, and communicationTags.
3. Distinguish between:
   a. Technical knowledge (how well they understand their architecture/stack)
   b. Ability to COMMUNICATE technical knowledge (crispness, clarity, avoiding jargon traps).
4. Evaluate spontaneous thinking on unexpected/tailored follow-ups (Q2, Q4, Q6, Q8, Q10).
5. Identify the Top 3 strongest answers and Top 3 answers needing improvement with actionable reasons.
6. Provide an improvement plan and 4 actionable next session goals.

CAMERA ANALYSIS RULES (STRICT):
- If camera.enabled === false: Output cameraAnalysis: null. NEVER invent camera observations or penalize overall scores.
- If camera.enabled === true:
  * Describe observations as "Camera-facing / apparent eye-contact consistency" and note that it is an approximation based on facial orientation and gaze landmarks.
  * Cite the supplied numerical metrics (e.g. eyeContactRatio, forwardFacingRatio, faceDetectedRatio).
  * STRICT PROHIBITION: DO NOT calculate or claim any "confidence score" (e.g. "You were 72% confident"). DO NOT attempt psychological mind-reading (e.g. "nervous", "anxious", "dishonest").
  * Ground feedback strictly in observable presentation habits (e.g., "Your camera-facing consistency was ~74%, with occasional glances away while recalling architecture details").
7. Return valid JSON only conforming to the schema.`;

/**
 * Builds a clean, compact input object from the raw session data,
 * filtering out non-Q1..Q10 dialogue and internal state.
 */
export function buildStudentReportInput(
  project: ProjectContext,
  transcript: TranscriptTurn[],
  speechMetrics?: SpeechMetrics,
  webcam?: WebcamResult,
  sessionId?: string
): CompactStudentReportInput {
  const userTurns = transcript.filter((t) => t.speaker === "user");
  const characterTurns = transcript.filter(
    (t) => t.speaker === "rahul" || t.kind === "CHARACTER_DIALOGUE"
  );

  const conversation: CompactQuestionTurn[] = [];

  for (let i = 1; i <= 10; i++) {
    const isTailored = i % 2 === 0;
    const rahulTurn = characterTurns[i];
    const userTurn = userTurns[i];

    const question = rahulTurn?.text || `Question ${i}`;
    const answer = userTurn?.text || userTurns[i - 1]?.text || "(No answer recorded)";
    const durationSeconds =
      userTurn?.startTime && userTurn?.endTime
        ? Math.max(1, Math.round((userTurn.endTime - userTurn.startTime) / 1000))
        : undefined;

    conversation.push({
      questionNumber: i,
      questionType: isTailored ? "tailored" : "pre_generated",
      question,
      answer,
      answerDurationSeconds: durationSeconds,
    });
  }

  const cameraEnabled = !!webcam?.enabled;
  const cameraMetrics =
    cameraEnabled && "samplesAnalyzed" in webcam
      ? {
          samplesAnalyzed: webcam.samplesAnalyzed,
          faceDetectedRatio: webcam.faceDetectedRatio,
          faceNotDetectedRatio: webcam.faceNotDetectedRatio,
          eyeContactRatio: webcam.eyeContactRatio,
          lookingAwayRatio: webcam.lookingAwayRatio,
          forwardFacingRatio: webcam.forwardFacingRatio,
          headOrientation: webcam.headOrientation,
          interruptions: webcam.interruptions,
          analysisDurationSeconds: webcam.analysisDurationSeconds,
        }
      : null;

  return {
    reportType: "student_communication",
    sessionId,
    project: {
      name: project.name,
      domain: project.domain,
      problem: project.problem,
      motivation: project.topic,
      techStack: project.stack,
    },
    conversation,
    speechMetrics: speechMetrics
      ? {
          wordsPerMinute: speechMetrics.wordsPerMinute,
          avgResponseDelaySec: Math.round((speechMetrics.avgResponseTimeMs / 1000) * 10) / 10,
          totalFillerWords: speechMetrics.totalFillerWords,
        }
      : null,
    camera: {
      enabled: cameraEnabled,
      metrics: cameraMetrics,
    },
  };
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

export async function generateStudentReport(
  compactInput: CompactStudentReportInput,
  project: ProjectContext,
  transcript: TranscriptTurn[],
  speechMetrics: SpeechMetrics,
  webcam: WebcamResult
): Promise<StudentCommunicationReport> {
  const sessionId = compactInput.sessionId;

  // 1. Check in-memory server cache first
  if (sessionId && studentReportCache.has(sessionId)) {
    return studentReportCache.get(sessionId)!;
  }

  const prompt = [
    "STUDENT PROJECT DETAILS:",
    JSON.stringify(compactInput.project, null, 2),
    "",
    "CONVERSATION (Q1 to Q10):",
    JSON.stringify(compactInput.conversation, null, 2),
    "",
    "SPEECH & TIMING CONTEXT:",
    JSON.stringify(compactInput.speechMetrics || {}, null, 2),
    "",
    "CAMERA ANALYSIS CONTEXT:",
    JSON.stringify(compactInput.camera, null, 2),
    "",
    "TASK: Generate the structured student communication report JSON.",
  ].join("\n");

  try {
    const report = await generateJSON<StudentCommunicationReport>(
      {
        systemInstruction: SYSTEM_INSTRUCTION,
        history: [],
        userMessage: prompt,
        responseSchema: STUDENT_REPORT_JSON_SCHEMA,
        temperature: 0.6,
        maxOutputTokens: 3000,
        timeoutMs: 35_000,
      },
      zodValidator(studentCommunicationReportSchema)
    );

    // Save to server cache
    if (sessionId) {
      studentReportCache.set(sessionId, report);
    }

    return report;
  } catch (err) {
    console.warn(
      "[ReportService] Gemini student report generation failed, using fallback:",
      err
    );
    const fallback = buildFallbackReport(project, transcript, speechMetrics, webcam);
    return fallback.studentCommunication;
  }
}

/**
 * Main report generation entry point.
 */
export async function generateReport(input: ReportInput): Promise<FinalReport> {
  const compactInput = buildStudentReportInput(
    input.project,
    input.transcript,
    input.speechMetrics,
    input.webcam,
    input.sessionId
  );

  const studentCommunication = await generateStudentReport(
    compactInput,
    input.project,
    input.transcript,
    input.speechMetrics,
    input.webcam
  );

  return {
    sessionId: input.sessionId,
    generatedAt: new Date().toISOString(),
    project: input.project,
    studentCommunication,
    judgesFeedback: null,
    combinedSummary: null,
    isFallback: false,
  };
}
