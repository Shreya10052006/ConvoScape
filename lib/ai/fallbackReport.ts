/**
 * fallbackReport.ts
 * ---------------------------------------------------------------------------
 * A report built from measured facts alone, with no AI involvement.
 *
 * This exists because "the AI call failed so you get nothing" is the worst
 * possible ending to a session someone just spent fifteen minutes on. Every
 * number here is something we actually counted — filler words, pacing, answer
 * lengths, and the per-turn scores Gemini already returned DURING the
 * conversation (which are still in the transcript even if the final report call
 * fails). Nothing is invented.
 *
 * It is deliberately honest about being degraded: `isFallback` is set, and the
 * UI says so plainly rather than passing this off as the full coaching report.
 */

import type {
  CoachingReport,
  ProjectContext,
  SpeechMetrics,
  TranscriptTurn,
  WebcamResult,
} from "@/lib/session/sessionTypes";

function averageTurnScores(transcript: TranscriptTurn[]) {
  const evals = transcript.map((t) => t.evaluation).filter(Boolean) as NonNullable<
    TranscriptTurn["evaluation"]
  >[];
  if (!evals.length) return null;
  const mean = (pick: (e: (typeof evals)[number]) => number) =>
    Math.round(evals.reduce((s, e) => s + pick(e), 0) / evals.length);
  return {
    relevance: mean((e) => e.relevance),
    clarity: mean((e) => e.clarity),
    specificity: mean((e) => e.specificity),
    technicalDepth: mean((e) => e.technicalDepth),
    completeness: mean((e) => e.completeness),
  };
}

export function buildFallbackReport(
  project: ProjectContext,
  transcript: TranscriptTurn[],
  m: SpeechMetrics,
  webcam: WebcamResult
): CoachingReport {
  const avg = averageTurnScores(transcript);
  const answers = transcript.filter((t) => t.speaker === "user");

  // Where per-turn scores exist, use them; otherwise derive a conservative
  // proxy from measured behaviour. Never a flattering default.
  const clarity = avg?.clarity ?? (m.totalFillerWords > answers.length * 3 ? 4 : 6);
  const specificity = avg?.specificity ?? (m.avgWordsPerResponse < 20 ? 4 : 6);
  const technical = avg?.technicalDepth ?? 5;
  const relevance = avg?.relevance ?? 6;
  const completeness = avg?.completeness ?? (m.shortAnswerCount > answers.length / 3 ? 4 : 6);

  const fillerTop = Object.entries(m.fillerWordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w, c]) => `"${w}" ${c} time${c === 1 ? "" : "s"}`);

  const speakingPatterns = [
    fillerTop.length
      ? `Across ${answers.length} answers you used ${m.totalFillerWords} filler words in total — most often ${fillerTop.join(", ")}.`
      : `No significant filler-word usage was detected across your ${answers.length} answers.`,
    m.wordsPerMinute != null
      ? `Your speaking pace averaged about ${m.wordsPerMinute.toFixed(0)} words per minute.`
      : `Speaking pace wasn't measurable for this session (answers were typed rather than spoken).`,
    m.longPauseCount > 0
      ? `There were ${m.longPauseCount} noticeably long pauses before you began answering.`
      : ``,
  ]
    .filter(Boolean)
    .join(" ");

  const answerQuality = [
    `You averaged ${m.avgWordsPerResponse.toFixed(0)} words per answer.`,
    m.shortAnswerCount > 0
      ? `${m.shortAnswerCount} answer${m.shortAnswerCount === 1 ? " was" : "s were"} very short (under eight words), which usually means a judge didn't get enough to work with.`
      : ``,
    m.longAnswerCount > 0
      ? `${m.longAnswerCount} answer${m.longAnswerCount === 1 ? " ran" : "s ran"} past 120 words, where the main point tends to get buried.`
      : ``,
  ]
    .filter(Boolean)
    .join(" ");

  const wins: string[] = [];
  if (m.totalFillerWords <= answers.length) wins.push("You kept filler words low, which makes you sound more certain of your material.");
  if (m.shortAnswerCount === 0 && answers.length > 0) wins.push("You gave every question a substantive answer rather than a one-liner.");
  if (m.wordsPerMinute != null && m.wordsPerMinute >= 110 && m.wordsPerMinute <= 165) {
    wins.push(`Your pace (~${m.wordsPerMinute.toFixed(0)} wpm) sat in a comfortable listening range.`);
  }
  if (!wins.length) wins.push(`You completed a full practice session on ${project.name} and produced a transcript to work from — that's the part most people skip.`);

  const gaps: string[] = [];
  if (m.totalFillerWords > answers.length * 3) gaps.push(`Filler words were frequent (${m.totalFillerWords} total), which tends to read as uncertainty even when the content is solid.`);
  if (m.shortAnswerCount > 0) gaps.push(`${m.shortAnswerCount} answer${m.shortAnswerCount === 1 ? "" : "s"} were too short to demonstrate depth.`);
  if (m.longAnswerCount > 0) gaps.push(`${m.longAnswerCount} answer${m.longAnswerCount === 1 ? "" : "s"} ran long enough that the key point likely got lost.`);
  if (m.longPauseCount > 2) gaps.push(`Several long pauses before answering suggest some questions caught you without a prepared line.`);
  if (!gaps.length) gaps.push("No measurable weak patterns stood out in the speech metrics for this session.");

  const rep = m.repetition;
  const repetitionAnalysis = rep
    ? [
        rep.repeatedWordCount > 0
          ? `You repeated a word immediately ${rep.repeatedWordCount} time${rep.repeatedWordCount === 1 ? "" : "s"}${rep.topRepeatedWords.length ? ` (most often ${rep.topRepeatedWords.map((w) => `"${w.text}"`).join(", ")})` : ""}. That pattern usually means the next phrase wasn't ready yet — it reads as hesitation rather than emphasis.`
          : `No stutter-style repetition was detected.`,
        rep.topRepeatedPhrases.length
          ? `You reused the phrase ${rep.topRepeatedPhrases.map((p) => `"${p.text}"`).join(", ")}. Varying these keeps a listener's attention on the content rather than the pattern.`
          : ``,
        rep.domainTermRepeats.length
          ? `You used ${rep.domainTermRepeats.map((w) => w.text).join(", ")} repeatedly — that's your project's own vocabulary and repeating it is correct. Consistent naming helps a judge follow you; don't vary it for the sake of variety.`
          : ``,
      ].filter(Boolean).join(" ")
    : "";

  return {
    overall: {
      communicationScore: Math.round((clarity + relevance) / 2),
      technicalExplanationScore: technical,
      clarityScore: clarity,
      confidenceScore: Math.max(1, Math.min(10, 7 - Math.floor(m.totalFillerWords / Math.max(1, answers.length)))),
      questionHandlingScore: completeness,
      specificityScore: specificity,
      structureScore: Math.round((clarity + completeness) / 2),
      relevanceScore: relevance,
    },
    whatYouDidWell: wins,
    whatYouMissed: gaps,
    communicationAnalysis: speakingPatterns,
    technicalCommunication:
      avg != null
        ? `Across the session your answers averaged ${technical}/10 on technical depth and ${specificity}/10 on specificity, based on scoring collected during the conversation itself.`
        : `Per-answer technical scoring wasn't available for this session.`,
    questionBreakdown: [],
    speakingPatterns,
    answerQuality,
    bodyLanguage: webcam.enabled
      ? `Camera analysis recorded ${(webcam.forwardFacingRatio * 100).toFixed(0)}% forward-facing time with an average head turn of ${webcam.averageHeadTurnDegrees.toFixed(0)} degrees.`
      : null,
    mostImportantImprovement:
      m.shortAnswerCount > 0
        ? "Your shortest answers are costing you the most. For each judge question, give the problem in one sentence, your approach in two, and a concrete example in one — that structure alone fixes most thin answers."
        : "Practise leading with the problem before the technology. Judges consistently rate answers higher when they understand what's at stake before they hear the stack.",
    howToPractice: `Set a timer for 60 seconds and explain ${project.name} out loud using only this structure: the problem, who has it, your approach, and one concrete example. Record yourself and count filler words. Repeat until you can do it without one.`,
    repetitionAnalysis,
    narrativeSummary: `This is a metrics-only summary of your ${project.name} session. The AI coaching layer couldn't be generated this time, so everything above comes from directly measured speech data and the per-answer scoring collected during the conversation — nothing here is estimated or invented.`,
    isFallback: true,
  };
}
