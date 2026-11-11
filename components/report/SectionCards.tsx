"use client";

import React, { useState } from "react";
import type {
  StudentCommunicationReport,
  TranscriptTurn,
} from "@/lib/session/sessionTypes";

export function OverviewScoreCard({ report }: { report: StudentCommunicationReport }) {
  const categories = [
    { label: "Clarity", score: report.categoryScores.clarity },
    { label: "Relevance", score: report.categoryScores.relevance },
    { label: "Structure", score: report.categoryScores.structure },
    { label: "Technical Communication", score: report.categoryScores.technicalCommunication },
    { label: "Spontaneous Thinking", score: report.categoryScores.spontaneousThinking },
    { label: "Conciseness", score: report.categoryScores.conciseness },
  ];

  return (
    <div className="rounded-2xl border border-white/15 bg-gradient-to-br from-neutral-900/90 via-neutral-900/60 to-black/80 p-6 md:p-8 backdrop-blur-md shadow-2xl space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/10 pb-6">
        <div>
          <span className="inline-block rounded-full bg-sky-500/10 px-3 py-1 font-mono text-xs uppercase tracking-widest text-sky-400 border border-sky-500/20 mb-2">
            Student Communication Report
          </span>
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Communication Performance</h2>
          <p className="text-sm text-neutral-400 mt-1 max-w-xl">
            Qualitative analysis of your 10-turn practice dialogue with Rahul.
          </p>
        </div>

        {/* Overall Score Meter */}
        <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 shrink-0">
          <div className="text-center">
            <span className="font-mono text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-teal-300 to-emerald-400">
              {report.overallScore}
            </span>
            <span className="font-mono text-sm text-neutral-400 block mt-0.5">/ 100</span>
          </div>
          <div className="h-10 w-px bg-white/10" />
          <div className="text-xs text-neutral-300 space-y-0.5 font-medium">
            <p className="text-emerald-400 font-semibold">
              {report.overallScore >= 80
                ? "Strong Communication"
                : report.overallScore >= 65
                ? "Solid Foundation"
                : "Needs Polish"}
            </p>
            <p className="text-neutral-400 text-[11px]">Peer Practice Session</p>
          </div>
        </div>
      </div>

      {/* Category Scores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((cat, i) => {
          const score = cat.score ?? 75;
          const barWidth = `${score}%`;
          const scoreColor =
            score >= 80 ? "bg-emerald-400" : score >= 65 ? "bg-sky-400" : "bg-amber-400";

          return (
            <div key={i} className="rounded-xl border border-white/5 bg-black/40 p-4 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-neutral-300">{cat.label}</span>
                <span className="font-mono font-bold text-neutral-100">{score} / 100</span>
              </div>
              <div className="h-2 w-full rounded-full bg-neutral-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${scoreColor} transition-all duration-500`}
                  style={{ width: barWidth }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CommunicationSummaryCard({ summary }: { summary: string }) {
  return (
    <div className="rounded-xl border border-sky-500/20 bg-sky-950/20 p-5 md:p-6 space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-sky-400 font-mono">
        <span>💬</span> Communication Summary
      </h3>
      <p className="text-sm md:text-base text-neutral-200 leading-relaxed">{summary}</p>
    </div>
  );
}

export function UnexpectedPerformanceCard({
  perf,
}: {
  perf: StudentCommunicationReport["unexpectedQuestionPerformance"];
}) {
  return (
    <div className="rounded-xl border border-purple-500/20 bg-purple-950/20 p-5 md:p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-purple-300 font-mono flex items-center gap-2">
          <span>⚡</span> Spontaneous Thinking & Unexpected Questions
        </h3>
        <span className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1 font-mono text-sm font-bold text-purple-300">
          {perf.score} / 100
        </span>
      </div>
      <p className="text-sm text-neutral-200 leading-relaxed">{perf.summary}</p>
      {perf.observations && perf.observations.length > 0 && (
        <ul className="text-xs text-purple-200/80 bg-black/30 p-3 rounded-lg border border-purple-500/10 space-y-1 list-disc list-inside">
          {perf.observations.map((obs, i) => (
            <li key={i}>{obs}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TechnicalCommunicationCard({
  tech,
}: {
  tech: StudentCommunicationReport["technicalCommunication"];
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-5 md:p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-300 font-mono flex items-center gap-2">
          <span>⚙️</span> Technical Communication & Knowledge Articulation
        </h3>
        <span className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1 font-mono text-sm font-bold text-sky-300">
          {tech.score} / 100
        </span>
      </div>

      <p className="text-sm text-neutral-200 leading-relaxed">{tech.summary}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
        {tech.strengths && tech.strengths.length > 0 && (
          <div className="bg-black/40 p-4 rounded-lg border border-emerald-500/20 space-y-1.5">
            <p className="font-mono text-xs text-emerald-400 uppercase tracking-wider">Technical Strengths</p>
            <ul className="text-xs text-neutral-300 space-y-1 list-disc list-inside">
              {tech.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {tech.improvements && tech.improvements.length > 0 && (
          <div className="bg-black/40 p-4 rounded-lg border border-amber-500/20 space-y-1.5">
            <p className="font-mono text-xs text-amber-400 uppercase tracking-wider">Communication Adjustments</p>
            <ul className="text-xs text-neutral-300 space-y-1 list-disc list-inside">
              {tech.improvements.map((imp, i) => (
                <li key={i}>{imp}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export function HighlightsCard({
  strongest,
  improvements,
  transcript,
}: {
  strongest: StudentCommunicationReport["strongestAnswers"];
  improvements: StudentCommunicationReport["answersNeedingImprovement"];
  transcript?: TranscriptTurn[];
}) {
  const userTurns = transcript ? transcript.filter((t) => t.speaker === "user") : [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Strongest Answers */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/15 p-5 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-2">
          <span>🥇</span> Top Strongest Answers
        </h3>
        <div className="space-y-3">
          {strongest.map((item, i) => {
            const userExcerpt = userTurns[item.questionNumber]?.text || userTurns[item.questionNumber - 1]?.text;
            return (
              <div key={i} className="bg-black/40 p-3.5 rounded-lg border border-emerald-500/20 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-xs font-bold text-emerald-300">Q{item.questionNumber}</span>
                  <span className="text-[11px] text-emerald-400 font-semibold">Strong Turn</span>
                </div>
                {userExcerpt && (
                  <p className="text-xs text-neutral-300 italic line-clamp-2">&ldquo;{userExcerpt}&rdquo;</p>
                )}
                <p className="text-xs text-emerald-300/90 pt-1 font-medium">{item.reason}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Answers to Improve */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-950/15 p-5 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-400 font-mono flex items-center gap-2">
          <span>🎯</span> Key Answers to Refine
        </h3>
        <div className="space-y-3">
          {improvements.map((item, i) => (
            <div key={i} className="bg-black/40 p-3.5 rounded-lg border border-amber-500/20 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-mono text-xs font-bold text-amber-300">Q{item.questionNumber}</span>
                <span className="text-[11px] text-amber-400 font-semibold">Refinement Area</span>
              </div>
              <p className="text-xs text-amber-200">{item.reason}</p>
              {item.improvement && (
                <p className="text-xs text-sky-300/90 pt-1 font-medium">💡 How to improve: {item.improvement}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StrengthsAndWeaknessesCard({
  strengths,
  weaknesses,
}: {
  strengths: string[];
  weaknesses: string[];
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-5 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-2">
          <span>✨</span> Personal Strengths Observed
        </h3>
        <ul className="space-y-2 text-xs text-neutral-200 list-disc list-inside">
          {strengths.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-5 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-400 font-mono flex items-center gap-2">
          <span>⚠️</span> Recurring Habits to Adjust
        </h3>
        <ul className="space-y-2 text-xs text-neutral-200 list-disc list-inside">
          {weaknesses.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ActionPlanCard({
  plan,
}: {
  plan: StudentCommunicationReport["improvementPlan"];
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-5 md:p-6 space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-sky-400 font-mono flex items-center gap-2">
        <span>🚀</span> Personalized Improvement Plan
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plan.map((item, i) => (
          <div key={i} className="bg-black/40 border border-white/5 rounded-xl p-4 space-y-2">
            <span className="rounded-full bg-sky-500/20 px-2 py-0.5 font-mono text-[10px] uppercase text-sky-300 font-semibold">
              Priority {item.priority || i + 1}
            </span>
            <h4 className="text-sm font-semibold text-white">{item.area}</h4>
            <p className="text-xs text-neutral-300 leading-relaxed">{item.whyItMatters}</p>
            <div className="bg-sky-950/30 border border-sky-500/20 p-2.5 rounded-lg text-xs text-sky-200">
              <strong>Practice:</strong> {item.howToPractice}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NextSessionGoalsCard({ goals }: { goals: string[] }) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const toggleGoal = (idx: number) => {
    setChecked((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="rounded-xl border border-teal-500/20 bg-teal-950/20 p-5 md:p-6 space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-teal-400 font-mono flex items-center gap-2">
        <span>🎯</span> Goals for Your Next Practice Session
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {goals.map((goal, i) => {
          const isDone = !!checked[i];
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggleGoal(i)}
              className={`flex items-start gap-3 p-3.5 rounded-lg border text-left transition-all ${
                isDone
                  ? "bg-teal-900/30 border-teal-500/40 text-teal-200 line-through opacity-80"
                  : "bg-black/40 border-white/5 text-neutral-200 hover:border-teal-500/30"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border font-mono text-xs ${
                  isDone ? "border-teal-400 bg-teal-500 text-black font-bold" : "border-neutral-500"
                }`}
              >
                {isDone ? "✓" : ""}
              </span>
              <span className="text-xs leading-relaxed">{goal}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SpeechPresenceSection({
  speech,
}: {
  speech: StudentCommunicationReport["speechAnalysis"];
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-6 space-y-4">
      <div className="flex justify-between items-center border-b border-white/5 pb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-200 font-mono flex items-center gap-2">
          <span>🎙️</span> Speech Delivery & Vocal Presence
        </h3>
        <span
          className={`rounded-full px-3 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
            speech?.wordsPerMinute != null
              ? "bg-sky-500/20 text-sky-300 border border-sky-500/30 font-semibold"
              : "bg-neutral-800 text-neutral-400"
          }`}
        >
          {speech?.wordsPerMinute != null ? "Vocal Metrics Measured" : "Typed Input Mode"}
        </span>
      </div>

      {speech?.wordsPerMinute != null ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-black/40 p-3.5 rounded-xl border border-white/5 text-center">
              <span className="text-[11px] text-neutral-400 block leading-tight">Speaking Pace</span>
              <p className="font-mono text-lg sm:text-xl font-bold text-sky-400 mt-1">
                {speech.wordsPerMinute ? `${speech.wordsPerMinute.toFixed(0)} wpm` : "N/A"}
              </p>
              <span className="text-[9px] text-neutral-500 block mt-0.5">Target: 120–160 wpm</span>
            </div>

            <div className="bg-black/40 p-3.5 rounded-xl border border-white/5 text-center">
              <span className="text-[11px] text-neutral-400 block leading-tight">Filler Words</span>
              <p className="font-mono text-lg sm:text-xl font-bold text-amber-400 mt-1">
                {speech.totalFillerWords || 0}
              </p>
              <span className="text-[9px] text-neutral-500 block mt-0.5">Detected total</span>
            </div>

            <div className="bg-black/40 p-3.5 rounded-xl border border-white/5 text-center">
              <span className="text-[11px] text-neutral-400 block leading-tight">Pauses (&ge;0.5s)</span>
              <p className="font-mono text-lg sm:text-xl font-bold text-teal-400 mt-1">
                {speech.totalPauseCount || 0}
              </p>
              <span className="text-[9px] text-neutral-500 block mt-0.5">Natural pauses</span>
            </div>

            <div className="bg-black/40 p-3.5 rounded-xl border border-white/5 text-center">
              <span className="text-[11px] text-neutral-400 block leading-tight">Hesitations (&gt;2s)</span>
              <p className="font-mono text-lg sm:text-xl font-bold text-indigo-400 mt-1">
                {speech.longPauseCount || 0}
              </p>
              <span className="text-[9px] text-neutral-500 block mt-0.5">Extended thinking</span>
            </div>
          </div>

          {speech.summary && (
            <div className="bg-black/30 p-3.5 rounded-xl border border-white/5 text-xs text-neutral-300 leading-relaxed">
              <p className="font-semibold text-white mb-1">Vocal Analysis:</p>
              <p>{speech.summary}</p>
            </div>
          )}

          <p className="text-[10px] text-neutral-500 leading-tight">
            * Measured from acoustic voice stream and silence boundaries via browser Web Audio API. Natural conversational pacing is evaluated in context with no psychological claims.
          </p>
        </div>
      ) : (
        <div className="bg-black/40 p-4 rounded-xl border border-white/5 text-xs text-neutral-400 space-y-1">
          <p className="font-medium text-neutral-300">Speech fluency metrics are captured during microphone voice sessions.</p>
          <p className="text-[11px]">Responses were submitted in typed mode for this session.</p>
        </div>
      )}
    </div>
  );
}

// Backwards compatibility alias
export const CameraAndSpeechSection = ({
  speech,
}: {
  camera?: any;
  speech: StudentCommunicationReport["speechAnalysis"];
}) => <SpeechPresenceSection speech={speech} />;
