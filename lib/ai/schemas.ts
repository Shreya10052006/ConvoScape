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

export type ValidatedTurn = z.infer<typeof turnResponseSchema>;

export const coachingReportSchema = z.object({
  overall: z
    .object({
      communicationScore: score,
      technicalExplanationScore: score,
      clarityScore: score,
      confidenceScore: score,
      questionHandlingScore: score,
      specificityScore: score,
      structureScore: score,
      relevanceScore: score,
    })
    .partial()
    .transform((o) => ({
      communicationScore: o.communicationScore ?? 5,
      technicalExplanationScore: o.technicalExplanationScore ?? 5,
      clarityScore: o.clarityScore ?? 5,
      confidenceScore: o.confidenceScore ?? 5,
      questionHandlingScore: o.questionHandlingScore ?? 5,
      specificityScore: o.specificityScore ?? 5,
      structureScore: o.structureScore ?? 5,
      relevanceScore: o.relevanceScore ?? 5,
    })),
  whatYouDidWell: z.array(z.string()).default([]),
  whatYouMissed: z.array(z.string()).default([]),
  communicationAnalysis: z.string().default(""),
  technicalCommunication: z.string().default(""),
  questionBreakdown: z
    .array(
      z.object({
        question: z.string().default(""),
        answerSummary: z.string().default(""),
        whatWasGood: z.string().default(""),
        whatWasWeak: z.string().default(""),
        whatTheJudgeWasTesting: z.string().default(""),
        strongerAnswer: z.string().default(""),
      })
    )
    .default([]),
  speakingPatterns: z.string().default(""),
  answerQuality: z.string().default(""),
  bodyLanguage: z.string().nullish().catch(null),
  mostImportantImprovement: z.string().default(""),
  howToPractice: z.string().default(""),
  narrativeSummary: z.string().default(""),
  repetitionAnalysis: z.string().default(""),
});

export type ValidatedReport = z.infer<typeof coachingReportSchema>;

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
