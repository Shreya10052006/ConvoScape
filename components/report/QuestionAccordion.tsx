"use client";

import { useState } from "react";
import type {
  ProjectContext,
  StudentQuestionFeedback,
  TranscriptTurn,
} from "@/lib/session/sessionTypes";

interface Props {
  feedbackList: StudentQuestionFeedback[];
  transcript?: TranscriptTurn[];
  project?: ProjectContext;
}

const FIXED_QUESTIONS_TEXT: Record<number, string> = {
  1: "So, what are you guys working on? I've been seeing so many different projects around here, so I'm curious — what's yours about, and what made you guys decide to build it?",
  3: "Yeah, I get what you mean. One thing I always find interesting with hackathon projects is how different the idea sounds compared to actually using it. If you had to show this to someone who knew nothing about it, what would you want them to understand first?",
  5: "By the way, I always get curious about the tech side of these projects. When you guys were actually building this, what part ended up being more difficult than you expected?",
  7: "Okay, random question — if you guys actually got another month to keep working on this after the hackathon, what would you change or add first?",
  9: "Honestly, after working on it and talking about it this much, what's the one part of your project you're most excited to show someone?",
};

export default function QuestionAccordion({ feedbackList, transcript, project }: Props) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  if (!feedbackList || feedbackList.length === 0) return null;

  const characterTurns = transcript
    ? transcript.filter((t) => t.speaker === "rahul" || t.kind === "CHARACTER_DIALOGUE")
    : [];
  const userTurns = transcript ? transcript.filter((t) => t.speaker === "user") : [];

  return (
    <div className="space-y-3">
      {feedbackList.map((item, idx) => {
        const isExpanded = expandedIndex === idx;
        const qNum = item.questionNumber || idx + 1;
        const isTailored = qNum % 2 === 0;

        // Retrieve stored question and answer from session transcript
        const rahulTurn = characterTurns[qNum];
        const userTurn = userTurns[qNum];

        const questionText =
          rahulTurn?.text ||
          FIXED_QUESTIONS_TEXT[qNum] ||
          `Question ${qNum} regarding ${project?.name || "the project"}`;
        const answerText =
          userTurn?.text || userTurns[qNum - 1]?.text || "(User answer recorded during session)";

        const scoreColor =
          item.score >= 80
            ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
            : item.score >= 65
            ? "text-sky-400 border-sky-500/30 bg-sky-500/10"
            : "text-amber-400 border-amber-500/30 bg-amber-500/10";

        return (
          <div
            key={qNum}
            className="overflow-hidden rounded-xl border border-white/10 bg-neutral-900/60 backdrop-blur-sm transition-all duration-200"
          >
            {/* Header / Clickable summary */}
            <button
              type="button"
              onClick={() => setExpandedIndex(isExpanded ? null : idx)}
              className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 font-mono text-xs font-bold text-neutral-200">
                  Q{qNum}
                </span>
                <p className="truncate text-sm font-medium text-neutral-200">{questionText}</p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className={`rounded-lg border px-2 py-0.5 font-mono text-xs font-semibold ${scoreColor}`}>
                  {item.score} / 100
                </span>
                <svg
                  className={`h-4 w-4 text-neutral-400 transition-transform duration-200 ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Expandable Details */}
            {isExpanded && (
              <div className="border-t border-white/5 bg-black/40 p-5 space-y-4">
                {/* Rahul's Stored Question */}
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-widest text-sky-400 mb-1">
                    Rahul&apos;s Question
                  </p>
                  <p className="text-sm text-neutral-200 bg-white/5 p-3 rounded-lg border border-white/10">
                    &ldquo;{questionText}&rdquo;
                  </p>
                </div>

                {/* User's Stored Raw Spoken Answer */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">
                      Your Spoken Answer (Raw Capture)
                    </p>
                    {userTurn?.detailedAnswer?.durationSeconds && (
                      <span className="font-mono text-[10px] text-sky-400 bg-sky-950/40 px-2 py-0.5 rounded border border-sky-500/20">
                        {userTurn.detailedAnswer.durationSeconds.toFixed(1)}s
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-200 bg-black/60 p-3.5 rounded-lg border border-white/10 font-normal leading-relaxed">
                    &ldquo;{answerText}&rdquo;
                  </p>

                  {/* Per-Answer Speech Analytics Badges */}
                  {userTurn?.detailedAnswer && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 text-[11px] font-mono text-neutral-400">
                      <span className="rounded bg-white/5 px-2 py-0.5 border border-white/10 text-neutral-300">
                        {userTurn.detailedAnswer.wordCount} words
                      </span>
                      {userTurn.detailedAnswer.fillerCount > 0 && (
                        <span className="rounded bg-amber-950/30 px-2 py-0.5 border border-amber-500/20 text-amber-300">
                          {userTurn.detailedAnswer.fillerCount} filler{userTurn.detailedAnswer.fillerCount > 1 ? "s" : ""}
                          {userTurn.detailedAnswer.fillerWords.length > 0
                            ? ` (${Array.from(new Set(userTurn.detailedAnswer.fillerWords)).slice(0, 3).join(", ")})`
                            : ""}
                        </span>
                      )}
                      {(userTurn.detailedAnswer.pauseCount ?? 0) > 0 && (
                        <span className="rounded bg-sky-950/30 px-2 py-0.5 border border-sky-500/20 text-sky-300">
                          {userTurn.detailedAnswer.pauseCount} pause{userTurn.detailedAnswer.pauseCount! > 1 ? "s" : ""}
                          {userTurn.detailedAnswer.longPauseCount ? ` (${userTurn.detailedAnswer.longPauseCount} long)` : ""}
                        </span>
                      )}
                      {userTurn.detailedAnswer.falseStarts && userTurn.detailedAnswer.falseStarts.length > 0 && (
                        <span className="rounded bg-purple-950/30 px-2 py-0.5 border border-purple-500/20 text-purple-300">
                          {userTurn.detailedAnswer.falseStarts.length} false start{userTurn.detailedAnswer.falseStarts.length > 1 ? "s" : ""}
                        </span>
                      )}
                      {userTurn.detailedAnswer.repetitionCount > 0 && (
                        <span className="rounded bg-rose-950/30 px-2 py-0.5 border border-rose-500/20 text-rose-300">
                          {userTurn.detailedAnswer.repetitionCount} repeat{userTurn.detailedAnswer.repetitionCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Tags if present */}
                {item.communicationTags && item.communicationTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {item.communicationTags.map((tag, tIdx) => (
                      <span
                        key={tIdx}
                        className="rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] text-neutral-400 border border-white/10"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Feedback Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  {/* What Worked */}
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-3.5 space-y-2">
                    <p className="flex items-center gap-1.5 font-mono text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                      <span>✓</span> What Worked
                    </p>
                    <ul className="space-y-1.5 text-xs text-emerald-200/90 list-disc list-inside">
                      {item.whatWorked.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>

                  {/* What Could Improve */}
                  <div className="rounded-lg border border-amber-500/20 bg-amber-950/20 p-3.5 space-y-2">
                    <p className="flex items-center gap-1.5 font-mono text-xs font-semibold text-amber-400 uppercase tracking-wider">
                      <span>•</span> What Could Improve
                    </p>
                    <ul className="space-y-1.5 text-xs text-amber-200/90 list-disc list-inside">
                      {item.whatCouldImprove.map((ci, i) => (
                        <li key={i}>{ci}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Suggested Better Approach */}
                {item.betterApproach && (
                  <div className="rounded-lg border border-sky-500/20 bg-sky-950/20 p-3.5 space-y-1.5">
                    <p className="font-mono text-xs font-semibold text-sky-400 uppercase tracking-wider">
                      💡 How You Could Answer More Effectively
                    </p>
                    <p className="text-xs text-sky-200/90 leading-relaxed">{item.betterApproach}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
