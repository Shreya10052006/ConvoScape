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
  JudgesEvaluationReport,
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

const SYSTEM_INSTRUCTION = `You are ConvoScape's communication coach reviewing a student's simulated conversation with Rahul, a friendly 3rd-year CS student who asked about the student's hackathon project across Q1 to Q10.

PURPOSE:
ConvoScape is a communication-skills practice environment. Your feedback is evaluated on how faithfully you analyze the student's ACTUAL spoken communication behavior (captured raw transcript, fillers, stutters, repetitions, false starts, and speech pauses) rather than judging project merits.

EVALUATION CRITERIA:
1. Clarity & Structure: Did the student structure explanations logically (e.g. direct answer first, followed by mechanism and outcome)?
2. Relevance & Responsiveness: Did answers directly address Rahul's specific question?
3. Technical Communication: Ability to explain technical ideas simply, avoiding jargon traps, and articulating architecture choices and trade-offs clearly.
4. Fluency & Speech Habits:
   - Filler-word usage (um, uh, like, you know, basically, actually, so, I mean, etc.)
   - Repetition and stutters ("I think, I think...", "basically basically...")
   - False starts and restarted thoughts ("Our project is... actually, our project was...")
   - Hesitation and pauses between thoughts
   - Incomplete or abandoned thoughts
5. Spontaneous Thinking: Agility and adaptability when answering unexpected or tailored follow-up questions (Q2, Q4, Q6, Q8, Q10).
6. Conciseness: Avoiding rambling or over-explaining background context before answering.

CRITICAL RULES ON FILLERS & PAUSES (DO NOT OVER-PENALIZE):
- Natural conversational fillers are normal. Identify recurring patterns across answers rather than punishing isolated single occurrences.
- Pauses should not automatically be classified as poor communication. A thoughtful pause before an unexpected question is natural; focus on excessive or disruptive hesitation patterns.

EVIDENCE REQUIREMENT (GROUNDED IN USER'S ACTUAL SPEECH):
- Whenever highlighting what worked or what could improve, quote short verbatim excerpts from the student's raw responses (e.g., "Observed: 'Um, basically... like... our project...'").
- NEVER fabricate quotes or invent speech that was not present in the captured transcript.

OUTPUT SPECIFICATIONS:
1. In questionAnalysis, evaluate all 10 questions (Q1 to Q10).
2. DO NOT echo back the full question or full answer in your output (the client stores them). Only return your analysis: score (0-100), whatWorked, whatCouldImprove, betterApproach, and communicationTags.
3. Identify the Top 3 strongest answers and Top 3 answers needing improvement with actionable reasons.
4. Provide a structured 3-priority improvement plan and 4 actionable goals for the next session.

CAMERA ANALYSIS RULES (STRICT):
- If camera.enabled === false: Output cameraAnalysis: null. NEVER invent camera observations or penalize overall scores.
- If camera.enabled === true:
  * Describe observations as "Camera-facing / apparent eye-contact consistency" and cite the supplied numerical metrics (eyeContactRatio, forwardFacingRatio, faceDetectedRatio).
  * STRICT PROHIBITION: DO NOT calculate or claim any "confidence score". DO NOT attempt psychological mind-reading ("nervous", "anxious").
  * Ground feedback strictly in observable presentation habits.
5. Return valid JSON only conforming to the schema.`;

/**
 * Builds a clean, compact input object from the raw session data,
 * preserving authoritative raw transcripts and lightweight speech metrics.
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
    const rawAnswer = userTurn?.rawTranscript || userTurn?.text || userTurns[i - 1]?.rawTranscript || userTurns[i - 1]?.text || "(No answer recorded)";
    const normalizedAnswer = userTurn?.normalizedTranscript || (userTurn?.detailedAnswer?.normalizedTranscript ?? undefined);
    const detailedAnswer = userTurn?.detailedAnswer;

    const durationSeconds =
      detailedAnswer?.durationSeconds ??
      (userTurn?.startTime && userTurn?.endTime
        ? Math.max(1, Math.round((userTurn.endTime - userTurn.startTime) / 1000))
        : undefined);

    conversation.push({
      questionNumber: i,
      questionType: isTailored ? "tailored" : "pre_generated",
      question,
      answer: rawAnswer,
      rawTranscript: rawAnswer,
      // Intentionally omit normalizedTranscript and detailedAnswer from prompt to reduce tokens
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
          totalPauseCount: speechMetrics.totalPauseCount,
          longPauseCount: speechMetrics.longPauseCount,
          avgPauseDurationSec: speechMetrics.avgPauseDurationSeconds,
          falseStartCount: speechMetrics.falseStartCount,
          repeatedWordCount: speechMetrics.repetition?.repeatedWordCount,
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
    "CONVERSATION (Q1 to Q10) — each entry has the question text and the student's raw spoken answer:",
    JSON.stringify(
      compactInput.conversation.map((c) => ({
        questionNumber: c.questionNumber,
        questionType: c.questionType,
        question: c.question,
        rawAnswer: c.rawTranscript || c.answer,
        answerDurationSeconds: c.answerDurationSeconds,
      })),
      null,
      2
    ),
    "",
    "SPEECH & TIMING CONTEXT:",
    JSON.stringify(compactInput.speechMetrics || {}, null, 2),
    "",
    "CAMERA: disabled (do not analyze, set cameraAnalysis: null in output).",
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
        temperature: 0.5,
        maxOutputTokens: 2000,
        timeoutMs: 40_000,
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

const judgesReportCache = new Map<string, JudgesEvaluationReport>();

export const JUDGES_REPORT_SYSTEM_INSTRUCTION = `You are an elite hackathon judging panel evaluating a student's project and their technical responses to the judges' questions (Q1 through Q8).

You are providing an authoritative, structured Technical Evaluation Report for the team.

Evaluate the project and student responses across 5 core dimensions:
1. Technical Depth (architecture, implementation details, algorithm choices, stack fit)
2. Architecture & System Design (modularity, data flow, resilience, component boundaries)
3. Problem-Solving & Reasoning (practical trade-offs, defensive reasoning under challenging questions)
4. Feasibility & Practical Viability (real-world usability, deployment feasibility, resource constraints)
5. Presentation Clarity & Defense (how well the student explained and defended their engineering choices)

REQUIREMENTS:
- Score realistically from 0-100 (average solid hackathon project: 75-85, outstanding: 86-95, gaps: 60-74).
- For each question in questionAnalysis, provide specific observations and actionable technical recommendations.
- Identify top technical strengths and critical vulnerabilities/gaps.
- Evaluate edge-case handling and scalability with concrete pros and cons.
- Provide 2-4 high-priority, actionable recommendations for taking the project beyond the hackathon.

Return ONLY structured JSON adhering strictly to the schema.`;

export async function generateJudgesReport(input: {
  project: ProjectContext;
  judgeTurns?: CompactQuestionTurn[];
  sessionId?: string;
}): Promise<JudgesEvaluationReport> {
  const { project, judgeTurns = [], sessionId } = input;

  if (sessionId && judgesReportCache.has(sessionId)) {
    return judgesReportCache.get(sessionId)!;
  }

  const sections: string[] = [
    "HACKATHON PROJECT UNDER EVALUATION:",
    `Team/Project Name: ${project.name}`,
    `Domain: ${project.domain}`,
    `Description: ${project.description || project.topic}`,
    `Problem Addressed: ${project.problem || "Not specified"}`,
    `Tech Stack: ${project.stack || "Not specified"}`,
  ];

  if (judgeTurns.length > 0) {
    sections.push("\nJUDGE QUESTIONS & STUDENT SPOKEN RESPONSES:");
    for (const t of judgeTurns) {
      sections.push(
        `[Q${t.questionNumber}] Judge (${t.speaker}): "${t.questionText || ""}"\nStudent Answer: "${t.rawTranscript || t.userAnswer || ""}"`
      );
    }
  }

  const prompt = sections.join("\n\n");

  try {
    const { judgesEvaluationReportSchema } = await import("./schemas");
    const report = await generateJSON<JudgesEvaluationReport>(
      {
        systemInstruction: JUDGES_REPORT_SYSTEM_INSTRUCTION,
        history: [],
        userMessage: prompt,
        responseSchema: {
          type: "object",
          properties: {
            reportType: { type: "string", enum: ["judges_evaluation"] },
            overallHackathonScore: { type: "integer" },
            verdictSummary: { type: "string" },
            categoryScores: {
              type: "object",
              properties: {
                technicalDepth: { type: "integer" },
                architectureAndDesign: { type: "integer" },
                problemSolvingAndReasoning: { type: "integer" },
                feasibilityAndViability: { type: "integer" },
                presentationAndDefense: { type: "integer" },
              },
              required: [
                "technicalDepth",
                "architectureAndDesign",
                "problemSolvingAndReasoning",
                "feasibilityAndViability",
                "presentationAndDefense",
              ],
            },
            questionAnalysis: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  questionNumber: { type: "integer" },
                  score: { type: "integer" },
                  judgeName: { type: "string" },
                  questionTopic: { type: "string" },
                  technicalCritique: { type: "string" },
                  strengths: { type: "array", items: { type: "string" } },
                  areasToDeepen: { type: "array", items: { type: "string" } },
                  practicalRecommendation: { type: "string" },
                },
                required: ["questionNumber", "score", "judgeName", "questionTopic", "technicalCritique"],
              },
            },
            topTechnicalStrengths: { type: "array", items: { type: "string" } },
            criticalVulnerabilitiesOrGaps: { type: "array", items: { type: "string" } },
            edgeCaseHandlingAssessment: {
              type: "object",
              properties: {
                score: { type: "integer" },
                summary: { type: "string" },
                observations: { type: "array", items: { type: "string" } },
              },
              required: ["score", "summary", "observations"],
            },
            scalabilityAndArchitectureReview: {
              type: "object",
              properties: {
                score: { type: "integer" },
                summary: { type: "string" },
                pros: { type: "array", items: { type: "string" } },
                cons: { type: "array", items: { type: "string" } },
              },
              required: ["score", "summary", "pros", "cons"],
            },
            judgesRecommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  priority: { type: "integer" },
                  title: { type: "string" },
                  rationale: { type: "string" },
                  actionableSteps: { type: "string" },
                },
                required: ["priority", "title", "rationale", "actionableSteps"],
              },
            },
          },
          required: [
            "reportType",
            "overallHackathonScore",
            "verdictSummary",
            "categoryScores",
            "questionAnalysis",
            "topTechnicalStrengths",
            "criticalVulnerabilitiesOrGaps",
            "edgeCaseHandlingAssessment",
            "scalabilityAndArchitectureReview",
            "judgesRecommendations",
          ],
        },
        temperature: 0.7,
        maxOutputTokens: 2500,
        timeoutMs: 35_000,
      },
      zodValidator(judgesEvaluationReportSchema)
    );

    if (sessionId) {
      judgesReportCache.set(sessionId, report);
    }

    return report;
  } catch (err) {
    console.warn("[ReportService] Gemini judges report generation failed, using fallback:", err);
    const { buildFallbackJudgesReport } = await import("./fallbackReport");
    return buildFallbackJudgesReport(project, judgeTurns);
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

