"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { FinalReport, ProjectContext } from "@/lib/session/sessionTypes";
import QuestionAccordion from "@/components/report/QuestionAccordion";
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
} from "@/components/report/SectionCards";

const dummyProject: ProjectContext = {
  name: "CareVista",
  domain: "HealthTech / Telemedicine",
  topic: "AI-assisted triage and offline health consultation for rural clinics",
  description: "A lightweight triage web app allowing rural community health workers to record patient symptoms, generate preliminary summaries with local LLMs, and sync securely with regional hospital doctors when connectivity is restored.",
  problem: "Rural patients travel 6+ hours to reach district hospitals for basic consultations, overwhelming urban centers.",
  stack: "Next.js, FastAPI, SQLite with LiteSync, Whisper Tiny, TailwindCSS",
  userName: "Shreya",
  college: "RV College of Engineering",
};

const dummyReport: FinalReport = {
  sessionId: "sess_demo_carevista_2026",
  generatedAt: new Date().toISOString(),
  project: dummyProject,
  studentCommunication: {
    reportType: "student_communication",
    overallScore: 82,
    overallSummary:
      "You gave an impressive, highly engaging presentation of CareVista! Your passion for solving rural healthcare accessibility comes through clearly. Your strongest asset is connecting deep technical choices (like offline-first SQLite sync and INT8 quantized Whisper) directly to the end-user's reality. To elevate your communication even further, practice stating your measurable outcome in the opening sentence before explaining the mechanism.",
    categoryScores: {
      clarity: 84,
      relevance: 90,
      structure: 78,
      technicalCommunication: 86,
      spontaneousThinking: 81,
      conciseness: 79,
    },
    questionAnalysis: [
      {
        questionNumber: 1,
        score: 90,
        whatWorked: [
          "Immediate hook identifying the target user and problem within the first 10 seconds.",
          "Strong personal motivation anchored in real-world clinic visits.",
        ],
        whatCouldImprove: [
          "Could mention the key enabling technology (offline local sync) briefly in the opening.",
        ],
        betterApproach: "Direct Hook (Problem + User) → Why it matters → High-level solution demo.",
        communicationTags: ["clear", "strong_motivation"],
      },
      {
        questionNumber: 2,
        score: 85,
        whatWorked: [
          "Direct technical explanation without dodging the conflict resolution question.",
          "Specific architectural terms (write-ahead log, delta sync).",
        ],
        whatCouldImprove: [
          "Explain how simultaneous edits to the same patient record by two workers are resolved.",
        ],
        betterApproach: "State conflict resolution strategy in sentence 1 → Explain WAL & delta sync mechanism in sentence 2.",
        communicationTags: ["technical", "direct"],
      },
      {
        questionNumber: 3,
        score: 88,
        whatWorked: [
          "User-first perspective emphasizing multi-lingual voice recording.",
          "Concrete benefit (3-second structured summary).",
        ],
        whatCouldImprove: [
          "Add a quick example of a symptom note being converted into clinical fields.",
        ],
        betterApproach: "Start with the user's primary daily struggle → Show the zero-effort voice workflow → End with the clinical time saved.",
        communicationTags: ["user_centric", "engaging"],
      },
      {
        questionNumber: 4,
        score: 92,
        whatWorked: [
          "Exceptional technical specificity: INT8 quantization, ONNX Runtime, and 180MB RAM metric.",
          "Directly answered the hardware constraint question.",
        ],
        whatCouldImprove: [
          "Flawless response! Keep this exact level of clarity across all technical questions.",
        ],
        betterApproach: "Quantization choice → Hardware target & memory benchmark → Performance outcome.",
        communicationTags: ["precise", "benchmark_backed"],
      },
      {
        questionNumber: 5,
        score: 87,
        whatWorked: [
          "Authentic, candid technical hurdle reflecting genuine field testing.",
          "Explained the engineering solution (spectral noise gating).",
        ],
        whatCouldImprove: [
          "Mention the before vs after accuracy increase if known (e.g., from 60% to 92%).",
        ],
        betterApproach: "Name the unexpected challenge → Explain why standard models failed → Describe the custom filter → Give the final accuracy improvement.",
        communicationTags: ["authentic", "problem_solver"],
      },
      {
        questionNumber: 6,
        score: 90,
        whatWorked: [
          "Instant numerical benchmark (45ms per 5s chunk).",
          "Explained parallel streaming architecture.",
        ],
        whatCouldImprove: [
          "Great spontaneous answer!",
        ],
        betterApproach: "Benchmark latency → Processing parallelization → User experience verdict.",
        communicationTags: ["spontaneous", "data_driven"],
      },
      {
        questionNumber: 7,
        score: 83,
        whatWorked: [
          "Exciting, high-value roadmap feature (camera PPG).",
          "Directly cuts hardware costs for rural clinics.",
        ],
        whatCouldImprove: [
          "Briefly mention validation or regulatory safety measures needed for vitals extraction.",
        ],
        betterApproach: "Feature goal → Mechanism (PPG via phone camera) → Impact (zero extra hardware needed).",
        communicationTags: ["forward_looking"],
      },
      {
        questionNumber: 8,
        score: 86,
        whatWorked: [
          "Demonstrated forward-thinking on demographic and environmental edge cases.",
          "Specific solution using standardized LED transillumination.",
        ],
        whatCouldImprove: [
          "State that pilot calibration data from varied clinical environments would be collected before field rollout.",
        ],
        betterApproach: "Acknowledge edge case → Propose optical normalization technique → Outline testing protocol.",
        communicationTags: ["edge_case_aware"],
      },
      {
        questionNumber: 9,
        score: 85,
        whatWorked: [
          "Enthusiastic and focused on high-utility output.",
          "Contrasted 2-minute input with 10-second doctor review.",
        ],
        whatCouldImprove: [
          "Showcase one specific triage category (e.g., Red/Urgent for respiratory distress).",
        ],
        betterApproach: "Highlight the hero feature → Contrast old manual time vs CareVista time → Conclude with clinical impact.",
        communicationTags: ["enthusiastic", "value_focused"],
      },
      {
        questionNumber: 10,
        score: 93,
        whatWorked: [
          "Critical safety-first positioning: extraction only, no prescription.",
          "Human-in-the-loop validation requirement.",
        ],
        whatCouldImprove: [
          "Superb answer addressing AI safety directly.",
        ],
        betterApproach: "Safety boundary (no treatment generation) → Ambiguity flagging → Human doctor sign-off requirement.",
        communicationTags: ["safety_first", "rigorous"],
      },
    ],
    strongestAnswers: [
      {
        questionNumber: 4,
        reason: "Packed with exact numbers (INT8, ONNX, 180MB RAM) while answering the hardware constraint directly.",
      },
      {
        questionNumber: 10,
        reason: "Addressed AI safety, human-in-the-loop validation, and UI indicators in two crisp sentences.",
      },
      {
        questionNumber: 6,
        reason: "Instant numerical benchmark combined with parallel streaming architecture justification.",
      },
    ],
    answersNeedingImprovement: [
      {
        questionNumber: 2,
        reason: "Omitted multi-device concurrent conflict resolution strategy.",
        improvement: "Add: 'If two workers edit the same patient offline, we use field-level merging with a doctor review queue for conflicting vitals.'",
      },
      {
        questionNumber: 5,
        reason: "Missing before/after accuracy metric when discussing the noise filter.",
        improvement: "State the tangible improvement: 'It boosted Word Error Rate in noisy environments from 38% down to 9%.'",
      },
      {
        questionNumber: 7,
        reason: "Did not mention clinical safety validation for camera PPG vitals.",
        improvement: "Conclude with: '...paired with clinical validation against standard hospital pulse oximeters.'",
      },
    ],
    strengths: [
      "Outstanding technical precision with real performance metrics (RAM, latency, model sizes).",
      "Clear empathy and practical focus on the rural end-user experience.",
      "Superb spontaneous reasoning under unexpected follow-up questions.",
    ],
    recurringWeaknesses: [
      "Occasional tendency to jump straight into software architecture before stating the conflict resolution rule.",
      "Can make technical hurdle explanations even stronger by quoting before/after accuracy metrics.",
    ],
    unexpectedQuestionPerformance: {
      score: 84,
      summary:
        "You handled Rahul's unscripted follow-up questions on offline sync conflicts and camera PPG illumination with remarkable composure and immediate technical depth.",
      observations: [
        "Addressed unexpected turns without prolonged pauses (average response delay: 1.4s).",
        "Connected edge-case answers back to user safety without freezing.",
      ],
    },
    technicalCommunication: {
      score: 86,
      summary:
        "You possess high technical mastery of your stack and an excellent ability to translate complex pipelines (like INT8 quantized Whisper ONNX) into understandable benefits.",
      strengths: [
        "Referenced memory benchmarks and hardware constraints accurately",
        "Explained offline-first architecture simply to a peer",
      ],
      improvements: [
        "Lead with the architectural choice before explaining the reasoning",
        "Add one concrete metric when describing performance bottlenecks",
      ],
    },
    improvementPlan: [
      {
        priority: 1,
        area: "Direct Hook",
        whyItMatters: "Reviewers judge clarity in the first 10 seconds of an answer.",
        howToPractice: "State your core takeaway in the very first sentence of your response.",
      },
      {
        priority: 2,
        area: "Concrete Code Examples",
        whyItMatters: "Abstract explanations sound like pitch decks rather than real engineering.",
        howToPractice: "Anchor every technical explanation with one concrete example from your codebase.",
      },
      {
        priority: 3,
        area: "Trade-off Justification",
        whyItMatters: "Engineers are evaluated on why they rejected alternative approaches.",
        howToPractice: "Explicitly explain one trade-off (e.g. speed vs complexity) whenever describing architecture.",
      },
    ],
    nextSessionGoals: [
      "State the core user outcome within the first 10 seconds of speaking",
      "Mention at least one concrete numerical benchmark for every technical question",
      "Explicitly address human-in-the-loop safeguards during feature demos",
      "Highlight offline conflict resolution rules clearly",
    ],
    cameraAnalysis: {
      enabled: true,
      eyeContactRatio: 0.88,
      forwardFacingRatio: 0.84,
      faceDetectedRatio: 0.98,
      headOrientation: {
        forwardRatio: 0.84,
        leftRatio: 0.06,
        rightRatio: 0.05,
        upRatio: 0.02,
        downRatio: 0.03,
      },
      interruptions: {
        faceLostCount: 0,
        prolongedLookAwayCount: 1,
      },
      observations:
        "Camera-facing / apparent eye-contact consistency was ~88% with a stable forward orientation for 84% of the session. A brief look-away occurred around Q5 while recalling noisy environment filtering trade-offs.",
      note: "Approximation based on facial orientation and gaze landmarks. No psychological or confidence inferences are made.",
    },
    speechAnalysis: {
      wordsPerMinute: 138,
      avgResponseDelaySec: 1.4,
      totalFillerWords: 4,
      summary:
        "Your speaking pace averaged a comfortable 138 words per minute with only 4 filler words detected across all 10 responses.",
    },
  },
  judgesFeedback: null,
  combinedSummary: null,
  isFallback: false,
};

export default function PreviewReportPage() {
  const [activeTab, setActiveTab] = useState<"student" | "judges">("student");
  const student = dummyReport.studentCommunication;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 pb-24 pt-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Banner Notice */}
        <div className="rounded-xl border border-sky-500/30 bg-sky-950/30 p-4 text-xs text-sky-200 flex items-center justify-between gap-4">
          <p>
            ✨ <strong>Preview Mode:</strong> Displaying the Two-Tab Report Architecture with sample data for <em>{dummyProject.name}</em>.
          </p>
          <Link
            href="/"
            className="rounded-full bg-sky-500 px-4 py-1.5 font-mono text-xs font-semibold text-white hover:bg-sky-400 transition-colors shrink-0"
          >
            ← Back to App
          </Link>
        </div>

        {/* Top Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs text-neutral-400">
              <span className="text-sky-400 font-semibold">ConvoScape</span>
              <span>•</span>
              <span>{dummyProject.domain}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
              {dummyProject.name}
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              Presented by {dummyProject.userName} ({dummyProject.college})
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-neutral-400">
              Session {dummyReport.sessionId}
            </span>
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

          <div className="relative group">
            <button
              type="button"
              disabled
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-semibold text-neutral-500 bg-neutral-900/40 border border-neutral-800 cursor-not-allowed opacity-60"
            >
              <span>🧑‍⚖️</span> Judges Feedback
              <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[9px] uppercase tracking-wider text-neutral-400">
                Coming Soon
              </span>
            </button>
          </div>
        </div>

        {/* TAB 1: STUDENT COMMUNICATION */}
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

              <QuestionAccordion feedbackList={student.questionAnalysis} project={dummyProject} />
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

        {/* Footer */}
        <footer className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-400">
          <p>ConvoScape Hackathon Presentation Simulator • Practice before it counts.</p>
          <Link
            href="/"
            className="rounded-full bg-sky-500 px-6 py-2.5 text-xs font-bold text-white hover:bg-sky-400 transition-colors shadow-lg shadow-sky-500/20"
          >
            Start Real Practice Session
          </Link>
        </footer>
      </div>
    </main>
  );
}
