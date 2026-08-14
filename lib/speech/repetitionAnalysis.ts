/**
 * repetitionAnalysis.ts
 * ---------------------------------------------------------------------------
 * Detects repeated words and phrases — and, more importantly, refuses to call
 * all repetition a problem.
 *
 * THE DISTINCTION THAT MATTERS
 *
 * Saying "CareVista" fourteen times while describing CareVista is not a fluency
 * defect; it's the subject of the sentence. Saying "I, I think we, we built" is.
 * A naive frequency count flags both identically and would tell a user to stop
 * naming their own project, which is actively bad advice.
 *
 * So repetition is split three ways:
 *
 *  1. IMMEDIATE REPEATS — the same token twice in a row ("I, I think"). This is
 *     the clearest hesitation signal available from a transcript and is almost
 *     never deliberate in speech.
 *
 *  2. REPEATED PHRASES — 3-5 word n-grams recurring across the session. Catches
 *     the "our system, our system" and verbal-tic patterns.
 *
 *  3. DOMAIN TERMS — frequent words that appear in the project's own metadata
 *     (title, domain, description, stack) or that look like technical
 *     vocabulary. Reported SEPARATELY and never counted toward the problem
 *     totals.
 *
 * Filler words are excluded here because speechAnalysis already counts them;
 * double-penalising "basically" in two sections would inflate the apparent
 * severity of one habit.
 */

import type { ProjectContext, RepetitionMetrics } from "@/lib/session/sessionTypes";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "so", "of", "to", "in",
  "on", "at", "for", "with", "is", "are", "was", "were", "be", "been", "it",
  "this", "that", "these", "those", "we", "i", "you", "they", "he", "she",
  "our", "my", "your", "their", "as", "by", "from", "can", "will", "would",
  "have", "has", "had", "do", "does", "did", "not", "no", "yes", "there",
  "here", "what", "which", "who", "when", "where", "how", "very", "just",
]);

/** Already counted by speechAnalysis — excluded so one habit isn't scored twice. */
const FILLERS = new Set([
  "um", "uh", "like", "basically", "actually", "so", "right", "literally",
]);

/**
 * 1, not 2. An earlier version used 2 and silently missed "I, I think" — the
 * single most common stutter in English — because "I" is one character. Caught
 * by a test, which is exactly the kind of off-by-one that reads as correct.
 */
const IMMEDIATE_REPEAT_MIN_LEN = 1;
const PHRASE_MIN_WORDS = 3;
const PHRASE_MAX_WORDS = 5;
const PHRASE_MIN_OCCURRENCES = 2;
const DOMAIN_TERM_MIN_OCCURRENCES = 3;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Words drawn from the project itself — the user's legitimate vocabulary. */
function domainVocabulary(project: ProjectContext): Set<string> {
  const source = [
    project.name,
    project.domain,
    project.topic,
    project.description,
    project.stack ?? "",
    project.problem ?? "",
  ].join(" ");
  const vocab = new Set<string>();
  for (const w of tokenize(source)) {
    if (w.length > 3 && !STOPWORDS.has(w)) vocab.add(w);
  }
  // Words that read as technical regardless of whether the user listed them.
  for (const w of [
    "api", "database", "backend", "frontend", "model", "server", "cloud",
    "authentication", "encryption", "latency", "scalability", "architecture",
    "algorithm", "dataset", "inference", "deployment", "pipeline", "token",
  ]) {
    vocab.add(w);
  }
  return vocab;
}

export function analyzeRepetition(
  userTexts: string[],
  project: ProjectContext
): RepetitionMetrics {
  const vocab = domainVocabulary(project);

  const immediate = new Map<string, number>();
  const phraseCounts = new Map<string, number>();
  const wordCounts = new Map<string, number>();

  for (const text of userTexts) {
    const tokens = tokenize(text);

    // 1. Immediate repeats within a single answer.
    for (let i = 1; i < tokens.length; i++) {
      const w = tokens[i];
      if (
        w === tokens[i - 1] &&
        w.length >= IMMEDIATE_REPEAT_MIN_LEN &&
        !FILLERS.has(w)
      ) {
        immediate.set(w, (immediate.get(w) ?? 0) + 1);
      }
    }

    // 2. Phrase n-grams.
    for (let n = PHRASE_MIN_WORDS; n <= PHRASE_MAX_WORDS; n++) {
      for (let i = 0; i + n <= tokens.length; i++) {
        const gram = tokens.slice(i, i + n);
        // Skip grams that are all stopwords — "and then we had to" is noise.
        if (gram.every((w) => STOPWORDS.has(w) || FILLERS.has(w))) continue;
        const key = gram.join(" ");
        phraseCounts.set(key, (phraseCounts.get(key) ?? 0) + 1);
      }
    }

    // 3. Word frequency, for the domain-term split.
    for (const w of tokens) {
      if (w.length > 3 && !STOPWORDS.has(w) && !FILLERS.has(w)) {
        wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
      }
    }
  }

  // Keep only the longest form of overlapping repeated phrases: if "our system
  // basically handles" recurs, its shorter sub-grams recur identically and
  // would triple-count the same habit.
  const repeatedPhrases = [...phraseCounts.entries()]
    .filter(([, c]) => c >= PHRASE_MIN_OCCURRENCES)
    .sort((a, b) => b[0].length - a[0].length);

  const kept: Array<{ text: string; count: number }> = [];
  for (const [phrase, count] of repeatedPhrases) {
    const subsumed = kept.some((k) => k.text.includes(phrase) && k.count === count);
    if (!subsumed) kept.push({ text: phrase, count });
  }

  const topRepeatedWords = [...immediate.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([text, count]) => ({ text, count }));

  const domainTermRepeats = [...wordCounts.entries()]
    .filter(([w, c]) => c >= DOMAIN_TERM_MIN_OCCURRENCES && vocab.has(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([text, count]) => ({ text, count }));

  const topRepeatedPhrases = kept
    .filter((p) => {
      // A phrase built entirely from the project's own vocabulary is the user
      // describing their project consistently, not a verbal tic.
      const words = p.text.split(" ");
      const domainWords = words.filter((w) => vocab.has(w)).length;
      return domainWords / words.length < 0.6;
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    repeatedWordCount: [...immediate.values()].reduce((a, b) => a + b, 0),
    repeatedPhraseCount: topRepeatedPhrases.reduce((a, p) => a + p.count, 0),
    topRepeatedWords,
    topRepeatedPhrases,
    domainTermRepeats,
  };
}
