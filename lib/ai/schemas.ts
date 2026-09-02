/**
 * schemas.ts
 * ---------------------------------------------------------------------------
 * Runtime validation for everything Gemini returns, plus the tolerant extractor
 * that runs before validation.
 *
 * WHY THIS EXISTS
 *
 * `JSON.parse(modelResponse)` is not a safe thing to do to LLM output, and the
 * "Gemini response was not valid JSON" error came from doing exactly that. Even
 * with responseSchema set, real responses arrive wrapped in markdown fences,
 * with a leading sentence of explanation, with smart quotes, with trailing
 * commas, or truncated mid-object when the token budget runs out.
 *
 * So parsing is a pipeline, not a call:
 *   1. extractJSON  — strip fences, find the outermost balanced {...}, repair
 *                     the cheap, unambiguous damage (trailing commas).
 *   2. Zod          — validate SHAPE. A response that parses but is missing
 *                     `reply`, or has `relevance: "high"` instead of a number,
 *                     is just as broken as unparseable text and must be caught
 *                     here rather than crashing a component later.
 *   3. caller       — retries once with a stricter prompt, then falls back.
 *
 * Coercion is deliberate on the numeric score fields: models return "8" and 8.5
 * about as often as 8, and rejecting the whole report over that would be a
 * self-inflicted failure. Clamping is safer than trusting the range.
 */

import { z } from "zod";

/** 0-10, tolerant of strings and floats, clamped rather than rejected. */
const score = z.coerce
  .number()
  .transform((n) => Math.max(0, Math.min(10, Math.round(n))))
  .catch(5);

export const turnEvaluationSchema = z.object({
  relevance: score,
  clarity: score,
  specificity: score,
  technicalDepth: score,
  completeness: score,
  evidence: z.string().default(""),
  feedback: z.string().default(""),
});

export const turnResponseSchema = z.object({
  reply: z.string().min(1, "model returned an empty reply"),
  topicCovered: z.string().default("general"),
  // Explicitly tolerant: the opening turn has nothing to evaluate, and models
  // express that as null, as an omitted key, or occasionally as {}.
  evaluation: turnEvaluationSchema.nullish().catch(null),
});

export const tailoredTurnResponseSchema = z.object({
  reply: z.string().min(1, "model returned an empty reply"),
  topicCovered: z.string().default("project question"),
});

export const judgeTailoredTurnResponseSchema = z.object({
  question: z.string().min(1, "model returned an empty question"),
  reasoningTarget: z.string().default("technical evaluation"),
  sourceContext: z.array(z.string()).default([]),
});

export type ValidatedTurn = z.infer<typeof turnResponseSchema>;
export type ValidatedTailoredTurn = z.infer<typeof tailoredTurnResponseSchema>;
export type ValidatedJudgeTailoredTurn = z.infer<typeof judgeTailoredTurnResponseSchema>;

/** 0-100 score, tolerant of strings and floats, clamped. */
const score100 = z.coerce
  .number()
  .transform((n) => Math.max(0, Math.min(100, Math.round(n))))
  .catch(75);

/** 0-10 score for question analysis. */
const score10 = z.coerce
  .number()
  .transform((n) => Math.max(0, Math.min(10, Math.round(n * 10) / 10)))
  .catch(7.5);

const categoryScoreSchema = z.object({
  score: score100,
  evidence: z.string().default(""),
});

export const studentQuestionFeedbackSchema = z.object({
  questionNumber: z.coerce.number().default(1),
  score: score100,
  whatWorked: z.array(z.string()).default([]),
  whatCouldImprove: z.array(z.string()).default([]),
  betterApproach: z.string().default(""),
  communicationTags: z.array(z.string()).default([]),
});

export const studentCommunicationReportSchema = z.object({
  reportType: z.literal("student_communication").default("student_communication"),
  overallScore: score100,
  overallSummary: z.string().default(""),
  categoryScores: z
    .object({
      clarity: score100,
      relevance: score100,
      structure: score100,
      technicalCommunication: score100,
      spontaneousThinking: score100,
      conciseness: score100,
    })
    .default({
      clarity: 75,
      relevance: 75,
      structure: 75,
      technicalCommunication: 75,
      spontaneousThinking: 75,
      conciseness: 75,
    }),
  questionAnalysis: z.array(studentQuestionFeedbackSchema).default([]),
  strongestAnswers: z
    .array(
      z.object({
        questionNumber: z.coerce.number().default(1),
        reason: z.string().default(""),
      })
    )
    .default([]),
  answersNeedingImprovement: z
    .array(
      z.object({
        questionNumber: z.coerce.number().default(1),
        reason: z.string().default(""),
        improvement: z.string().default(""),
      })
    )
    .default([]),
  strengths: z.array(z.string()).default([]),
  recurringWeaknesses: z.array(z.string()).default([]),
  unexpectedQuestionPerformance: z
    .object({
      score: score100,
      summary: z.string().default(""),
      observations: z.array(z.string()).default([]),
    })
    .default({
      score: 75,
      summary: "",
      observations: [],
    }),
  technicalCommunication: z
    .object({
      score: score100,
      summary: z.string().default(""),
      strengths: z.array(z.string()).default([]),
      improvements: z.array(z.string()).default([]),
    })
    .default({
      score: 75,
      summary: "",
      strengths: [],
      improvements: [],
    }),
  improvementPlan: z
    .array(
      z.object({
        priority: z.coerce.number().default(1),
        area: z.string().default(""),
        whyItMatters: z.string().default(""),
        howToPractice: z.string().default(""),
      })
    )
    .default([]),
  nextSessionGoals: z.array(z.string()).default([]),
  cameraAnalysis: z
    .object({
      enabled: z.literal(true),
      eyeContactRatio: z.number().optional(),
      forwardFacingRatio: z.number().optional(),
      faceDetectedRatio: z.number().optional(),
      headOrientation: z
        .object({
          forwardRatio: z.number().default(0),
          leftRatio: z.number().default(0),
          rightRatio: z.number().default(0),
          upRatio: z.number().default(0),
          downRatio: z.number().default(0),
        })
        .optional(),
      interruptions: z
        .object({
          faceLostCount: z.number().default(0),
          prolongedLookAwayCount: z.number().default(0),
        })
        .optional(),
      observations: z.string().optional(),
      note: z.string().optional(),
    })
    .nullable()
    .catch(null),
  speechAnalysis: z
    .object({
      wordsPerMinute: z.number().nullable().optional(),
      avgResponseDelaySec: z.number().optional(),
      totalFillerWords: z.number().optional(),
      totalPauseCount: z.number().optional(),
      longPauseCount: z.number().optional(),
      avgPauseDurationSec: z.number().optional(),
      summary: z.string().optional(),
    })
    .nullable()
    .catch(null),
});

export type ValidatedStudentReport = z.infer<typeof studentCommunicationReportSchema>;
export type ValidatedRahulReport = ValidatedStudentReport;
export type ValidatedReport = ValidatedStudentReport;
export const rahulPerformanceReportSchema = studentCommunicationReportSchema;

export const judgeQuestionFeedbackSchema = z.object({
  questionNumber: z.coerce.number().default(1),
  score: score100,
  judgeName: z.string().default("Judge"),
  questionTopic: z.string().default(""),
  technicalCritique: z.string().default(""),
  strengths: z.array(z.string()).default([]),
  areasToDeepen: z.array(z.string()).default([]),
  practicalRecommendation: z.string().default(""),
});

export const judgesEvaluationReportSchema = z.object({
  reportType: z.literal("judges_evaluation").default("judges_evaluation"),
  overallHackathonScore: score100,
  verdictSummary: z.string().default(""),
  categoryScores: z
    .object({
      technicalDepth: score100,
      architectureAndDesign: score100,
      problemSolvingAndReasoning: score100,
      feasibilityAndViability: score100,
      presentationAndDefense: score100,
    })
    .default({
      technicalDepth: 75,
      architectureAndDesign: 75,
      problemSolvingAndReasoning: 75,
      feasibilityAndViability: 75,
      presentationAndDefense: 75,
    }),
  questionAnalysis: z.array(judgeQuestionFeedbackSchema).default([]),
  topTechnicalStrengths: z.array(z.string()).default([]),
  criticalVulnerabilitiesOrGaps: z.array(z.string()).default([]),
  edgeCaseHandlingAssessment: z
    .object({
      score: score100,
      summary: z.string().default(""),
      observations: z.array(z.string()).default([]),
    })
    .default({
      score: 75,
      summary: "",
      observations: [],
    }),
  scalabilityAndArchitectureReview: z
    .object({
      score: score100,
      summary: z.string().default(""),
      pros: z.array(z.string()).default([]),
      cons: z.array(z.string()).default([]),
    })
    .default({
      score: 75,
      summary: "",
      pros: [],
      cons: [],
    }),
  judgesRecommendations: z
    .array(
      z.object({
        priority: z.coerce.number().default(1),
        title: z.string().default(""),
        rationale: z.string().default(""),
        actionableSteps: z.string().default(""),
      })
    )
    .default([]),
});

export type ValidatedJudgesReport = z.infer<typeof judgesEvaluationReportSchema>;

/**
 * Pull a JSON object out of whatever the model actually sent.
 *
 * Ordered cheapest-first: most responses parse directly and never touch the
 * repair paths. Each later step handles a failure mode observed in practice
 * rather than one imagined.
 */
export function extractJSON(raw: string): unknown | null {
  if (!raw) return null;

  const attempts: string[] = [];
  const trimmed = raw.trim();
  attempts.push(trimmed);

  // ```json ... ``` or bare ``` ... ```
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  // Outermost balanced object, ignoring braces inside strings. Handles a
  // leading "Here's the JSON:" preamble and any trailing commentary.
  const balanced = findBalancedObject(trimmed);
  if (balanced) attempts.push(balanced);

  for (const candidate of attempts) {
    const direct = tryParse(candidate);
    if (direct !== undefined) return direct;

    // Trailing commas before } or ] — extremely common, unambiguous to repair.
    const repaired = candidate
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");
    const fixed = tryParse(repaired);
    if (fixed !== undefined) return fixed;
  }

  return null;
}

function tryParse(s: string): unknown | undefined {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function findBalancedObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null; // unbalanced — most likely truncated by the token limit
}
