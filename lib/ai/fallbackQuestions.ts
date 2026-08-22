/**
 * fallbackQuestions.ts
 * ---------------------------------------------------------------------------
 * Sensible judge questions built from project metadata alone, used when Gemini
 * is unavailable.
 *
 * These are NOT as good as generated ones and are not pretending to be: they
 * can reference the project's title and domain, but they cannot follow up on
 * what the student just said, which is the thing that makes real Q&A feel
 * alive. What they do is keep the session running to a complete transcript and
 * a real report instead of dead-ending on a network error.
 *
 * Selection is still project-aware rather than a fixed list: questions carry
 * `appliesWhen` predicates so a project with no AI component is never asked
 * about hallucinations, and one with no user accounts is never asked about
 * authentication. Asking an irrelevant question would break the illusion more
 * thoroughly than a slightly generic relevant one.
 */

import type { ProjectContext, Speaker } from "@/lib/session/sessionTypes";

interface FallbackQuestion {
  speaker: Extract<Speaker, "judge1" | "judge2">;
  topic: string;
  build: (p: ProjectContext) => string;
  appliesWhen?: (p: ProjectContext, haystack: string) => boolean;
}

const mentionsAI = (h: string) =>
  /\b(ai|ml|model|llm|gpt|gemini|neural|machine learning|nlp|inference)\b/i.test(h);
const mentionsData = (h: string) =>
  /\b(user|patient|customer|account|login|auth|data|record|profile|privacy)\b/i.test(h);
const mentionsScale = (h: string) =>
  /\b(platform|users|scale|cloud|server|api|realtime|real-time)\b/i.test(h);

const POOL: FallbackQuestion[] = [
  {
    speaker: "judge1",
    topic: "core problem",
    build: (p) => `Let's start with the basics. What exactly is the problem ${p.name} solves, and who experiences it most acutely?`,
  },
  {
    speaker: "judge1",
    topic: "existing alternatives",
    build: (p) => `There are usually existing options in ${p.domain || "this space"}. What do people do today without your solution, and why isn't that good enough?`,
  },
  {
    speaker: "judge2",
    topic: "architecture",
    build: (p) => `Walk me through the architecture of ${p.name}. What are the main components and why did you split it that way?`,
  },
  {
    speaker: "judge2",
    topic: "technology justification",
    build: (p) => (p.stack
      ? `You've built this with ${p.stack}. What made that the right choice rather than the alternatives?`
      : `What did you build this with, and what made those the right choices for this particular problem?`),
  },
  {
    speaker: "judge2",
    topic: "AI failure handling",
    build: (p) => `You're using AI in ${p.name}. What happens when the model produces something wrong, and how would a user know?`,
    appliesWhen: (_p, h) => mentionsAI(h),
  },
  {
    speaker: "judge2",
    topic: "data protection",
    build: () => `How are you protecting the data users put into this, and who can see it?`,
    appliesWhen: (_p, h) => mentionsData(h),
  },
  {
    speaker: "judge2",
    topic: "scale behaviour",
    build: (p) => `If ${p.name} went from a demo to a few thousand concurrent users tomorrow, what breaks first?`,
    appliesWhen: (_p, h) => mentionsScale(h),
  },
  {
    speaker: "judge1",
    topic: "measurable impact",
    build: (p) => `How would you measure whether ${p.name} is actually working? What number would tell you it's succeeding?`,
  },
  {
    speaker: "judge1",
    topic: "deployment blockers",
    build: () => `What's stopping this from being deployed for real users next month?`,
  },
  {
    speaker: "judge2",
    topic: "honest limitations",
    build: (p) => `What does ${p.name} not do well yet? Be honest — we'd rather hear the real limitation than a polished answer.`,
  },
];

export function selectFallbackQuestions(project: ProjectContext, count: number): FallbackQuestion[] {
  const haystack = [
    project.name, project.domain, project.topic,
    project.description, project.stack ?? "", project.problem ?? "",
  ].join(" ");

  const applicable = POOL.filter((q) => !q.appliesWhen || q.appliesWhen(project, haystack));

  // Alternate speakers so the fallback still reads as a panel rather than one
  // judge monologuing, while keeping question order sensible (problem first,
  // limitations last).
  const out: FallbackQuestion[] = [];
  let wantSpeaker: "judge1" | "judge2" = "judge1";
  const pool = [...applicable];

  while (out.length < count && pool.length) {
    const idx = pool.findIndex((q) => q.speaker === wantSpeaker);
    const pick = idx >= 0 ? pool.splice(idx, 1)[0] : pool.shift()!;
    out.push(pick);
    wantSpeaker = pick.speaker === "judge1" ? "judge2" : "judge1";
  }
  return out;
}

/** A single fallback turn for a given index into the phase. */
export function fallbackTurn(
  project: ProjectContext,
  questionIndex: number,
  isFinalTurn: boolean
): { speaker: "judge1" | "judge2"; reply: string; topicCovered: string } {
  if (isFinalTurn) {
    return {
      speaker: "judge1",
      reply: `Thank you — that gives us a clear picture of ${project.name}. That's everything from us.`,
      topicCovered: "closing",
    };
  }
  const questions = selectFallbackQuestions(project, 6);
  const q = questions[questionIndex % questions.length];
  return { speaker: q.speaker, reply: q.build(project), topicCovered: q.topic };
}

/** Rahul's equivalent, so his phase also survives an outage. */
export function fallbackRahulTurn(
  project: ProjectContext,
  index: number,
  isFinalTurn: boolean
): { speaker: "rahul"; reply: string; topicCovered: string } {
  if (isFinalTurn) {
    return {
      speaker: "rahul",
      reply: "That sounds awesome! Best of luck with the demo — I heard the judges are starting in a few hours, so be ready. I gotta head back to my table. Catch you later!",
      topicCovered: "closing",
    };
  }
  const lines: Array<[string, string]> = [
    ["intro", `Hey! I was just walking around checking out other tables. I'm Rahul, 3rd year CS from RV College. What's your name, and where are you guys from?`],
    ["project discovery", `Awesome to meet you! Your setup looked really interesting from over there. What are you guys building today?`],
    ["stack curiosity", `Nice! What tech stack or libraries did you decide to use for this?`],
    ["architecture", `How does the core workflow actually work behind the scenes?`],
    ["challenges", `What's been the hardest technical hurdle or bug you ran into so far today?`],
    ["features", `How much of it is running live right now versus what's still left to wrap up?`],
    ["peer suggestion", `That's a smart approach. If you're pitching this to the judges, definitely highlight the live demo early on.`],
  ];
  const [topic, reply] = lines[index % lines.length];
  return { speaker: "rahul", reply, topicCovered: topic };
}
