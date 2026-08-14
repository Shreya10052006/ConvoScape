/**
 * dialogueMachine.ts
 * ---------------------------------------------------------------------------
 * Conversation state: whose turn it is, what's been said, when it's done.
 * Knows nothing about where Rahul is standing or whether the camera is on.
 * The orchestrator (app/page.tsx) is the only place that reads both this and
 * the scene machine and connects them — via explicit events, not shared state.
 */

import {
  STAGE_ORDER,
  STAGE_TURN_TARGET,
  type ConversationStage,
  type ConversationState,
  type TranscriptTurn,
} from "./sessionTypes";

export type DialoguePhase =
  | "IDLE"
  | "CHARACTER_SPEAKING"
  | "AWAITING_USER"
  | "USER_SPEAKING"
  | "THINKING";

export type DialogueEvent =
  | { type: "TURN_ADDED"; turn: TranscriptTurn }
  | { type: "QUESTION_TOPIC"; topic: string }
  | { type: "ADVANCE_STAGE" }
  | { type: "RESET" };

export function initialConversationState(): ConversationState {
  return {
    stage: "rahul",
    transcript: [],
    questionsAsked: [],
    turnsTakenThisStage: 0,
    isComplete: false,
  };
}

function nextStage(stage: ConversationStage): ConversationStage {
  const i = STAGE_ORDER.indexOf(stage);
  return STAGE_ORDER[Math.min(i + 1, STAGE_ORDER.length - 1)];
}

export function conversationReducer(
  state: ConversationState,
  event: DialogueEvent
): ConversationState {
  switch (event.type) {
    case "TURN_ADDED": {
      const turnsTaken =
        event.turn.speaker === "user" ? state.turnsTakenThisStage + 1 : state.turnsTakenThisStage;
      return { ...state, transcript: [...state.transcript, event.turn], turnsTakenThisStage: turnsTaken };
    }
    case "QUESTION_TOPIC":
      return { ...state, questionsAsked: [...state.questionsAsked, event.topic] };
    case "ADVANCE_STAGE": {
      const stage = nextStage(state.stage);
      return { ...state, stage, turnsTakenThisStage: 0, isComplete: stage === "done" };
    }
    case "RESET":
      return initialConversationState();
    default:
      return state;
  }
}

/** Has this stage said enough? Used to decide when to advance rather than ask
 * Gemini to decide, which keeps the conversation length predictable and cheap. */
export function stageShouldAdvance(state: ConversationState): boolean {
  if (state.stage === "done") return false;
  return state.turnsTakenThisStage >= STAGE_TURN_TARGET[state.stage];
}
