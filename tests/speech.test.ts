import { describe, it, expect } from "vitest";
import {
  analyzeSpeech,
  detectFalseStarts,
  analyzeSingleAnswer,
} from "@/lib/speech/speechAnalysis";
import { analyzeRepetition } from "@/lib/speech/repetitionAnalysis";
import {
  InterruptionTracker,
  describeInterruptions,
} from "@/lib/speech/interruptionTracker";
import type { ProjectContext, TranscriptTurn } from "@/lib/session/sessionTypes";

const project: ProjectContext = {
  userName: "Muthu",
  college: "CEG",
  name: "CareVista",
  domain: "HealthTech",
  topic: "rural telemedicine",
  description: "A consent-first telemedicine platform for rural patients",
  stack: "Next.js, Postgres",
};

function userTurn(text: string, start?: number, end?: number): TranscriptTurn {
  return {
    id: Math.random().toString(36).slice(2),
    speaker: "user",
    text,
    stage: "rahul",
    kind: "CHARACTER_DIALOGUE",
    startTime: start,
    endTime: end,
  };
}

describe("filler detection", () => {
  it("counts filler words", () => {
    const m = analyzeSpeech(
      [userTurn("um so basically we built, you know, a thing")],
      project
    );
    expect(m.totalFillerWords).toBeGreaterThanOrEqual(3);
    expect(m.fillerWordCounts["basically"]).toBe(1);
  });

  it("does not count fillers embedded in longer words", () => {
    // "sofa" contains "so", "assume" contains "um" — substring matching here
    // would be a classic false positive.
    const m = analyzeSpeech([userTurn("I assume the sofa likely helps")], project);
    expect(m.fillerWordCounts["so"] ?? 0).toBe(0);
    expect(m.fillerWordCounts["um"] ?? 0).toBe(0);
  });

  it("contextual check: does not count 'like' as filler when used as a transitive verb", () => {
    const m = analyzeSpeech([userTurn("I like React and we like Next.js")], project);
    expect(m.fillerWordCounts["like"] ?? 0).toBe(0);
  });

  it("contextual check: counts 'like' when used as a hesitation or discourse filler", () => {
    const m = analyzeSpeech([userTurn("It was, like, really difficult to integrate")], project);
    expect(m.fillerWordCounts["like"]).toBe(1);
  });

  it("contextual check: does not count 'so that' or 'right now' as fillers", () => {
    const m = analyzeSpeech([userTurn("We built it so that users can access it right now")], project);
    expect(m.fillerWordCounts["so"] ?? 0).toBe(0);
    expect(m.fillerWordCounts["right"] ?? 0).toBe(0);
  });
});

describe("false start and single answer analysis", () => {
  it("detects false starts with correction markers and restarts", () => {
    const text = "Our project is... actually, our project was designed for clinics.";
    const fs = detectFalseStarts(text);
    expect(fs.length).toBeGreaterThanOrEqual(1);

    const detailed = analyzeSingleAnswer(text, {
      speechStartTime: 1000,
      speechEndTime: 5000,
      totalDurationSeconds: 4.0,
      speakingDurationSeconds: 3.2,
      silenceDurationSeconds: 0.8,
      pauseCount: 1,
      longPauseCount: 0,
      longPauseDurations: [],
      longestPauseSeconds: 0.8,
      avgPauseDurationSeconds: 0.8,
      isAudioVad: true,
    }, project);

    expect(detailed.rawTranscript).toBe(text);
    expect(detailed.falseStarts?.length).toBeGreaterThanOrEqual(1);
    expect(detailed.pauseCount).toBe(1);
    expect(detailed.speakingDurationSeconds).toBe(3.2);
    expect(detailed.silenceDurationSeconds).toBe(0.8);
  });
});

describe("pacing and answer length", () => {
  it("computes words per minute from timing data", () => {
    // 60 words over 30 seconds = 120 wpm
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const m = analyzeSpeech([userTurn(words, 0, 30_000)], project);
    expect(m.wordsPerMinute).toBeCloseTo(120, 0);
  });

  it("returns null wpm when there is no timing data (typed input)", () => {
    const m = analyzeSpeech([userTurn("typed answer with no timings")], project);
    expect(m.wordsPerMinute).toBeNull();
  });

  it("flags very short and very long answers", () => {
    const m = analyzeSpeech(
      [userTurn("Yes"), userTurn("word ".repeat(150))],
      project
    );
    expect(m.shortAnswerCount).toBe(1);
    expect(m.longAnswerCount).toBe(1);
  });
});

describe("long pause detection", () => {
  it("counts a long gap between a character line ending and the answer starting", () => {
    const transcript: TranscriptTurn[] = [
      { ...userTurn("Question?"), speaker: "rahul", endTime: 1_000 },
      userTurn("An answer arriving late", 6_000, 8_000),
    ];
    expect(analyzeSpeech(transcript, project).longPauseCount).toBe(1);
  });
});

describe("repetition analysis", () => {
  it("detects immediate stutter-style repeats", () => {
    const r = analyzeRepetition(["I, I think we, we built it"], project);
    expect(r.repeatedWordCount).toBeGreaterThanOrEqual(2);
    expect(r.topRepeatedWords.map((w) => w.text)).toContain("i");
  });

  it("does NOT treat the project's own name as a problem", () => {
    const texts = Array.from({ length: 8 }, () => "CareVista helps rural patients");
    const r = analyzeRepetition(texts, project);
    const flagged = r.topRepeatedWords.map((w) => w.text);
    expect(flagged).not.toContain("carevista");
    expect(r.domainTermRepeats.map((w) => w.text)).toContain("carevista");
  });

  it("detects repeated phrases", () => {
    const r = analyzeRepetition(
      ["the main thing here", "and the main thing here again"],
      project
    );
    expect(r.repeatedPhraseCount).toBeGreaterThan(0);
  });

  it("does not flag stutters on filler words (already counted elsewhere)", () => {
    const r = analyzeRepetition(["basically basically it works"], project);
    expect(r.topRepeatedWords.map((w) => w.text)).not.toContain("basically");
  });

  it("returns empty structures for empty input", () => {
    const r = analyzeRepetition([], project);
    expect(r.repeatedWordCount).toBe(0);
    expect(r.topRepeatedPhrases).toEqual([]);
  });
});

describe("interruption tracking", () => {
  it("counts a user interruption when speech starts during TTS", () => {
    const t = new InterruptionTracker();
    t.characterSpeechStarted(1000);
    t.userSpeechStarted(1500); // overlaps
    const m = t.finalize();
    expect(m.possibleUserInterruptions).toBe(1);
    expect(m.estimatedOverlapMs).toBe(500);
    expect(m.isApproximate).toBe(true);
  });

  it("counts an AI interruption when TTS starts during user speech", () => {
    const t = new InterruptionTracker();
    t.userSpeechStarted(1000);
    t.characterSpeechStarted(1200);
    expect(t.finalize().possibleAiInterruptions).toBe(1);
  });

  it("counts nothing when speech does not overlap", () => {
    const t = new InterruptionTracker();
    t.characterSpeechStarted(0);
    t.characterSpeechEnded(1000);
    t.userSpeechStarted(1500);
    t.userSpeechEnded(3000);
    expect(t.finalize().totalPossibleInterruptions).toBe(0);
  });

  it("describes zero interruptions without hedging language", () => {
    const t = new InterruptionTracker();
    expect(describeInterruptions(t.finalize())).toMatch(/no speech overlap/i);
  });

  it("hedges when interruptions are present, never claiming precision", () => {
    const t = new InterruptionTracker();
    t.characterSpeechStarted(0);
    t.userSpeechStarted(100);
    const text = describeInterruptions(t.finalize());
    expect(text).toMatch(/possible/i);
    expect(text).toMatch(/approximate/i);
  });
});
