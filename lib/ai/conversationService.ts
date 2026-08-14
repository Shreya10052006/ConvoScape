/**
 * conversationService.ts
 * ---------------------------------------------------------------------------
 * SERVER-ONLY (imports geminiClient, which reads process.env directly).
 *
 * One call in, one validated turn out. Reply AND evaluation come from the SAME
 * call rather than two — half the requests, half the tokens, and a model that
 * replies and scores with one shared view of the answer is more self-consistent
 * than two independent calls would be. That matters on a free tier.
 *
 * History is truncated to the current phase rather than the whole session.
 * Rahul doesn't need the judges' questions to hold his own conversation, and
 * sending the full transcript every turn would grow cost linearly with session
 * length for no benefit. The judge phases get a short digest of what Rahul
 * already covered instead, which is the part they'd actually use.
 */

import "server-only";
import { generateJSON, zodValidator } from "./geminiClient";
import { systemInstructionFor, TURN_RESPONSE_SCHEMA } from "./personas";
import { turnResponseSchema, type ValidatedTurn } from "./schemas";
import type { ConversationStage, ProjectContext, TranscriptTurn } from "@/lib/session/sessionTypes";

export interface RequestTurnInput {
  stage: Exclude<ConversationStage, "done">;
  project: ProjectContext;
  /** This phase's turns only, oldest first. */
  stageHistory: TranscriptTurn[];
  /** Topic labels already covered this phase, to prevent repeats. */
  questionsAskedThisStage: string[];
  /** The user's latest answer. Undefined on the character's opening turn. */
  userAnswer?: string;
  /** True when this reply should wrap the phase rather than ask something new. */
  isFinalTurn?: boolean;
  /** One-line digest of the Rahul phase, given to the judge phases for context. */
  priorPhaseSummary?: string;
}

function historyToGeminiFormat(turns: TranscriptTurn[]): Array<{ role: "user" | "model"; text: string }> {
  return turns
    // System messages are UI text, never part of the conversation the model sees.
    .filter((t) => t.kind === "CHARACTER_DIALOGUE" || t.speaker === "user")
    .map((t) => ({
      role: t.speaker === "user" ? ("user" as const) : ("model" as const),
      text: t.text,
    }));
}

export async function requestTurn(input: RequestTurnInput): Promise<ValidatedTurn> {
  const system = systemInstructionFor(input.stage, input.project);

  const avoidNote = input.questionsAskedThisStage.length
    ? `\n\nTopics already covered — do NOT ask about these again: ${input.questionsAskedThisStage.join(", ")}.`
    : "";

  const priorNote = input.priorPhaseSummary
    ? `\n\nContext from the student's earlier conversation with another participant: ${input.priorPhaseSummary}`
    : "";

  const finalNote = input.isFinalTurn
    ? `\n\nTHIS IS YOUR FINAL TURN in this phase. Close it out as instructed and do NOT ask a new question.`
    : "";

  const userMessage = input.userAnswer
    ? `The student just said: "${input.userAnswer}"${avoidNote}${priorNote}${finalNote}\n\nRespond in character as structured JSON.`
    : `This is the start of this phase. Give your opening line as structured JSON.${avoidNote}${priorNote}${finalNote} There is no student answer to evaluate yet — set "evaluation" to null.`;

  return generateJSON<ValidatedTurn>(
    {
      systemInstruction: system,
      history: historyToGeminiFormat(input.stageHistory),
      userMessage,
      responseSchema: TURN_RESPONSE_SCHEMA,
      temperature: 0.9,
      maxOutputTokens: 700,
      timeoutMs: 25_000,
    },
    zodValidator(turnResponseSchema)
  );
}
