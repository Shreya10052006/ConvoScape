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

export interface RequestJudgeTailoredTurnInput {
  questionNumber: 2 | 4 | 6 | 8;
  project: ProjectContext;
  answersMap?: Record<number, string>; // Q1..Q8 user raw/cleaned answers
}

export interface JudgeTailoredTurnResult {
  speaker: "judge2";
  question: string;
  reasoningTarget: string;
  sourceContext: string[];
}

/**
 * Strict Context Builder for Judge Q2 (Questionnaire ONLY)
 */
export function buildJudgeQ2Context(project: ProjectContext): string {
  return [
    "QUESTIONNAIRE DATA (ONLY CONTEXT PERMITTED FOR Q2):",
    `Team/Project Name: ${project.name}`,
    `Domain: ${project.domain}`,
    `Project Explanation: ${project.description || project.topic}`,
    `Why Built: ${project.problem || "Not specified"}`,
    `Tech Stack: ${project.stack || "Not specified"}`,
    "\nTASK: Generate Male Technical Judge's Q2 question to probe the student's technical approach or architecture based solely on this questionnaire data. Return JSON.",
  ].join("\n");
}

/**
 * Strict Context Builder for Judge Q4 (Questionnaire + Q1 + Q2)
 */
export function buildJudgeQ4Context(project: ProjectContext, answersMap: Record<number, string> = {}): string {
  const sections: string[] = [
    "QUESTIONNAIRE DATA:",
    `Team/Project Name: ${project.name}`,
    `Domain: ${project.domain}`,
    `Project Explanation: ${project.description || project.topic}`,
    `Why Built: ${project.problem || "Not specified"}`,
    `Tech Stack: ${project.stack || "Not specified"}`,
    "\nPERMITTED CONVERSATION ANSWERS (Q1 and Q2 ONLY - Q3 is deliberately excluded):",
    `Student Presentation / Answer to Q1: "${answersMap[1] || "(No Q1 answer recorded)"}"`,
    `Student Answer to Q2: "${answersMap[2] || "(No Q2 answer recorded)"}"`,
    "\nTASK: Generate Male Technical Judge's Q4 question to probe trade-offs, limitations, or deeper technical mechanics grounded in what they explained in Q1/Q2. Return JSON.",
  ];
  return sections.join("\n");
}

/**
 * Strict Context Builder for Judge Q6 (Questionnaire + Q1..Q4)
 */
export function buildJudgeQ6Context(project: ProjectContext, answersMap: Record<number, string> = {}): string {
  const sections: string[] = [
    "QUESTIONNAIRE DATA:",
    `Team/Project Name: ${project.name}`,
    `Domain: ${project.domain}`,
    `Project Explanation: ${project.description || project.topic}`,
    `Why Built: ${project.problem || "Not specified"}`,
    `Tech Stack: ${project.stack || "Not specified"}`,
    "\nPERMITTED CONVERSATION ANSWERS (Q1 through Q4 ONLY - Q5 is deliberately excluded):",
    `Student Answer to Q1: "${answersMap[1] || ""}"`,
    `Student Answer to Q2: "${answersMap[2] || ""}"`,
    `Student Answer to Q3: "${answersMap[3] || ""}"`,
    `Student Answer to Q4: "${answersMap[4] || ""}"`,
    "\nTASK: Generate Male Technical Judge's Q6 question to challenge technical feasibility, scalability, failure scenarios, or unexpected edge cases based on Q1-Q4 answers. Return JSON.",
  ];
  return sections.join("\n");
}

/**
 * Strict Context Builder for Judge Q8 (Questionnaire + Q1..Q6)
 */
export function buildJudgeQ8Context(project: ProjectContext, answersMap: Record<number, string> = {}): string {
  const sections: string[] = [
    "QUESTIONNAIRE DATA:",
    `Team/Project Name: ${project.name}`,
    `Domain: ${project.domain}`,
    `Project Explanation: ${project.description || project.topic}`,
    `Why Built: ${project.problem || "Not specified"}`,
    `Tech Stack: ${project.stack || "Not specified"}`,
    "\nPERMITTED CONVERSATION ANSWERS (Q1 through Q6 ONLY - Q7 is deliberately excluded):",
    `Student Answer to Q1: "${answersMap[1] || ""}"`,
    `Student Answer to Q2: "${answersMap[2] || ""}"`,
    `Student Answer to Q3: "${answersMap[3] || ""}"`,
    `Student Answer to Q4: "${answersMap[4] || ""}"`,
    `Student Answer to Q5: "${answersMap[5] || ""}"`,
    `Student Answer to Q6: "${answersMap[6] || ""}"`,
    "\nTASK: Generate Male Technical Judge's final evaluation question (Q8) to test deep understanding, critical trade-offs, or real-world operational viability. Return JSON.",
  ];
  return sections.join("\n");
}

/**
 * Request a tailored question for Judge (Male Technical Judge: Q2, Q4, Q6, Q8).
 */
export async function requestJudgeTailoredTurn(input: RequestJudgeTailoredTurnInput): Promise<JudgeTailoredTurnResult> {
  const { questionNumber, project, answersMap = {} } = input;

  let prompt = "";
  if (questionNumber === 2) {
    prompt = buildJudgeQ2Context(project);
  } else if (questionNumber === 4) {
    prompt = buildJudgeQ4Context(project, answersMap);
  } else if (questionNumber === 6) {
    prompt = buildJudgeQ6Context(project, answersMap);
  } else if (questionNumber === 8) {
    prompt = buildJudgeQ8Context(project, answersMap);
  }

  const { JUDGE_TAILORED_SYSTEM_INSTRUCTION, JUDGE_TAILORED_TURN_SCHEMA } = await import("./personas");
  const { judgeTailoredTurnResponseSchema } = await import("./schemas");

  const result = await generateJSON<{ question: string; reasoningTarget?: string; sourceContext?: string[] }>(
    {
      systemInstruction: JUDGE_TAILORED_SYSTEM_INSTRUCTION,
      history: [],
      userMessage: prompt,
      responseSchema: JUDGE_TAILORED_TURN_SCHEMA,
      temperature: 0.8,
      maxOutputTokens: 300,
      timeoutMs: 20_000,
    },
    zodValidator(judgeTailoredTurnResponseSchema)
  );

  return {
    speaker: "judge2",
    question: result.question,
    reasoningTarget: result.reasoningTarget || "technical evaluation",
    sourceContext: result.sourceContext || [],
  };
}

