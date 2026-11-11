"use client";

/**
 * ReportPage.tsx
 * ---------------------------------------------------------------------------
 * Post-Conversation Performance Dashboard for ConvoScape.
 * Shows the Student Communication Report from Rahul's conversation session.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FinalReport,
  InterruptionMetrics,
  ProjectContext,
  SessionTimestamps,
  SpeechMetrics,
  TranscriptTurn,
} from "@/lib/session/sessionTypes";
import {
  ActionPlanCard,
  CommunicationSummaryCard,
  NextSessionGoalsCard,
  OverviewScoreCard,
  SpeechPresenceSection,
  StrengthsAndWeaknessesCard,
} from "./SectionCards";

interface Props {
  project: ProjectContext;
  transcript: TranscriptTurn[];
  speechMetrics: SpeechMetrics;
  webcam?: { enabled: boolean; forwardFacingRatio?: number };
  recording?: Blob | null;
  sessionId?: string;
  timestamps?: SessionTimestamps;
  interruptions?: InterruptionMetrics;
  onReportReady: () => void;
  onRestart: () => void;
}

type Status = "loading" | "ready" | "error";

export default function ReportPage({
  project,
  transcript,
  speechMetrics,
  webcam,
  recording,
  sessionId,
  timestamps,
  interruptions,
  onReportReady,
  onRestart,
}: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [report, setReport] = useState<FinalReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const readySignalled = useRef(false);

  const recordingUrl = useMemo(
    () => (recording ? URL.createObjectURL(recording) : null),
    [recording]
  );

  useEffect(() => {
    return () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    };
  }, [recordingUrl]);

  // Load / Fetch Student Communication Report
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);

    const cachedKey = sessionId ? `convoscape_report_${sessionId}` : null;
    if (cachedKey && typeof window !== "undefined") {
      try {
        const stored = sessionStorage.getItem(cachedKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          setReport(parsed);
          setStatus("ready");
          if (!readySignalled.current) {
            readySignalled.current = true;
            onReportReady();
          }
          return;
        }
      } catch (e) {
        console.warn("[ReportPage] SessionStorage read error:", e);
      }
    }

    (async () => {
      try {
        const res = await fetch("/api/report/student", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project,
            transcript,
            speechMetrics,
            webcam: { enabled: false },
            sessionId,
            timestamps,
            interruptions,
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data?.error || "Couldn't reach the report service.");

        setReport(data);
        setStatus("ready");

        if (cachedKey && typeof window !== "undefined") {
          try {
            sessionStorage.setItem(cachedKey, JSON.stringify(data));
          } catch {}
        }

        if (!readySignalled.current) {
          readySignalled.current = true;
          onReportReady();
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[ReportPage] Report fetch failed:", err);
        setError((err as Error).message);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt, project, transcript, speechMetrics, webcam, sessionId, timestamps, interruptions, onReportReady]);

  const handleDownloadJSON = useCallback(() => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `convoscape-report-${project.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report, project.name]);

  // Loading State
  if (status === "loading") {
    return (
      <main className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black px-6 text-center">
        <div className="relative mb-6 flex h-16 w-16 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-25" />
          <div className="relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-400 font-mono text-xl">
            ⚡
          </div>
        </div>
        <p className="font-mono text-xs uppercase tracking-widest text-sky-400 mb-2">
          Your conversation session is complete
        </p>
        <h2 className="text-xl md:text-2xl font-bold text-white max-w-md">
          Preparing your personalized communication report...
        </h2>
        <p className="mt-2 text-sm text-neutral-400 max-w-sm">
          Analyzing technical clarity, spontaneous thinking, and conversational delivery.
        </p>
      </main>
    );
  }

  // Error State
  if (status === "error" || !report) {
    return (
      <main className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black px-6 text-center">
        <div className="rounded-2xl border border-white/10 bg-neutral-900/80 p-8 max-w-md backdrop-blur-md space-y-4">
          <p className="font-mono text-xs uppercase tracking-widest text-amber-400">Analysis Delayed</p>
          <h2 className="text-xl font-bold text-white">Your conversation has been saved, but we couldn&apos;t generate the feedback right now.</h2>
          <p className="text-xs text-neutral-400 leading-relaxed">{error || "Network connection issue."}</p>
          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={() => setAttempt((a) => a + 1)}
              className="rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-400 transition-colors"
            >
              Retry
            </button>
            <button
              onClick={onRestart}
              className="rounded-full border border-white/20 px-5 py-2 text-sm text-neutral-300 hover:bg-white/10 transition-colors"
            >
              Start Over
            </button>
          </div>
        </div>
      </main>
    );
  }

  const student = report.studentCommunication;

  // Build lookup maps for question & answer text from the transcript
  const characterTurns = transcript.filter(
    (t) => t.speaker === "rahul" || t.kind === "CHARACTER_DIALOGUE"
  );
  const userTurns = transcript.filter((t) => t.speaker === "user");

  const FIXED_Q: Record<number, string> = {
    1: "So, what are you guys working on? I've been seeing so many different projects around here, so I'm curious — what's yours about, and what made you guys decide to build it?",
    3: "Yeah, I get what you mean. One thing I always find interesting with hackathon projects is how different the idea sounds compared to actually using it. If you had to show this to someone who knew nothing about it, what would you want them to understand first?",
    5: "By the way, I always get curious about the tech side of these projects. When you guys were actually building this, what part ended up being more difficult than you expected?",
    7: "Okay, random question — if you guys actually got another month to keep working on this after the hackathon, what would you change or add first?",
    9: "Honestly, after working on it and talking about it this much, what's the one part of your project you're most excited to show someone?",
  };

  return (
    <main className="min-h-screen bg-black text-white px-4 py-8 md:px-8 lg:px-12 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header Banner */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-[11px] uppercase tracking-widest text-sky-400">
                ConvoScape Session Analysis
              </span>
              <span className="h-1 w-1 rounded-full bg-neutral-600" />
              <span className="text-[11px] text-neutral-400 font-mono">
                {new Date(report.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
              {project.name} <span className="text-neutral-500 font-normal text-lg sm:text-xl">({project.domain})</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDownloadJSON}
              className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-mono text-neutral-200 hover:bg-white/10 transition-colors"
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="rounded-full bg-sky-500 px-5 py-2 text-xs font-semibold text-white hover:bg-sky-400 transition-colors"
            >
              Practice Again
            </button>
          </div>
        </header>

        {/* Section Label */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-widest text-sky-400">🎓 Student Communication Report</span>
        </div>

        {/* Fallback Notice */}
        {report.isFallback && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-4 text-xs text-amber-200 flex items-center justify-between gap-4">
            <p>
              ⚡ <strong>Offline Mode:</strong> Assembled deterministically from measured session data and live dialogue.
            </p>
            <button
              onClick={() => setAttempt((a) => a + 1)}
              className="font-mono text-amber-400 underline hover:text-amber-300 shrink-0"
            >
              Re-analyze with AI
            </button>
          </div>
        )}

        <div className="space-y-8">
          {/* SECTION 1: Overall Score */}
          <section aria-label="Overall Performance">
            <OverviewScoreCard report={student} />
          </section>

          {/* SECTION 2: Communication Summary */}
          <section aria-label="Communication Summary">
            <CommunicationSummaryCard summary={student.overallSummary} />
          </section>

          {/* SECTION 3: Question-by-Question Cards (always expanded) */}
          <section aria-label="Question-by-Question Review" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <span>📋</span> Question-by-Question Analysis
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Detailed breakdown of all 10 questions asked by Rahul.
                </p>
              </div>
              <span className="font-mono text-xs text-neutral-400 bg-white/5 px-3 py-1 rounded-full border border-white/10">
                10 Turns Analyzed
              </span>
            </div>

            <div className="space-y-5">
              {(student.questionAnalysis ?? []).map((item, idx) => {
                const qNum = item.questionNumber || idx + 1;
                const rahulTurn = characterTurns[qNum];
                const userTurn = userTurns[qNum];

                const questionText =
                  rahulTurn?.text ||
                  FIXED_Q[qNum] ||
                  `Question ${qNum} regarding ${project.name}`;
                const answerText =
                  userTurn?.rawTranscript ||
                  userTurn?.text ||
                  userTurns[qNum - 1]?.rawTranscript ||
                  userTurns[qNum - 1]?.text ||
                  "(No answer recorded)";

                const isTailored = qNum % 2 === 0;
                const scoreColor =
                  item.score >= 80
                    ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
                    : item.score >= 65
                    ? "text-sky-400 border-sky-500/40 bg-sky-500/10"
                    : "text-amber-400 border-amber-500/40 bg-amber-500/10";

                return (
                  <div
                    key={qNum}
                    className="rounded-xl border border-white/10 bg-neutral-900/70 overflow-hidden backdrop-blur-sm"
                  >
                    {/* Card Header */}
                    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/8 bg-white/[0.02]">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 font-mono text-xs font-bold text-white">
                          Q{qNum}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-neutral-100 leading-snug line-clamp-2">
                            {questionText}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isTailored && (
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300">
                            tailored
                          </span>
                        )}
                        <span className={`rounded-lg border px-2.5 py-0.5 font-mono text-xs font-bold ${scoreColor}`}>
                          {item.score}/100
                        </span>
                      </div>
                    </div>

                    <div className="p-5 space-y-4">
                      {/* Rahul's Full Question */}
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-widest text-sky-400 mb-1.5">
                          🎙 Rahul&apos;s Question
                        </p>
                        <p className="text-sm text-neutral-200 bg-sky-950/20 border border-sky-500/15 rounded-lg px-4 py-3 leading-relaxed italic">
                          &ldquo;{questionText}&rdquo;
                        </p>
                      </div>

                      {/* User's Answer */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
                            🗣 Your Answer
                          </p>
                          {userTurn?.detailedAnswer?.durationSeconds && (
                            <span className="font-mono text-[10px] text-sky-400 bg-sky-950/40 px-2 py-0.5 rounded border border-sky-500/20">
                              {userTurn.detailedAnswer.durationSeconds.toFixed(1)}s
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-200 bg-black/50 border border-white/10 rounded-lg px-4 py-3 leading-relaxed">
                          &ldquo;{answerText}&rdquo;
                        </p>
                        {/* Per-Answer Speech Badges */}
                        {userTurn?.detailedAnswer && (
                          <div className="flex flex-wrap items-center gap-2 pt-2 text-[11px] font-mono text-neutral-400">
                            <span className="rounded bg-white/5 px-2 py-0.5 border border-white/10 text-neutral-300">
                              {userTurn.detailedAnswer.wordCount} words
                            </span>
                            {userTurn.detailedAnswer.fillerCount > 0 && (
                              <span className="rounded bg-amber-950/30 px-2 py-0.5 border border-amber-500/20 text-amber-300">
                                {userTurn.detailedAnswer.fillerCount} filler{userTurn.detailedAnswer.fillerCount > 1 ? "s" : ""}
                              </span>
                            )}
                            {(userTurn.detailedAnswer.pauseCount ?? 0) > 0 && (
                              <span className="rounded bg-sky-950/30 px-2 py-0.5 border border-sky-500/20 text-sky-300">
                                {userTurn.detailedAnswer.pauseCount} pause{userTurn.detailedAnswer.pauseCount! > 1 ? "s" : ""}
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

                      {/* Feedback Grid: What Worked + What Could Improve */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-3.5 space-y-2">
                          <p className="font-mono text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                            ✅ What Worked
                          </p>
                          <ul className="space-y-1.5 text-xs text-emerald-200/90 list-disc list-inside leading-relaxed">
                            {(item.whatWorked ?? []).map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="rounded-lg border border-amber-500/20 bg-amber-950/20 p-3.5 space-y-2">
                          <p className="font-mono text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                            ⚡ How You Could Improve
                          </p>
                          <ul className="space-y-1.5 text-xs text-amber-200/90 list-disc list-inside leading-relaxed">
                            {(item.whatCouldImprove ?? []).map((ci, i) => (
                              <li key={i}>{ci}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* Better Approach */}
                      {item.betterApproach && (
                        <div className="rounded-lg border border-sky-500/20 bg-sky-950/20 p-4 space-y-1.5">
                          <p className="font-mono text-[11px] font-semibold text-sky-400 uppercase tracking-wider">
                            💡 Suggested Better Approach
                          </p>
                          <p className="text-sm text-sky-200/90 leading-relaxed">{item.betterApproach}</p>
                        </div>
                      )}

                      {/* Communication Tags */}
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
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* SECTION 4: Session Summary */}
          <section aria-label="Session Summary" className="rounded-xl border border-white/10 bg-neutral-900/60 overflow-hidden">
            <div className="px-6 py-5 border-b border-white/8 bg-white/[0.02]">
              <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>🏁</span> Full Session Summary
              </h3>
              <p className="text-xs text-neutral-400 mt-1">
                How you performed across all 10 questions and areas to focus on next.
              </p>
            </div>
            <div className="p-6 space-y-6">
              {/* Strengths & Weaknesses */}
              <StrengthsAndWeaknessesCard
                strengths={student.strengths}
                weaknesses={student.recurringWeaknesses}
              />
              {/* Action Plan */}
              <ActionPlanCard plan={student.improvementPlan} />
              {/* Next Session Goals */}
              <NextSessionGoalsCard goals={student.nextSessionGoals} />
              {/* Speech Presence */}
              <SpeechPresenceSection speech={student.speechAnalysis} />
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-400">
          <p>ConvoScape Hackathon Presentation Simulator • Practice before it counts.</p>
          <button
            type="button"
            onClick={onRestart}
            className="rounded-full bg-sky-500 px-6 py-2.5 text-xs font-bold text-white hover:bg-sky-400 transition-colors shadow-lg shadow-sky-500/20"
          >
            Start Another Practice Session
          </button>
        </footer>
      </div>
    </main>
  );
}
