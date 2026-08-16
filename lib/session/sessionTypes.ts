/**
 * sessionTypes.ts
 * ---------------------------------------------------------------------------
 * Shared vocabulary for everything that isn't the visual scene. Kept in one
 * file because conversation, speech, vision and reporting all need the same
 * shapes and drift badly if each layer invents its own.
 */

export interface ProjectContext {
  /** The user's own name — Rahul and the judges address them by it. */
  userName: string;
  college: string;
  /** Project title. */
  name: string;
  /** Domain, e.g. HealthTech / FinTech / EdTech / Sustainability. */
  domain: string;
  topic: string;
  description: string;
  stack?: string;
  problem?: string;
}

/** Who is speaking in a given turn. */
export type Speaker = "rahul" | "judge1" | "judge2" | "user" | "system";

export interface TranscriptTurn {
  id: string;
  speaker: Speaker;
  text: string;
  /** Which conversation stage this turn belongs to, for per-stage slicing and
   * for the report's transcript formatting. */
  stage: ConversationStage;
  /** Only CHARACTER_DIALOGUE is ever spoken aloud. */
  kind: MessageKind;
  /** Performance.now()-relative ms timestamps. Absent for character turns. */
  startTime?: number;
  endTime?: number;
  /** Present on user turns once evaluated. */
  evaluation?: TurnEvaluation;
}

/**
 * Structured, evidence-required scoring for one user answer. `evidence` is
 * mandatory rather than optional: a model that has to quote the transcript
 * before scoring is much harder to flatter with a high number by default.
 */
export interface TurnEvaluation {
  relevance: number; // 0-10
  clarity: number;
  specificity: number;
  technicalDepth: number;
  completeness: number;
  /** A short verbatim-ish span from the user's answer that grounds the scores. */
  evidence: string;
  feedback: string;
}

/**
 * Session phases. Note these are NOT the same as "which character is talking" —
 * the judge Q&A is a single phase in which BOTH judges participate as a panel,
 * choosing who speaks per turn. Modelling it as separate judge1/judge2 phases
 * was what forced the unnatural "Judge 1 finishes, then Judge 2 starts" pattern.
 */
export type ConversationStage =
  | "rahul"          // peer conversation, ~5 min
  | "judgeIntro"     // judges establish college / project / domain
  | "presentation"   // user presents uninterrupted, 2-3 min
  | "judgeQA"        // collaborative panel Q&A, ~5-7 min
  | "done";

export interface ConversationState {
  stage: ConversationStage;
  transcript: TranscriptTurn[];
  /** Topics/questions already covered, so the model doesn't repeat itself. */
  questionsAsked: string[];
  /** Rahul has a soft turn budget; judges alternate until each has asked enough. */
  turnsTakenThisStage: number;
  isComplete: boolean;
}

/**
 * Answer counts per phase, tuned to the durations in the spec rather than
 * picked round. Assuming ~35-45s per exchange once the model's line and a
 * considered answer are both counted, 7 exchanges lands Rahul near five
 * minutes, and 6 Q&A exchanges lands the panel in the 5-7 minute band.
 */
export const STAGE_TURN_TARGET: Record<Exclude<ConversationStage, "done">, number> = {
  rahul: 10,
  judgeIntro: 3,
  presentation: 1,
  judgeQA: 6,
};

/** Order phases advance in. */
export const STAGE_ORDER: ConversationStage[] = [
  "rahul", "judgeIntro", "presentation", "judgeQA", "done",
];

/** Seconds the user gets for the uninterrupted presentation. */
export const PRESENTATION_SECONDS = 180;

/**
 * Message classification. The spec is explicit that UI/system text must never
 * reach the TTS engine — only lines a character actually says out loud. Making
 * this a type rather than a convention means the speak() call site can't
 * accidentally read from the wrong bucket.
 */
export type MessageKind = "CHARACTER_DIALOGUE" | "SYSTEM_MESSAGE";

/**
 * Phase timing. ISO strings so they survive JSON round-trips to the report
 * endpoint intact, unlike performance.now() values which are only meaningful
 * inside the tab that produced them.
 *
 * Every field is optional because a session can legitimately end early — a user
 * who closes the tab during Rahul's phase has no presentation timestamps, and
 * the report must handle that rather than assuming a complete run.
 */
export interface SessionTimestamps {
  sessionStartedAt?: string;
  rahulPhaseStartedAt?: string;
  rahulPhaseEndedAt?: string;
  presentationStartedAt?: string;
  presentationEndedAt?: string;
  judgeQnaStartedAt?: string;
  judgeQnaEndedAt?: string;
  sessionEndedAt?: string;
}

/** Durations in seconds, derived from the ISO timestamps above. */
export interface SessionDurations {
  totalSeconds: number | null;
  rahulSeconds: number | null;
  presentationSeconds: number | null;
  judgeQnaSeconds: number | null;
}

function diffSeconds(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 1000) : null;
}

export function computeDurations(t: SessionTimestamps): SessionDurations {
  return {
    totalSeconds: diffSeconds(t.sessionStartedAt, t.sessionEndedAt),
    rahulSeconds: diffSeconds(t.rahulPhaseStartedAt, t.rahulPhaseEndedAt),
    presentationSeconds: diffSeconds(t.presentationStartedAt, t.presentationEndedAt),
    judgeQnaSeconds: diffSeconds(t.judgeQnaStartedAt, t.judgeQnaEndedAt),
  };
}

/**
 * Session identifier. crypto.randomUUID needs a secure context, which localhost
 * and https both are — but an http:// LAN address during testing is not, so the
 * fallback matters in practice rather than being defensive noise.
 *
 * Contains no secret material: it's a random opaque handle used to correlate a
 * transcript, a recording and a report, nothing more.
 */
export function newSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface RepetitionMetrics {
  /** Immediate stutter-style repeats: "I, I think". */
  repeatedWordCount: number;
  /** Repeated multi-word phrases across the session. */
  repeatedPhraseCount: number;
  topRepeatedWords: Array<{ text: string; count: number }>;
  topRepeatedPhrases: Array<{ text: string; count: number }>;
  /**
   * Terms repeated often but which look like the project's own vocabulary.
   * Surfaced separately and explicitly NOT counted as a fluency problem —
   * saying "CareVista" twelve times while describing CareVista is correct.
   */
  domainTermRepeats: Array<{ text: string; count: number }>;
}

/**
 * Approximate overlap detection. Named "possible" everywhere it surfaces
 * because the Web Speech API gives us event boundaries, not diarized audio —
 * we can see that recognition fired while TTS was still playing, but we cannot
 * prove the user was actually talking over the character rather than, say, the
 * recogniser picking up the speakers.
 */
export interface InterruptionMetrics {
  possibleUserInterruptions: number;
  possibleAiInterruptions: number;
  totalPossibleInterruptions: number;
  estimatedOverlapMs: number;
  /** Always true here. Kept explicit so the report can never overclaim. */
  isApproximate: true;
}

export interface SpeechMetrics {
  totalSpeakingMs: number;
  totalResponses: number;
  avgResponseTimeMs: number;
  avgWordsPerResponse: number;
  wordsPerMinute: number | null; // null if timing data is unavailable (typed input)
  fillerWordCounts: Record<string, number>;
  totalFillerWords: number;
  longPauseCount: number;
  shortAnswerCount: number; // under ~8 words
  longAnswerCount: number; // over ~120 words
  repetition: RepetitionMetrics;
}

export interface WebcamMetrics {
  enabled: true;
  forwardFacingRatio: number; // 0-1
  averageHeadTurnDegrees: number;
  blinkRatePerMinute: number;
  sampleCount: number;
}

export interface WebcamDisabled {
  enabled: false;
}

export type WebcamResult = WebcamMetrics | WebcamDisabled;

export interface QuestionBreakdown {
  question: string;
  answerSummary: string;
  whatWasGood: string;
  whatWasWeak: string;
  whatTheJudgeWasTesting: string;
  /** A stronger rewrite that must use the user's REAL project, not invented features. */
  strongerAnswer: string;
}

export interface CoachingReport {
  sessionId?: string;
  generatedAt?: string;
  durations?: SessionDurations;
  overall: {
    communicationScore: number;
    technicalExplanationScore: number;
    clarityScore: number;
    confidenceScore: number;
    questionHandlingScore: number;
    specificityScore: number;
    structureScore: number;
    relevanceScore: number;
  };
  whatYouDidWell: string[];
  whatYouMissed: string[];
  communicationAnalysis: string;
  technicalCommunication: string;
  questionBreakdown: QuestionBreakdown[];
  speakingPatterns: string;
  answerQuality: string;
  bodyLanguage: string | null; // null when camera was off
  mostImportantImprovement: string;
  howToPractice: string;
  narrativeSummary: string;
  /** Distinguishes hesitation-repetition from deliberate emphasis. */
  repetitionAnalysis?: string;
  /** Deliberately hedged language — see InterruptionMetrics. */
  interruptionNotes?: string;
  /** True when the AI call failed and this was assembled from metrics alone. */
  isFallback?: boolean;
}

export function newTurnId(): string {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Compress a phase's user answers into one line of context for a later phase.
 *
 * Lives here rather than in conversationService because the client orchestrator
 * needs it and conversationService is server-only — importing it from a client
 * component is exactly the leak the `server-only` guard is there to catch, and
 * it did catch it. This is pure string work with no server dependency, so
 * sessionTypes is the honest home for it.
 *
 * Done locally rather than with another Gemini call: it's context, not
 * analysis, and an extra round trip per phase transition isn't worth it on a
 * free tier.
 */
export function summarisePhase(turns: TranscriptTurn[], limit = 400): string {
  const answers = turns
    .filter((t) => t.speaker === "user")
    .map((t) => t.text)
    .join(" ");
  return answers.length > limit ? `${answers.slice(0, limit)}\u2026` : answers;
}
