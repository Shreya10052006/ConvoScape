"use client";

/**
 * ReportPage.tsx
 * ---------------------------------------------------------------------------
 * The one screen meant to be read rather than looked through. Still dark and
 * quiet rather than a white dashboard — "not a conventional website" applies
 * here too, expressed as restraint since a report is inherently a document.
 *
 * The report request cannot fail into a dead end: /api/report always returns a
 * usable report, degrading to a metrics-only one if the AI layer is
 * unavailable. The only genuine failure left is the network itself, which gets
 * a retry button rather than a black screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CoachingReport,
  InterruptionMetrics,
  ProjectContext,
  SessionTimestamps,
  SpeechMetrics,
  TranscriptTurn,
  WebcamResult,
} from "@/lib/session/sessionTypes";
import { downloadRecording, downloadReportHTML } from "@/lib/report/downloadReport";
import { downloadReportPDF } from "@/lib/report/pdfReport";
import ScoreCard from "./ScoreCard";
import SpeakingAnalysis from "./SpeakingAnalysis";
import { BulletList, MostImportant } from "./ImprovementSection";
import PracticeRecommendations from "./PracticeRecommendations";
import QuestionBreakdown from "./QuestionBreakdown";

interface Props {
  project: ProjectContext;
  transcript: TranscriptTurn[];
  speechMetrics: SpeechMetrics;
  webcam: WebcamResult;
  recording: Blob | null;
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
  const [report, setReport] = useState<CoachingReport | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);

    (async () => {
      try {
        const res = await fetch("/api/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project, transcript, speechMetrics, webcam,
            sessionId, timestamps, interruptions,
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data?.message || "Couldn't reach the report service.");
        setReport(data);
        setStatus("ready");
        if (!readySignalled.current) {
          readySignalled.current = true;
          onReportReady();
        }
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const handleDownloadHTML = useCallback(() => {
    if (report) downloadReportHTML(project, report, speechMetrics, transcript);
  }, [report, project, speechMetrics, transcript]);

  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const handleDownloadPDF = useCallback(async () => {
    if (!report) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      await downloadReportPDF({
        project, report, metrics: speechMetrics, webcam,
        transcript, hasRecording: Boolean(recording),
      });
    } catch {
      // PDF generation is pure client-side work over data we already hold, so a
      // failure here is a browser/library issue, not a lost report — the HTML
      // route still works and is offered as the way out.
      setPdfError("Couldn't build the PDF. The HTML download below still works.");
    } finally {
      setPdfBusy(false);
    }
  }, [report, project, speechMetrics, webcam, transcript, recording]);

  if (status === "loading") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-black text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.4em] text-neutral-500">ConvoScape</p>
        <p className="text-lg font-light text-neutral-200">Going back over your session…</p>
      </div>
    );
  }

  if (status === "error" || !report) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-black px-8 text-center">
        <p className="max-w-md text-neutral-300">{error}</p>
        <button
          onClick={() => setAttempt((a) => a + 1)}
          className="font-mono text-sm uppercase tracking-widest text-sky-400 hover:text-sky-300"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-black px-6 py-16 text-neutral-100 sm:px-10">
      <div className="mx-auto max-w-2xl space-y-12">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.4em] text-neutral-500">
            {project.name}
            {project.domain ? ` · ${project.domain}` : ""}
          </p>
          <p className="mt-4 text-2xl font-light leading-snug text-neutral-100">
            {report.narrativeSummary}
          </p>
        </header>

        {report.isFallback && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-4 text-sm leading-relaxed text-amber-200/90">
            The AI coaching layer couldn&apos;t be reached for this session, so this report was built
            from your measured speech data and the scoring collected during the conversation itself.
            Everything below is real — there&apos;s just less interpretation than usual.
          </p>
        )}

        <section>
          <SectionLabel>Overall performance</SectionLabel>
          <ScoreCard overall={report.overall} />
        </section>

        <section className="grid gap-10 sm:grid-cols-2">
          <BulletList title="What you did well" items={report.whatYouDidWell} tone="good" />
          <BulletList title="What you missed" items={report.whatYouMissed} tone="gap" />
        </section>

        {report.communicationAnalysis && (
          <section>
            <SectionLabel>Communication analysis</SectionLabel>
            <p className="text-sm leading-relaxed text-neutral-200">{report.communicationAnalysis}</p>
          </section>
        )}

        {report.technicalCommunication && (
          <section>
            <SectionLabel>Technical communication</SectionLabel>
            <p className="text-sm leading-relaxed text-neutral-200">{report.technicalCommunication}</p>
          </section>
        )}

        <section>
          <SectionLabel>Speaking patterns</SectionLabel>
          <SpeakingAnalysis metrics={speechMetrics} narrative={report.speakingPatterns} />
        </section>

        {report.repetitionAnalysis && (
          <section>
            <SectionLabel>Repetition</SectionLabel>
            <p className="text-sm leading-relaxed text-neutral-200">{report.repetitionAnalysis}</p>
            {speechMetrics.repetition?.domainTermRepeats.length > 0 && (
              <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                Your project vocabulary —{" "}
                {speechMetrics.repetition.domainTermRepeats.map((w) => w.text).join(", ")} — is
                counted separately and is not treated as a problem.
              </p>
            )}
          </section>
        )}

        {report.interruptionNotes && (
          <section>
            <SectionLabel>Possible interruptions</SectionLabel>
            <p className="text-sm leading-relaxed text-neutral-200">{report.interruptionNotes}</p>
          </section>
        )}

        <section>
          <SectionLabel>Answer quality</SectionLabel>
          <p className="text-sm leading-relaxed text-neutral-200">{report.answerQuality}</p>
        </section>

        {report.questionBreakdown.length > 0 && (
          <section>
            <SectionLabel>Judge Q&amp;A, question by question</SectionLabel>
            <QuestionBreakdown items={report.questionBreakdown} />
          </section>
        )}

        <section>
          <SectionLabel>Presentation behaviour</SectionLabel>
          <p className="text-sm leading-relaxed text-neutral-200">
            {report.bodyLanguage ?? (
              <span className="text-neutral-400">
                Camera analysis was not enabled, so this section was intentionally skipped.
                Declining the camera did not affect any score above.
              </span>
            )}
          </p>
        </section>

        {recordingUrl && (
          <section>
            <SectionLabel>Your recording</SectionLabel>
            <video
              src={recordingUrl}
              controls
              className="w-full rounded-lg border border-white/10 bg-black"
            />
            <button
              onClick={() => recording && downloadRecording(recording, project.name)}
              className="mt-3 rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-widest text-neutral-200 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              Download recording
            </button>
          </section>
        )}

        <MostImportant text={report.mostImportantImprovement} />

        <section>
          <PracticeRecommendations howToPractice={report.howToPractice} onRestart={onRestart} />
        </section>

        <section className="border-t border-white/10 pt-8">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleDownloadPDF}
              disabled={pdfBusy}
              className="rounded-full bg-sky-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-400 disabled:bg-neutral-700 disabled:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
            >
              {pdfBusy ? "Building PDF…" : "Download PDF Report"}
            </button>
            <button
              onClick={handleDownloadHTML}
              className="rounded-full border border-white/20 px-5 py-2.5 text-sm text-neutral-200 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              Download HTML Report
            </button>
          </div>
          {pdfError && <p className="mt-2 text-xs text-amber-400">{pdfError}</p>}
          {sessionId && (
            <p className="mt-4 font-mono text-[10px] text-neutral-600">Session {sessionId}</p>
          )}
        </section>
      </div>
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">{children}</p>
  );
}
