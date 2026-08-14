/**
 * speechAnalysis.ts
 * ---------------------------------------------------------------------------
 * Pure computation over the transcript — no AI call, no network, runs
 * instantly. Filler words, pacing and answer-length are countable facts, not
 * judgement calls, so they don't need a model and shouldn't cost a token.
 * Gemini receives these numbers as context in the report prompt rather than
 * being asked to re-derive them, which is both cheaper and more accurate.
 */

import type { ProjectContext, SpeechMetrics, TranscriptTurn } from "@/lib/session/sessionTypes";
import { analyzeRepetition } from "./repetitionAnalysis";

const FILLER_WORDS = [
  "um", "uh", "like", "basically", "actually", "you know", "so", "i mean",
  "kind of", "sort of", "literally", "right",
];

const LONG_PAUSE_MS = 2500; // gap between end of one user turn's recognition and

function countFillers(text: string): Record<string, number> {
  const lower = ` ${text.toLowerCase()} `;
  const counts: Record<string, number> = {};
  for (const w of FILLER_WORDS) {
    const re = new RegExp(`[\\s,.]${w.replace(" ", "\\s")}[\\s,.]`, "g");
    const matches = lower.match(re);
    if (matches?.length) counts[w] = matches.length;
  }
  return counts;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function analyzeSpeech(
  transcript: TranscriptTurn[],
  project?: ProjectContext
): SpeechMetrics {
  const userTurns = transcript.filter((t) => t.speaker === "user");

  let totalSpeakingMs = 0;
  let timedResponses = 0;
  let totalResponseTimeMs = 0;
  let totalWords = 0;
  const fillerTotals: Record<string, number> = {};
  let longPauseCount = 0;
  let shortAnswerCount = 0;
  let longAnswerCount = 0;

  let prevCharacterTurnEnd: number | null = null;

  transcript.forEach((turn) => {
    if (turn.speaker !== "user") {
      prevCharacterTurnEnd = turn.endTime ?? prevCharacterTurnEnd;
      return;
    }

    const words = wordCount(turn.text);
    totalWords += words;
    if (words < 8) shortAnswerCount++;
    if (words > 120) longAnswerCount++;

    const fillers = countFillers(turn.text);
    for (const [k, v] of Object.entries(fillers)) fillerTotals[k] = (fillerTotals[k] ?? 0) + v;

    if (turn.startTime != null && turn.endTime != null) {
      const duration = turn.endTime - turn.startTime;
      totalSpeakingMs += duration;
      timedResponses++;

      if (prevCharacterTurnEnd != null) {
        const gap = turn.startTime - prevCharacterTurnEnd;
        totalResponseTimeMs += Math.max(0, gap);
        if (gap > LONG_PAUSE_MS) longPauseCount++;
      }
    }
    prevCharacterTurnEnd = turn.endTime ?? prevCharacterTurnEnd;
  });

  const totalFillerWords = Object.values(fillerTotals).reduce((a, b) => a + b, 0);
  const minutesSpoken = totalSpeakingMs / 60000;

  const emptyProject: ProjectContext = {
    userName: "", college: "", name: "", domain: "", topic: "", description: "",
  };

  return {
    totalSpeakingMs,
    totalResponses: userTurns.length,
    avgResponseTimeMs: timedResponses ? totalResponseTimeMs / timedResponses : 0,
    avgWordsPerResponse: userTurns.length ? totalWords / userTurns.length : 0,
    wordsPerMinute: timedResponses && minutesSpoken > 0.05 ? totalWords / minutesSpoken : null,
    fillerWordCounts: fillerTotals,
    totalFillerWords,
    longPauseCount,
    shortAnswerCount,
    longAnswerCount,
    repetition: analyzeRepetition(
      userTurns.map((t) => t.text),
      project ?? emptyProject
    ),
  };
}
