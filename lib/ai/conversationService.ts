/**
 * conversationService.ts
 * ---------------------------------------------------------------------------
 * SERVER-ONLY (imports geminiClient, which reads process.env directly).
 */

import "server-only";
import { generateJSON, zodValidator } from "./geminiClient";
import {
  systemInstructionFor,
  RAHUL_TAILORED_SYSTEM_INSTRUCTION,
  TURN_RESPONSE_SCHEMA,
  TAILORED_TURN_SCHEMA,
} from "./personas";
import {
  turnResponseSchema,
  tailoredTurnResponseSchema,
  type ValidatedTurn,
  type ValidatedTailoredTurn,
} from "./schemas";
import type { ConversationStage, ProjectContext, TranscriptTurn } from "@/lib/session/sessionTypes";

export interface RequestTurnInput {
  stage: Exclude<ConversationStage, "done">;
  project: ProjectContext;
  stageHistory: TranscriptTurn[];
  questionsAskedThisStage: string[];
  userAnswer?: string;
  isFinalTurn?: boolean;
  priorPhaseSummary?: string;
}

export interface RequestTailoredTurnInput {
  questionNumber: 2 | 4 | 6 | 8 | 10;
  project: ProjectContext;
  allowedAnswers?: Array<{ questionNum: number; answer: string }>;
}

export interface TailoredTurnResult {
  speaker: "rahul";
  reply: string;
  topicCovered: string;
}

function historyToGeminiFormat(turns: TranscriptTurn[]): Array<{ role: "user" | "model"; text: string }> {
  return turns
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

/**
 * Generate a strict context-bounded tailored question for Rahul (Q2, Q4, Q6, Q8, Q10).
 */
export async function requestTailoredTurn(input: RequestTailoredTurnInput): Promise<TailoredTurnResult> {
  const p = input.project;
  const sections: string[] = [
    "QUESTIONNAIRE DATA:",
    `Project Name: ${p.name}`,
    `Domain: ${p.domain}`,
    `Project Explanation: ${p.description || p.topic}`,
    `Why They Built It: ${p.problem || "Not specified"}`,
    `Tech Stack: ${p.stack || "Not specified"}`,
  ];

  if (input.allowedAnswers && input.allowedAnswers.length > 0) {
    sections.push("\nAVAILABLE CONVERSATION ANSWERS:");
    for (const item of input.allowedAnswers) {
      sections.push(`Answer to Q${item.questionNum}: "${item.answer}"`);
    }
  }

  sections.push(
    `\nTASK: Generate Rahul's next curious, thoughtful, and unexpected conversational question (Q${input.questionNumber}) tailored to this project. Return JSON.`
  );

  const prompt = sections.join("\n");

  const result = await generateJSON<ValidatedTailoredTurn>(
    {
      systemInstruction: RAHUL_TAILORED_SYSTEM_INSTRUCTION,
      history: [],
      userMessage: prompt,
      responseSchema: TAILORED_TURN_SCHEMA,
      temperature: 0.85,
      maxOutputTokens: 300,
      timeoutMs: 20_000,
    },
    zodValidator(tailoredTurnResponseSchema)
  );

  return {
    speaker: "rahul",
    reply: result.reply,
    topicCovered: result.topicCovered,
  };
}
