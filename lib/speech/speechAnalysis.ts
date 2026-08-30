/**
 * speechAnalysis.ts
 * ---------------------------------------------------------------------------
 * Pure computation over the transcript & audio VAD metrics — no AI call, no network,
 * runs instantly.
 *
 * Captures user speech behavior faithfully:
 * - Raw transcripts preserved as the authoritative source
 * - Contextual filler word detection (e.g. "I like React" vs "It was, like, fast")
 * - Immediate repetitions & repeated phrases
 * - False start detection ("Our project is... actually, our project was...")
 * - Real audio pause & silence timing integration
 */

import type {
  AudioPauseTiming,
  DetailedUserAnswer,
  ProjectContext,
  SpeechMetrics,
  TranscriptTurn,
} from "@/lib/session/sessionTypes";
import { analyzeRepetition } from "./repetitionAnalysis";

export const FILLER_DICTIONARY = [
  "um",
  "uh",
  "erm",
  "like",
  "you know",
  "basically",
  "actually",
  "so",
  "i mean",
  "kind of",
  "sort of",
  "literally",
  "right",
] as const;

const LONG_PAUSE_MS = 2500; // Inter-turn response delay threshold

/**
 * Context-aware filler word detector.
 * Returns breakdown of counts and occurrences list.
 */
export function detectFillers(text: string): {
  counts: Record<string, number>;
  occurrences: string[];
  total: number;
} {
  if (!text || !text.trim()) {
    return { counts: {}, occurrences: [], total: 0 };
  }

  const lower = text.toLowerCase();
  const counts: Record<string, number> = {};
  const occurrences: string[] = [];

  // 1. Multi-word fillers
  const multiWordFillers = ["you know", "i mean", "kind of", "sort of"];
  for (const filler of multiWordFillers) {
    const regex = new RegExp(`\\b${filler}\\b`, "gi");
    const matches = lower.match(regex);
    if (matches && matches.length > 0) {
      counts[filler] = matches.length;
      matches.forEach(() => occurrences.push(filler));
    }
  }

  // 2. Unambiguous single-word fillers: "um", "uh", "erm", "basically", "literally"
  const unambiguous = ["um", "uh", "erm", "basically", "literally"];
  for (const filler of unambiguous) {
    const regex = new RegExp(`\\b${filler}\\b`, "gi");
    const matches = lower.match(regex);
    if (matches && matches.length > 0) {
      counts[filler] = (counts[filler] ?? 0) + matches.length;
      matches.forEach(() => occurrences.push(filler));
    }
  }

  // 3. "actually" (filler when conversational discourse marker, but skip when purely descriptive e.g. "actually working")
  const actuallyMatches = lower.match(/\bactually\b/gi);
  if (actuallyMatches && actuallyMatches.length > 0) {
    counts["actually"] = (counts["actually"] ?? 0) + actuallyMatches.length;
    actuallyMatches.forEach(() => occurrences.push("actually"));
  }

  // 4. "like" — contextual check
  // Verb check: "I like React", "We like building", "users like this", "people like"
  const likeRegex = /\b([a-z]+)?\s*like\s*([a-z]+)?\b/gi;
  let likeMatch: RegExpExecArray | null;
  while ((likeMatch = likeRegex.exec(lower)) !== null) {
    const prevWord = (likeMatch[1] ?? "").trim();
    const nextWord = (likeMatch[2] ?? "").trim();

    const isSubject = /^(i|we|they|you|people|users|who|everyone|everybody|students)$/i.test(prevWord);
    const isVerbObject = /^(to|the|a|an|this|that|these|those|react|next|python|vue|tailwind|building|using|working|having|doing)$/i.test(nextWord);

    if (isSubject && isVerbObject) {
      // Used as a verb: "I like React", "we like building" -> DO NOT count as filler
      continue;
    }

    counts["like"] = (counts["like"] ?? 0) + 1;
    occurrences.push("like");
  }

  // 5. "so" — contextual check (exclude "so that", "so much", "so many", "so far", "so as to")
  const soRegex = /\bso\b(?:\s+([a-z]+))?/gi;
  let soMatch: RegExpExecArray | null;
  while ((soMatch = soRegex.exec(lower)) !== null) {
    const nextWord = (soMatch[1] ?? "").trim();
    if (/^(that|much|many|far|as|long)$/i.test(nextWord)) {
      // e.g. "so that we could", "so much easier" -> not filler
      continue;
    }
    counts["so"] = (counts["so"] ?? 0) + 1;
    occurrences.push("so");
  }

  // 6. "right" — contextual check (exclude "right now", "right here", "right away", "right side", "that's right")
  const rightRegex = /\b([a-z]+)?\s*right\b(?:\s+([a-z]+))?/gi;
  let rightMatch: RegExpExecArray | null;
  while ((rightMatch = rightRegex.exec(lower)) !== null) {
    const prevWord = (rightMatch[1] ?? "").trim();
    const nextWord = (rightMatch[2] ?? "").trim();

    if (/^(now|here|away|side|direction|after|before|place)$/i.test(nextWord)) continue;
    if (/^(that's|thats|all)$/i.test(prevWord)) continue;

    counts["right"] = (counts["right"] ?? 0) + 1;
    occurrences.push("right");
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, occurrences, total };
}

/**
 * Detect false starts and abandoned/restarted sentence attempts.
 * Examples:
 * - "Our project is... actually, our project was..."
 * - "We built... we were trying to build..."
 * - "It's a... we created a system"
 */
export function detectFalseStarts(text: string): string[] {
  if (!text || !text.trim()) return [];

  const falseStarts: string[] = [];

  // Pattern 1: Correction discourse marker with restart
  const correctionPattern = /\b([a-z\s]{3,30})\b\s*(?:\.{2,3}|,|--|—)?\s*(?:actually|i mean|well|or rather|wait)[,\s]+([a-z\s]{3,30})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = correctionPattern.exec(text)) !== null) {
    const snippet = match[0].trim();
    if (snippet && !falseStarts.includes(snippet)) {
      falseStarts.push(snippet);
    }
  }

  // Pattern 2: Ellipsis or dash restarts ("We built... we were trying")
  const ellipsisRestartPattern = /\b([a-z']+(?:\s+[a-z']+){1,4})\s*(?:\.{2,3}|--|—)\s*([a-z']+(?:\s+[a-z']+){1,4})\b/gi;
  while ((match = ellipsisRestartPattern.exec(text)) !== null) {
    const snippet = match[0].trim();
    if (snippet && !falseStarts.includes(snippet)) {
      falseStarts.push(snippet);
    }
  }

  return falseStarts;
}

/**
 * Generate an optional normalized/cleaned transcript for readability.
 * The raw transcript is always preserved as authoritative.
 */
export function normalizeTranscript(raw: string): string {
  if (!raw || !raw.trim()) return "";

  let cleaned = raw;

  // Remove standalone hesitation sounds at phrase boundaries
  cleaned = cleaned.replace(/\b(?:um|uh|erm)\b[,\s]*/gi, " ");

  // Remove immediate single-word duplicate stutters: "I, I think" -> "I think"
  cleaned = cleaned.replace(/\b([a-zA-Z]+)(?:[,\s]+|\s+)\1\b/gi, "$1");

  // Collapse multiple spaces and trim
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // Ensure first character is capitalized
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Analyzes a single user answer turn into the structured DetailedUserAnswer shape.
 */
export function analyzeSingleAnswer(
  rawTranscript: string,
  pauseTiming?: AudioPauseTiming | null,
  project?: ProjectContext
): DetailedUserAnswer {
  const fillers = detectFillers(rawTranscript);
  const falseStarts = detectFalseStarts(rawTranscript);
  const words = wordCount(rawTranscript);

  const emptyProject: ProjectContext = {
    userName: "",
    college: "",
    name: "",
    domain: "",
    topic: "",
    description: "",
  };

  const rep = analyzeRepetition([rawTranscript], project ?? emptyProject);

  const durationSeconds = pauseTiming?.totalDurationSeconds ?? (pauseTiming?.speechEndTime && pauseTiming?.speechStartTime ? Math.max(0.1, Math.round((pauseTiming.speechEndTime - pauseTiming.speechStartTime) / 100) / 10) : undefined);

  return {
    rawTranscript,
    normalizedTranscript: normalizeTranscript(rawTranscript),
    durationSeconds,
    wordCount: words,
    fillerWords: fillers.occurrences,
    fillerCount: fillers.total,
    fillerBreakdown: fillers.counts,
    repeatedWords: rep.topRepeatedWords.map((w) => w.text),
    repetitionCount: rep.repeatedWordCount,
    repeatedPhrases: rep.topRepeatedPhrases.map((p) => p.text),
    falseStarts,
    pauseCount: pauseTiming?.pauseCount ?? 0,
    longPauseCount: pauseTiming?.longPauseCount ?? 0,
    longPauseDurations: pauseTiming?.longPauseDurations ?? [],
    longestPauseSeconds: pauseTiming?.longestPauseSeconds ?? 0,
    avgPauseDurationSeconds: pauseTiming?.avgPauseDurationSeconds ?? 0,
    speakingDurationSeconds: pauseTiming?.speakingDurationSeconds,
    silenceDurationSeconds: pauseTiming?.silenceDurationSeconds,
    speechStartTime: pauseTiming?.speechStartTime ?? undefined,
    speechEndTime: pauseTiming?.speechEndTime ?? undefined,
    isApproximateTiming: pauseTiming ? !pauseTiming.isAudioVad : true,
  };
}

/**
 * Aggregates speech and pause metrics across all turns into session-level SpeechMetrics.
 */
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
  let totalPauseCount = 0;
  let totalSilenceSeconds = 0;
  let falseStartCount = 0;
  let shortAnswerCount = 0;
  let longAnswerCount = 0;

  let prevCharacterTurnEnd: number | null = null;

  transcript.forEach((turn) => {
    if (turn.speaker !== "user") {
      prevCharacterTurnEnd = turn.endTime ?? prevCharacterTurnEnd;
      return;
    }

    const rawText = turn.rawTranscript || turn.text;
    const words = wordCount(rawText);
    totalWords += words;
    if (words < 8) shortAnswerCount++;
    if (words > 120) longAnswerCount++;

    const fillers = detectFillers(rawText);
    for (const [k, v] of Object.entries(fillers.counts)) {
      fillerTotals[k] = (fillerTotals[k] ?? 0) + v;
    }

    const fs = detectFalseStarts(rawText);
    falseStartCount += fs.length;

    if (turn.detailedAnswer) {
      totalPauseCount += turn.detailedAnswer.pauseCount ?? 0;
      if (turn.detailedAnswer.longPauseCount) {
        longPauseCount += turn.detailedAnswer.longPauseCount;
      }
      if (turn.detailedAnswer.silenceDurationSeconds) {
        totalSilenceSeconds += turn.detailedAnswer.silenceDurationSeconds;
      }
    }

    if (turn.startTime != null && turn.endTime != null) {
      const duration = turn.endTime - turn.startTime;
      totalSpeakingMs += duration;
      timedResponses++;

      if (prevCharacterTurnEnd != null) {
        const gap = turn.startTime - prevCharacterTurnEnd;
        totalResponseTimeMs += Math.max(0, gap);
        if (gap > LONG_PAUSE_MS) {
          longPauseCount++;
        }
      }
    }
    prevCharacterTurnEnd = turn.endTime ?? prevCharacterTurnEnd;
  });

  const totalFillerWords = Object.values(fillerTotals).reduce((a, b) => a + b, 0);
  const minutesSpoken = totalSpeakingMs / 60000;

  const emptyProject: ProjectContext = {
    userName: "",
    college: "",
    name: "",
    domain: "",
    topic: "",
    description: "",
  };

  const avgPauseDurationSeconds =
    totalPauseCount > 0 ? Math.round((totalSilenceSeconds / totalPauseCount) * 10) / 10 : 0;

  return {
    totalSpeakingMs,
    totalResponses: userTurns.length,
    avgResponseTimeMs: timedResponses ? totalResponseTimeMs / timedResponses : 0,
    avgWordsPerResponse: userTurns.length ? totalWords / userTurns.length : 0,
    wordsPerMinute: timedResponses && minutesSpoken > 0.05 ? totalWords / minutesSpoken : null,
    fillerWordCounts: fillerTotals,
    totalFillerWords,
    longPauseCount,
    totalPauseCount,
    avgPauseDurationSeconds,
    totalSilenceSeconds: Math.round(totalSilenceSeconds * 10) / 10,
    falseStartCount,
    shortAnswerCount,
    longAnswerCount,
    repetition: analyzeRepetition(
      userTurns.map((t) => t.rawTranscript || t.text),
      project ?? emptyProject
    ),
  };
}
