import { describe, it, expect } from "vitest";
import {
  computeDurations,
  newSessionId,
  summarisePhase,
  STAGE_TURN_TARGET,
  type SessionTimestamps,
  type TranscriptTurn,
} from "@/lib/session/sessionTypes";
import {
  conversationReducer,
  initialConversationState,
  stageShouldAdvance,
} from "@/lib/session/dialogueMachine";
import { sceneReducer } from "@/lib/session/sceneMachine";

function turn(over: Partial<TranscriptTurn> = {}): TranscriptTurn {
  return {
    id: Math.random().toString(36).slice(2),
    speaker: "user",
    text: "an answer",
    stage: "rahul",
    kind: "CHARACTER_DIALOGUE",
    ...over,
  };
}

describe("session id", () => {
  it("produces a unique value each call", () => {
    const ids = new Set(Array.from({ length: 500 }, () => newSessionId()));
    expect(ids.size).toBe(500);
  });

  it("contains no obviously secret-looking material and is opaque", () => {
    const id = newSessionId();
    expect(id).not.toMatch(/key|secret|token|AIza/i);
    expect(id.length).toBeGreaterThan(10);
  });
});

describe("timestamps", () => {
  it("computes durations from ISO strings", () => {
    const t: SessionTimestamps = {
      sessionStartedAt: "2026-01-01T10:00:00.000Z",
      sessionEndedAt: "2026-01-01T10:15:30.000Z",
      rahulPhaseStartedAt: "2026-01-01T10:00:10.000Z",
      rahulPhaseEndedAt: "2026-01-01T10:05:10.000Z",
      presentationStartedAt: "2026-01-01T10:06:00.000Z",
      presentationEndedAt: "2026-01-01T10:08:30.000Z",
    };
    const d = computeDurations(t);
    expect(d.totalSeconds).toBe(930);
    expect(d.rahulSeconds).toBe(300);
    expect(d.presentationSeconds).toBe(150);
    // Never started — must be null, not 0, so the report can distinguish
    // "didn't happen" from "took no time".
    expect(d.judgeQnaSeconds).toBeNull();
  });

  it("returns null rather than a negative duration if times are out of order", () => {
    const d = computeDurations({
      sessionStartedAt: "2026-01-01T10:05:00.000Z",
      sessionEndedAt: "2026-01-01T10:00:00.000Z",
    });
    expect(d.totalSeconds).toBeNull();
  });
});

describe("conversation phase transitions", () => {
  it("advances rahul -> judgeIntro -> presentation -> judgeQA -> done", () => {
    let s = initialConversationState();
    expect(s.stage).toBe("rahul");
    s = conversationReducer(s, { type: "ADVANCE_STAGE" });
    expect(s.stage).toBe("judgeIntro");
    s = conversationReducer(s, { type: "ADVANCE_STAGE" });
    expect(s.stage).toBe("presentation");
    s = conversationReducer(s, { type: "ADVANCE_STAGE" });
    expect(s.stage).toBe("judgeQA");
    s = conversationReducer(s, { type: "ADVANCE_STAGE" });
    expect(s.stage).toBe("done");
    expect(s.isComplete).toBe(true);
  });

  it("resets the per-phase answer count on advance", () => {
    let s = initialConversationState();
    s = conversationReducer(s, { type: "TURN_ADDED", turn: turn() });
    expect(s.turnsTakenThisStage).toBe(1);
    s = conversationReducer(s, { type: "ADVANCE_STAGE" });
    expect(s.turnsTakenThisStage).toBe(0);
  });

  it("counts only user turns toward the phase target", () => {
    let s = initialConversationState();
    s = conversationReducer(s, { type: "TURN_ADDED", turn: turn({ speaker: "rahul" }) });
    s = conversationReducer(s, { type: "TURN_ADDED", turn: turn({ speaker: "rahul" }) });
    expect(s.turnsTakenThisStage).toBe(0);
    s = conversationReducer(s, { type: "TURN_ADDED", turn: turn({ speaker: "user" }) });
    expect(s.turnsTakenThisStage).toBe(1);
  });

  it("signals advance only once the phase target is met", () => {
    let s = initialConversationState();
    for (let i = 0; i < STAGE_TURN_TARGET.rahul - 1; i++) {
      s = conversationReducer(s, { type: "TURN_ADDED", turn: turn() });
      expect(stageShouldAdvance(s)).toBe(false);
    }
    s = conversationReducer(s, { type: "TURN_ADDED", turn: turn() });
    expect(stageShouldAdvance(s)).toBe(true);
  });
});

describe("scene machine", () => {
  it("runs the full visual sequence", () => {
    let s = sceneReducer("HALL_IDLE", { type: "SETTLE_COMPLETE" });
    expect(s).toBe("RAHUL_FAR");
    s = sceneReducer(s, { type: "SETTLE_COMPLETE" });
    expect(s).toBe("RAHUL_WALKING");
    s = sceneReducer(s, { type: "WALK_COMPLETE" });
    expect(s).toBe("RAHUL_NEAR");
    s = sceneReducer(s, { type: "NEAR_SETTLED" });
    expect(s).toBe("RAHUL_CONVERSATION");
    s = sceneReducer(s, { type: "DIALOGUE_COMPLETE" });
    expect(s).toBe("RAHUL_EXIT");
    s = sceneReducer(s, { type: "EXIT_COMPLETE" });
    expect(s).toBe("JUDGE_ENTRY");
    s = sceneReducer(s, { type: "JUDGES_SEATED" });
    expect(s).toBe("JUDGE_CONVERSATION");
    s = sceneReducer(s, { type: "DIALOGUE_COMPLETE" });
    expect(s).toBe("SESSION_COMPLETE");
  });

  it("ignores illegal transitions instead of throwing", () => {
    // A late WALK_COMPLETE from a stale animation frame must not corrupt state.
    expect(sceneReducer("RAHUL_CONVERSATION", { type: "WALK_COMPLETE" })).toBe(
      "RAHUL_CONVERSATION"
    );
  });
});

describe("phase summary", () => {
  it("includes only user answers", () => {
    const t = [
      turn({ speaker: "rahul", text: "What are you building?" }),
      turn({ speaker: "user", text: "A telemedicine platform." }),
    ];
    const s = summarisePhase(t);
    expect(s).toContain("telemedicine");
    expect(s).not.toContain("What are you building");
  });

  it("truncates long input", () => {
    const t = [turn({ speaker: "user", text: "word ".repeat(500) })];
    expect(summarisePhase(t, 100).length).toBeLessThanOrEqual(101);
  });
});
