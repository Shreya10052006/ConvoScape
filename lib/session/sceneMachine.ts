/**
 * sceneMachine.ts
 * ---------------------------------------------------------------------------
 * The VISUAL state machine only. It knows where bodies are in the room and
 * nothing else. It does not know what anyone said, whether the microphone is
 * live, or whether Gemini has responded.
 *
 * Three machines run in parallel and communicate only through explicit events:
 *
 *   SceneState    — where are the characters, what is on screen
 *   DialogueState — whose turn is it, what has been asked and answered
 *   CameraState   — is the webcam on
 *
 * Keeping them apart is what stops the "one giant component" failure. A Gemini
 * timeout must never be able to leave Rahul stranded mid-stride, and a dropped
 * sprite frame must never be able to lose a user's answer.
 */

export type SceneState =
  | "INTRO"
  | "PROJECT_SETUP"
  | "HALL_IDLE"
  | "RAHUL_FAR"
  | "RAHUL_WALKING"
  | "RAHUL_NEAR"
  | "RAHUL_CONVERSATION"
  | "SESSION_COMPLETE"
  | "REPORT_GENERATION"
  | "REPORT";

export type SceneEvent =
  | { type: "BEGIN" }
  | { type: "PROJECT_SUBMITTED" }
  | { type: "SETTLE_COMPLETE" }
  | { type: "WALK_COMPLETE" }
  | { type: "NEAR_SETTLED" }
  | { type: "DIALOGUE_COMPLETE" }
  | { type: "REPORT_READY" }
  | { type: "RESTART" };

const TRANSITIONS: Record<SceneState, Partial<Record<SceneEvent["type"], SceneState>>> = {
  INTRO: { BEGIN: "PROJECT_SETUP" },
  PROJECT_SETUP: { PROJECT_SUBMITTED: "HALL_IDLE" },
  HALL_IDLE: { SETTLE_COMPLETE: "RAHUL_FAR" },
  RAHUL_FAR: { SETTLE_COMPLETE: "RAHUL_WALKING" },
  RAHUL_WALKING: { WALK_COMPLETE: "RAHUL_NEAR" },
  RAHUL_NEAR: { NEAR_SETTLED: "RAHUL_CONVERSATION" },
  RAHUL_CONVERSATION: { DIALOGUE_COMPLETE: "SESSION_COMPLETE" },
  SESSION_COMPLETE: { REPORT_READY: "REPORT_GENERATION" },
  REPORT_GENERATION: { REPORT_READY: "REPORT" },
  REPORT: { RESTART: "PROJECT_SETUP" },
};

export function sceneReducer(state: SceneState, event: SceneEvent): SceneState {
  const next = TRANSITIONS[state]?.[event.type];
  if (!next) {
    // Illegal transitions are dropped, not thrown. A late WALK_COMPLETE from a
    // stale animation frame should be ignored, not crash the simulation.
    if (process.env.NODE_ENV === "development") {
      console.warn(`[scene] ignored ${event.type} in ${state}`);
    }
    return state;
  }
  return next;
}

/** States during which a character is actively moving under rAF control. */
export function isAnimating(state: SceneState): boolean {
  return state === "RAHUL_WALKING";
}

/** States during which the user may speak. */
export function isUserTurnPossible(state: SceneState): boolean {
  return state === "RAHUL_CONVERSATION";
}

/* -------------------------------------------------------------------------- */

export type CameraState = "CAMERA_OFF" | "CAMERA_REQUESTING" | "CAMERA_ON" | "CAMERA_DENIED";

export type DialoguePhase = "IDLE" | "CHARACTER_SPEAKING" | "AWAITING_USER" | "USER_SPEAKING" | "THINKING";
