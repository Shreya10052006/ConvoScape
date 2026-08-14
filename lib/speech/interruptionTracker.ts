/**
 * interruptionTracker.ts
 * ---------------------------------------------------------------------------
 * Approximate detection of speech overlap. Deliberately modest about what it
 * can know.
 *
 * WHAT WE ACTUALLY HAVE: event boundaries. We know when speechSynthesis started
 * and ended an utterance, and when SpeechRecognition fired a result and roughly
 * when it began listening. That is all.
 *
 * WHAT WE DO NOT HAVE: diarized audio. We cannot prove the user talked over the
 * character. A recognition event landing inside a TTS window could equally be
 * the microphone picking up the speakers — which is a known, common artifact of
 * running both at once on the same device.
 *
 * So every number here is labelled "possible" all the way through to the
 * report, and `isApproximate` is a literal `true` in the type so no consumer
 * can quietly present it as measured fact. Inventing precision here would be
 * worse than not measuring at all, because a user would take "you interrupted
 * the judges 4 times" as a finding about their behaviour.
 *
 * We also mute recognition during TTS specifically to prevent the loop, so a
 * detected overlap is genuinely unusual rather than routine — which is what
 * makes the signal worth reporting at all.
 */

import type { InterruptionMetrics } from "@/lib/session/sessionTypes";

interface Window {
  start: number;
  end: number | null;
}

export class InterruptionTracker {
  private ttsWindows: Window[] = [];
  private userWindows: Window[] = [];
  private currentTts: Window | null = null;
  private currentUser: Window | null = null;

  private possibleUserInterruptions = 0;
  private possibleAiInterruptions = 0;
  private overlapMs = 0;

  characterSpeechStarted(at = performance.now()): void {
    this.currentTts = { start: at, end: null };
    // A character beginning to speak while the user's recognition window is
    // still open is the AI-side case.
    if (this.currentUser && this.currentUser.end === null) {
      this.possibleAiInterruptions++;
    }
  }

  characterSpeechEnded(at = performance.now()): void {
    if (!this.currentTts) return;
    this.currentTts.end = at;
    this.ttsWindows.push(this.currentTts);
    this.currentTts = null;
  }

  userSpeechStarted(at = performance.now()): void {
    this.currentUser = { start: at, end: null };
    // The user's recogniser producing speech while a character is still
    // speaking is the user-side case.
    if (this.currentTts && this.currentTts.end === null) {
      this.possibleUserInterruptions++;
      this.overlapMs += Math.max(0, at - this.currentTts.start);
    }
  }

  userSpeechEnded(at = performance.now()): void {
    if (!this.currentUser) return;
    this.currentUser.end = at;
    this.userWindows.push(this.currentUser);
    this.currentUser = null;
  }

  finalize(): InterruptionMetrics {
    return {
      possibleUserInterruptions: this.possibleUserInterruptions,
      possibleAiInterruptions: this.possibleAiInterruptions,
      totalPossibleInterruptions:
        this.possibleUserInterruptions + this.possibleAiInterruptions,
      estimatedOverlapMs: Math.round(this.overlapMs),
      isApproximate: true,
    };
  }

  reset(): void {
    this.ttsWindows = [];
    this.userWindows = [];
    this.currentTts = null;
    this.currentUser = null;
    this.possibleUserInterruptions = 0;
    this.possibleAiInterruptions = 0;
    this.overlapMs = 0;
  }
}

/** Phrasing used in the report. Hedged on purpose — see the module note. */
export function describeInterruptions(m: InterruptionMetrics): string {
  if (m.totalPossibleInterruptions === 0) {
    return "No speech overlap was detected — you consistently waited for each speaker to finish.";
  }
  const parts: string[] = [];
  if (m.possibleUserInterruptions > 0) {
    parts.push(
      `${m.possibleUserInterruptions} time${m.possibleUserInterruptions === 1 ? "" : "s"} your response began while a character was still speaking`
    );
  }
  if (m.possibleAiInterruptions > 0) {
    parts.push(
      `${m.possibleAiInterruptions} time${m.possibleAiInterruptions === 1 ? "" : "s"} a character began replying while your speech was still being captured`
    );
  }
  return `Possible speech overlap: ${parts.join(", and ")}. This is an approximate signal derived from timing of speech events rather than precise audio analysis, so treat it as a hint rather than a measurement.`;
}
