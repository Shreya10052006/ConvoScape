"use client";

/**
 * ReportPage.tsx
 * ---------------------------------------------------------------------------
 * Multi-Tab Post-Conversation Performance Dashboard for ConvoScape.
 *
 * TABS:
 * - TAB 1: 🎓 Student Communication (Generated immediately from Rahul conversation)
 * - TAB 2: 🧑‍⚖️ Judges Feedback (Generated asynchronously in background from Judges conversation)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CompactQuestionTurn,
  FinalReport,
  InterruptionMetrics,
  JudgesEvaluationReport,
  ProjectContext,
  SessionTimestamps,
  SpeechMetrics,
  TranscriptTurn,
  WebcamResult,
} from "@/lib/session/sessionTypes";
import QuestionAccordion from "./QuestionAccordion";
import {
  ActionPlanCard,
  CameraAndSpeechSection,
  CommunicationSummaryCard,
  HighlightsCard,
  NextSessionGoalsCard,
  OverviewScoreCard,
  StrengthsAndWeaknessesCard,
  TechnicalCommunicationCard,
  UnexpectedPerformanceCard,
} from "./SectionCards";
import {
  JudgesOverviewCard,
  JudgesQuestionAccordion,
  JudgesTechnicalDeepDiveCard,
  JudgesEdgeCaseAndScaleCard,
  JudgesRecommendationsCard,
} from "./JudgesSectionCards";

interface Props {
  project: ProjectContext;
  transcript: TranscriptTurn[];
  speechMetrics: SpeechMetrics;
  webcam: WebcamResult;
  recording: Blob | null;
  sessionId?: string;
  timestamps?: SessionTimestamps;
  interruptions?: InterruptionMetrics;
  judgeTurns?: CompactQuestionTurn[];
  onReportReady: () => void;
  onRestart: () => void;
}

type Status = "loading" | "ready" | "error";
type ActiveTab = "student" | "judges";

export default function ReportPage({
  project,
  transcript,
  speechMetrics,
  webcam,
  recording,
  sessionId,
  timestamps,
  interruptions,
  judgeTurns = [],
  onReportReady,
  onRestart,
}: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("student");
  const [status, setStatus] = useState<Status>("loading");
  const [report, setReport] = useState<FinalReport | null>(null);
  const [judgesReport, setJudgesReport] = useState<JudgesEvaluationReport | null>(null);
  const [judgesLoading, setJudgesLoading] = useState<boolean>(false);
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

  // 1. Load / Fetch Student Communication Report Immediately
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
          if (parsed.judgesFeedback) {
            setJudgesReport(parsed.judgesFeedback);
          }
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
            webcam,
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

  // 2. Fetch Judges Evaluation Report in Background Asynchronously
  useEffect(() => {
    if (!report || judgesReport || judgesLoading) return;

    let cancelled = false;
    setJudgesLoading(true);

    (async () => {
      try {
        const res = await fetch("/api/report/judges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project,
            judgeTurns,
            sessionId,
          }),
        });

        if (res.ok && !cancelled) {
          const jData: JudgesEvaluationReport = await res.json();
          setJudgesReport(jData);

          // Merge into cached report
          const cachedKey = sessionId ? `convoscape_report_${sessionId}` : null;
          if (cachedKey && typeof window !== "undefined") {
            try {
              const updatedReport = { ...report, judgesFeedback: jData };
              setReport(updatedReport);
              sessionStorage.setItem(cachedKey, JSON.stringify(updatedReport));
            } catch {}
          }
        }
      } catch (err) {
        console.warn("[ReportPage] Background judges report generation error:", err);
      } finally {
        if (!cancelled) setJudgesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [report, judgesReport, judgesLoading, project, judgeTurns, sessionId]);

  const handleDownloadJSON = useCallback(() => {
    if (!report) return;
    const exportData = {
      ...report,
      judgesFeedback: judgesReport || report.judgesFeedback,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `convoscape-report-${project.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report, judgesReport, project.name]);

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

  return (
    <main className="min-h-screen bg-black text-white px-4 py-8 md:px-8 lg:px-12">
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

        {/* TWO TABS: Student Communication vs Judges Feedback */}
        <div className="flex items-center gap-3 border-b border-white/10 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab("student")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-semibold transition-all ${
              activeTab === "student"
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <span>🎓</span> Student Communication
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("judges")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-semibold transition-all ${
              activeTab === "judges"
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <span>🧑‍⚖️</span> Judges Feedback
            {judgesLoading && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
              </span>
            )}
            {judgesReport && (
              <span className="rounded-full bg-indigo-500/30 text-indigo-300 px-1.5 py-0.2 text-[9px] font-mono border border-indigo-500/40">
                Ready
              </span>
            )}
          </button>
        </div>

        {/* Fallback Notice if Degraded */}
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

        {/* TAB 1: STUDENT COMMUNICATION CONTENT */}
        {activeTab === "student" && (
          <div className="space-y-8">
            {/* SECTION 1: Overall Performance & Category Scores */}
            <section aria-label="Overall Performance">
              <OverviewScoreCard report={student} />
            </section>

            {/* SECTION 2: Communication Summary */}
            <section aria-label="Communication Summary">
              <CommunicationSummaryCard summary={student.overallSummary} />
            </section>

            {/* SECTION 3: Question-by-Question Review (Q1–Q10) */}
            <section aria-label="Question-by-Question Review" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                    <span>📋</span> Question-by-Question Analysis
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Detailed review of all 10 questions asked by Rahul. Click any question to expand.
                  </p>
                </div>
                <span className="font-mono text-xs text-neutral-400 bg-white/5 px-3 py-1 rounded-full border border-white/10">
                  10 Turns Analyzed
                </span>
              </div>

              <QuestionAccordion
                feedbackList={student.questionAnalysis}
                transcript={transcript}
                project={project}
              />
            </section>

            {/* SECTION 4: Unexpected Question Performance */}
            <section aria-label="Unexpected Question Performance">
              <UnexpectedPerformanceCard perf={student.unexpectedQuestionPerformance} />
            </section>

            {/* SECTION 5: Technical Communication */}
            <section aria-label="Technical Communication">
              <TechnicalCommunicationCard tech={student.technicalCommunication} />
            </section>

            {/* SECTION 6 & 7: Strongest Answers & Key Answers to Refine */}
            <section aria-label="Highlights">
              <HighlightsCard
                strongest={student.strongestAnswers}
                improvements={student.answersNeedingImprovement}
                transcript={transcript}
              />
            </section>

            {/* SECTION 8 & 9: Strengths & Weaknesses */}
            <section aria-label="Strengths and Weaknesses">
              <StrengthsAndWeaknessesCard
                strengths={student.strengths}
                weaknesses={student.recurringWeaknesses}
              />
            </section>

            {/* SECTION 10: Action Plan */}
            <section aria-label="Action Plan">
              <ActionPlanCard plan={student.improvementPlan} />
            </section>

            {/* SECTION 11: Next Session Goals */}
            <section aria-label="Next Session Goals">
              <NextSessionGoalsCard goals={student.nextSessionGoals} />
            </section>

            {/* SECTION 12: Camera and Speech Presence */}
            <section aria-label="Camera and Speech Presence">
              <CameraAndSpeechSection
                camera={student.cameraAnalysis}
                speech={student.speechAnalysis}
              />
            </section>
          </div>
        )}

        {/* TAB 2: JUDGES FEEDBACK CONTENT */}
        {activeTab === "judges" && (
          <div className="space-y-8">
            {!judgesReport && (
              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.03] p-12 text-center space-y-4">
                <div className="relative mx-auto flex h-14 w-14 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-25" />
                  <div className="relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 font-mono text-xl">
                    🧑‍⚖️
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white">Generating Judges Panel Assessment...</h3>
                  <p className="text-xs text-indigo-300/80 font-mono">
                    Evaluating technical architecture, presentation pitch, and Q1–Q8 defense.
                  </p>
                </div>
                <p className="text-xs text-neutral-400 max-w-md mx-auto leading-relaxed">
                  The panel report will appear right here as soon as synthesis completes. Thank you for your patience.
                </p>
              </div>
            )}

            {judgesReport && (
              <>
                {/* 1. Panel Overview Card */}
                <section aria-label="Judges Overview">
                  <JudgesOverviewCard judgesReport={judgesReport} />
                </section>

                {/* 2. Technical Strengths & Vulnerabilities */}
                <section aria-label="Technical Strengths and Gaps">
                  <JudgesTechnicalDeepDiveCard judgesReport={judgesReport} />
                </section>

                {/* 3. Question-by-Question Defense Breakdown */}
                <section aria-label="Judges Question Breakdown">
                  <JudgesQuestionAccordion questions={judgesReport.questionAnalysis} />
                </section>

                {/* 4. Edge-Case Resilience and Scalability Review */}
                <section aria-label="Edge-Case and Scalability">
                  <JudgesEdgeCaseAndScaleCard judgesReport={judgesReport} />
                </section>

                {/* 5. Priority Roadmap Recommendations */}
                <section aria-label="Judges Recommendations">
                  <JudgesRecommendationsCard judgesReport={judgesReport} />
                </section>
              </>
            )}
          </div>
        )}

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
