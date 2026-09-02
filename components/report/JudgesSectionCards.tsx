"use client";

import React, { useState } from "react";
import type { JudgesEvaluationReport, JudgeQuestionFeedback } from "@/lib/session/sessionTypes";

interface Props {
  judgesReport: JudgesEvaluationReport;
}

export function JudgesOverviewCard({ judgesReport }: Props) {
  const scores = judgesReport.categoryScores;

  const scoreColor = (s: number) => {
    if (s >= 85) return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
    if (s >= 75) return "text-sky-400 border-sky-500/30 bg-sky-500/10";
    if (s >= 65) return "text-amber-400 border-amber-500/30 bg-amber-500/10";
    return "text-rose-400 border-rose-500/30 bg-rose-500/10";
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md shadow-2xl space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-widest text-indigo-400 block mb-1">
            Panel Evaluation Summary
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Hackathon Technical Assessment
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`px-4 py-2 rounded-xl border font-mono text-2xl font-black ${scoreColor(
              judgesReport.overallHackathonScore
            )}`}
          >
            {judgesReport.overallHackathonScore}
            <span className="text-xs font-normal opacity-60"> / 100</span>
          </div>
        </div>
      </div>

      <p className="text-sm sm:text-base text-neutral-300 leading-relaxed">
        {judgesReport.verdictSummary}
      </p>

      {/* 5-Dimension Category Breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-2">
        <div className="rounded-xl border border-white/5 bg-black/40 p-3.5 text-center">
          <span className="text-[11px] text-neutral-400 block mb-1">Technical Depth</span>
          <p className="font-mono text-lg font-bold text-sky-400">{scores.technicalDepth}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/40 p-3.5 text-center">
          <span className="text-[11px] text-neutral-400 block mb-1">Architecture</span>
          <p className="font-mono text-lg font-bold text-indigo-400">{scores.architectureAndDesign}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/40 p-3.5 text-center">
          <span className="text-[11px] text-neutral-400 block mb-1">Problem-Solving</span>
          <p className="font-mono text-lg font-bold text-teal-400">{scores.problemSolvingAndReasoning}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/40 p-3.5 text-center">
          <span className="text-[11px] text-neutral-400 block mb-1">Feasibility</span>
          <p className="font-mono text-lg font-bold text-emerald-400">{scores.feasibilityAndViability}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/40 p-3.5 text-center col-span-2 sm:col-span-1">
          <span className="text-[11px] text-neutral-400 block mb-1">Defense & Clarity</span>
          <p className="font-mono text-lg font-bold text-amber-400">{scores.presentationAndDefense}</p>
        </div>
      </div>
    </div>
  );
}

export function JudgesQuestionAccordion({
  questions,
}: {
  questions: JudgeQuestionFeedback[];
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-widest text-sky-400 block">
            Turn-by-Turn Breakdown
          </span>
          <h3 className="text-lg font-bold text-white">Judge Question & Defense Evaluation</h3>
        </div>
      </div>

      <div className="space-y-3">
        {questions.map((q, idx) => {
          const isOpen = openIdx === idx;
          return (
            <div
              key={idx}
              className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden transition-all"
            >
              <button
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/20 font-mono text-xs font-bold text-sky-400 border border-sky-500/30">
                    Q{q.questionNumber}
                  </span>
                  <div>
                    <span className="text-[11px] text-neutral-400 font-mono block">
                      {q.judgeName}
                    </span>
                    <span className="text-sm font-semibold text-white/90 line-clamp-1">
                      {q.questionTopic || `Question ${q.questionNumber}`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs font-bold text-sky-400 px-2 py-0.5 rounded bg-sky-400/10 border border-sky-400/20">
                    {q.score} / 100
                  </span>
                  <span className="text-neutral-400 text-xs">{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 pt-2 border-t border-white/5 space-y-4 bg-black/30">
                  <div>
                    <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block mb-1">
                      Judge Critique
                    </span>
                    <p className="text-xs sm:text-sm text-neutral-200 leading-relaxed">
                      {q.technicalCritique}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {q.strengths && q.strengths.length > 0 && (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
                        <span className="text-[11px] font-mono font-semibold text-emerald-400 uppercase tracking-wider block mb-1">
                          ✓ What Worked
                        </span>
                        <ul className="text-xs text-neutral-300 space-y-1 list-disc pl-4">
                          {q.strengths.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {q.areasToDeepen && q.areasToDeepen.length > 0 && (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3">
                        <span className="text-[11px] font-mono font-semibold text-amber-400 uppercase tracking-wider block mb-1">
                          ⚠ What to Deepen
                        </span>
                        <ul className="text-xs text-neutral-300 space-y-1 list-disc pl-4">
                          {q.areasToDeepen.map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {q.practicalRecommendation && (
                    <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.04] p-3">
                      <span className="text-[11px] font-mono font-semibold text-sky-400 uppercase tracking-wider block mb-1">
                        💡 Key Recommendation
                      </span>
                      <p className="text-xs text-neutral-200 leading-relaxed">
                        {q.practicalRecommendation}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function JudgesTechnicalDeepDiveCard({ judgesReport }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Top Technical Strengths */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-6 backdrop-blur-md space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🛡️</span>
          <h4 className="text-base font-bold text-white">Top Technical Strengths</h4>
        </div>
        <ul className="space-y-2 text-xs sm:text-sm text-neutral-300">
          {judgesReport.topTechnicalStrengths.map((str, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">•</span>
              <span>{str}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Critical Vulnerabilities or Gaps */}
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.03] p-6 backdrop-blur-md space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚠️</span>
          <h4 className="text-base font-bold text-white">Identified Vulnerabilities & Gaps</h4>
        </div>
        <ul className="space-y-2 text-xs sm:text-sm text-neutral-300">
          {judgesReport.criticalVulnerabilitiesOrGaps.map((gap, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="text-rose-400 mt-0.5">•</span>
              <span>{gap}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function JudgesEdgeCaseAndScaleCard({ judgesReport }: Props) {
  const edge = judgesReport.edgeCaseHandlingAssessment;
  const scale = judgesReport.scalabilityAndArchitectureReview;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Edge Case Handling */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚙️</span>
            <h4 className="text-base font-bold text-white">Edge-Case Resilience</h4>
          </div>
          <span className="font-mono text-xs font-bold text-teal-400 px-2 py-0.5 rounded bg-teal-400/10 border border-teal-400/20">
            {edge.score} / 100
          </span>
        </div>
        <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">{edge.summary}</p>
        {edge.observations && edge.observations.length > 0 && (
          <ul className="text-xs text-neutral-400 space-y-1 list-disc pl-4 pt-1">
            {edge.observations.map((obs, i) => (
              <li key={i}>{obs}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Scalability & Architecture */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📈</span>
            <h4 className="text-base font-bold text-white">Scalability & Architecture</h4>
          </div>
          <span className="font-mono text-xs font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-400/10 border border-indigo-400/20">
            {scale.score} / 100
          </span>
        </div>
        <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">{scale.summary}</p>
        <div className="space-y-1 pt-1 text-xs">
          {scale.pros.map((pro, i) => (
            <p key={i} className="text-emerald-400/90 flex items-center gap-1.5">
              <span>+</span>
              <span>{pro}</span>
            </p>
          ))}
          {scale.cons.map((con, i) => (
            <p key={i} className="text-amber-400/90 flex items-center gap-1.5">
              <span>-</span>
              <span>{con}</span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export function JudgesRecommendationsCard({ judgesReport }: Props) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md shadow-xl space-y-4">
      <div>
        <span className="text-[11px] font-mono uppercase tracking-widest text-sky-400 block mb-1">
          Roadmap Guidance
        </span>
        <h3 className="text-lg font-bold text-white">Judges Post-Hackathon Recommendations</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {judgesReport.judgesRecommendations.map((rec, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-white/5 bg-black/40 p-4 space-y-2"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500/20 text-[10px] font-mono font-bold text-sky-400 border border-sky-500/30">
                {rec.priority || idx + 1}
              </span>
              <h5 className="text-sm font-semibold text-white">{rec.title}</h5>
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed">{rec.rationale}</p>
            {rec.actionableSteps && (
              <p className="text-[11px] text-sky-300/80 bg-sky-500/10 p-2 rounded border border-sky-500/20">
                Action: {rec.actionableSteps}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
