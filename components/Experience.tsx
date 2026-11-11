"use client";

/**
 * Experience.tsx
 * ---------------------------------------------------------------------------
 * Orchestrator connecting visual scenes, dialogue machines,
 * speech recognition/synthesis, and the post-session report.
 *
 * FULL STREAMLINED FLOW:
 * 1. Rahul walking approach video (starts at 0.0s immediately upon entering hall)
 * 2. Walking finishes -> seamless handoff into Rahul 10-turn conversation (Intro -> Q1..Q10 -> Farewell)
 * 3. Rahul farewell -> Direct Student Communication Report (100% audio & speech metrics, zero camera).
 */

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import SceneController from "@/components/scene/SceneController";
import ConversationController from "@/components/conversation/ConversationController";
import ReportPage from "@/components/report/ReportPage";
import { sceneReducer } from "@/lib/session/sceneMachine";
import { conversationReducer, initialConversationState } from "@/lib/session/dialogueMachine";
import { analyzeSpeech } from "@/lib/speech/speechAnalysis";
import { primeVoices, stopSpeaking } from "@/lib/speech/speechSynthesis";
import {
  newSessionId,
  summarisePhase,
  type ConversationStage,
  type InterruptionMetrics,
  type ProjectContext,
  type SessionTimestamps,
  type TranscriptTurn,
} from "@/lib/session/sessionTypes";
import { InterruptionTracker } from "@/lib/speech/interruptionTracker";

interface Props {
  project: ProjectContext;
  mediaStream?: MediaStream | null;
  onRestart: () => void;
}

export default function Experience({ project, mediaStream = null, onRestart }: Props) {
  const [scene, sceneSend] = useReducer(sceneReducer, "RAHUL_WALKING");
  const [conversation, dispatchConversation] = useReducer(
    conversationReducer,
    undefined,
    initialConversationState
  );

  const sessionIdRef = useRef<string>("");
  if (!sessionIdRef.current) sessionIdRef.current = newSessionId();

  const timestampsRef = useRef<SessionTimestamps>({});
  if (!timestampsRef.current.sessionStartedAt) {
    timestampsRef.current.sessionStartedAt = new Date().toISOString();
  }

  const stamp = useCallback((key: keyof SessionTimestamps) => {
    if (!timestampsRef.current[key]) {
      timestampsRef.current = { ...timestampsRef.current, [key]: new Date().toISOString() };
    }
  }, []);

  const interruptionsRef = useRef(new InterruptionTracker());
  const finalInterruptionsRef = useRef<InterruptionMetrics | undefined>(undefined);

  const stageRef = useRef<ConversationStage>(conversation.stage);
  stageRef.current = conversation.stage;

  useEffect(() => {
    primeVoices();
  }, []);

  // --- Conversation Turn Handlers --------------------------------------------
  const handleTurn = useCallback((turn: TranscriptTurn) => {
    dispatchConversation({ type: "TURN_ADDED", turn });
  }, []);

  const handleTopic = useCallback((topic: string) => {
    dispatchConversation({ type: "QUESTION_TOPIC", topic });
  }, []);

  const speechMetrics = useMemo(
    () => analyzeSpeech(conversation.transcript, project),
    [conversation.transcript, project]
  );

  // Rahul stage completed — transition to SESSION_COMPLETE & background report generation
  const handleStageComplete = useCallback(() => {
    stamp("rahulPhaseEndedAt");
    stamp("sessionEndedAt");
    dispatchConversation({ type: "ADVANCE_STAGE" });
    sceneSend({ type: "DIALOGUE_COMPLETE" }); // RAHUL_CONVERSATION -> SESSION_COMPLETE

    // Prefetch Student Communication Report in background right after Rahul finishes
    try {
      fetch("/api/report/student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project,
          transcript: conversation.transcript,
          speechMetrics,
          webcam: { enabled: false }, // Explicitly disabled
          sessionId: sessionIdRef.current,
          timestamps: timestampsRef.current,
          interruptions: interruptionsRef.current.finalize(),
        }),
      }).catch((err) => console.warn("[Experience] Background student report prefetch error:", err));
    } catch {}
  }, [stamp, project, conversation.transcript, speechMetrics]);

  // --- Session end: freeze metrics, transition to report ----------------------
  useEffect(() => {
    if (scene !== "SESSION_COMPLETE") return;

    finalInterruptionsRef.current = interruptionsRef.current.finalize();
    stopSpeaking();

    const t = setTimeout(() => {
      sceneSend({ type: "REPORT_READY" }); // SESSION_COMPLETE -> REPORT_GENERATION
      setTimeout(() => {
        sceneSend({ type: "REPORT_READY" }); // REPORT_GENERATION -> REPORT
      }, 500);
    }, 2200);

    return () => clearTimeout(t);
  }, [scene]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const handleReportReady = useCallback(() => {
    sceneSend({ type: "REPORT_READY" }); // REPORT_GENERATION -> REPORT
  }, []);

  const walkingHandoffTriggeredRef = useRef(false);

  // Walking approach ended -> seamlessly transition into Rahul's conversation & opening line
  const handleRahulWalkingEnded = useCallback(() => {
    if (walkingHandoffTriggeredRef.current) return;
    walkingHandoffTriggeredRef.current = true;
    console.log("[Experience] Rahul walking approach video ended -> Seamlessly starting opening line.");
    sceneSend({ type: "WALK_COMPLETE" });
    setTimeout(() => {
      sceneSend({ type: "NEAR_SETTLED" });
    }, 40);
  }, []);

  const activeStage: Exclude<ConversationStage, "done"> =
    conversation.stage === "done" ? "rahul" : conversation.stage;

  const rahulConversationActive =
    scene === "RAHUL_CONVERSATION" && conversation.stage === "rahul";

  const stageHistory = useMemo(
    () => conversation.transcript.filter((t) => t.stage === activeStage),
    [conversation.transcript, activeStage]
  );

  const priorPhaseSummary = useMemo(() => {
    if (activeStage === "rahul") return undefined;
    return summarisePhase(conversation.transcript.filter((t) => t.stage === "rahul"));
  }, [conversation.transcript, activeStage]);

  // Rahul video states
  const [rahulSpeechState, setRahulSpeechState] = useState<"SPEAKING" | "LISTENING" | "IDLE">("IDLE");
  const [rahulSpeakingVideoUrl, setRahulSpeakingVideoUrl] = useState<string | null>(null);

  const videoEndCallbackRef = useRef<(() => void) | null>(null);
  const videoErrorCallbackRef = useRef<((err?: unknown) => void) | null>(null);

  const handleRahulSpeakingEnded = useCallback(() => {
    setRahulSpeakingVideoUrl(null);
    setRahulSpeechState("LISTENING");
    if (videoEndCallbackRef.current) {
      const cb = videoEndCallbackRef.current;
      videoEndCallbackRef.current = null;
      cb();
    }
  }, []);

  const handleRahulSpeakingError = useCallback((err?: unknown) => {
    console.warn("[Experience] Rahul speaking video error:", err);
    setRahulSpeakingVideoUrl(null);
    setRahulSpeechState("LISTENING");
    if (videoErrorCallbackRef.current) {
      const cb = videoErrorCallbackRef.current;
      videoErrorCallbackRef.current = null;
      cb(err);
    }
  }, []);

  const registerVideoEndCallback = useCallback((cb: (() => void) | null) => {
    videoEndCallbackRef.current = cb;
  }, []);

  const registerVideoErrorCallback = useCallback((cb: ((err?: unknown) => void) | null) => {
    videoErrorCallbackRef.current = cb;
  }, []);

  const rahulVideoState =
    scene === "RAHUL_WALKING" || scene === "RAHUL_NEAR" || scene === "HALL_IDLE" || scene === "RAHUL_FAR"
      ? "WALKING"
      : rahulSpeechState;

  if (scene === "SESSION_COMPLETE" || scene === "REPORT_GENERATION") {
    return (
      <main className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black px-6 text-center text-white">
        <div className="relative mb-6 flex h-16 w-16 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-25" />
          <div className="relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-400 font-mono text-xl">
            ⚡
          </div>
        </div>
        <p className="font-mono text-xs uppercase tracking-widest text-sky-400 mb-2">
          Session Complete
        </p>
        <h2 className="text-xl md:text-2xl font-bold text-white max-w-md">
          Report is generating...
        </h2>
        <p className="mt-3 text-sm text-neutral-400 max-w-sm leading-relaxed">
          Analyzing your speech metrics, communication style, and conversation quality.
        </p>
      </main>
    );
  }

  if (scene === "REPORT") {
    return (
      <ReportPage
        project={project}
        transcript={conversation.transcript}
        speechMetrics={speechMetrics}
        sessionId={sessionIdRef.current}
        timestamps={timestampsRef.current}
        interruptions={finalInterruptionsRef.current}
        onReportReady={handleReportReady}
        onRestart={onRestart}
      />
    );
  }

  return (
    <>
      <SceneController
        scene={scene}
        send={sceneSend}
        rahulVideoState={rahulVideoState}
        rahulSpeakingVideoUrl={rahulSpeakingVideoUrl}
        onRahulSpeakingEnded={handleRahulSpeakingEnded}
        onRahulSpeakingError={handleRahulSpeakingError}
        onRahulWalkingEnded={handleRahulWalkingEnded}
        hallAvailable
        charactersAvailable
      />

      {/* Rahul Conversation Controller */}
      {rahulConversationActive && (
        <ConversationController
          active
          stage={activeStage}
          project={project}
          stageHistory={stageHistory}
          priorPhaseSummary={priorPhaseSummary}
          mediaStream={mediaStream}
          onTurn={handleTurn}
          onTopic={handleTopic}
          onStageComplete={handleStageComplete}
          interruptions={interruptionsRef.current}
          onVisualStateChange={setRahulSpeechState}
          onRahulVideoGenerated={setRahulSpeakingVideoUrl}
          registerVideoEndCallback={registerVideoEndCallback}
          registerVideoErrorCallback={registerVideoErrorCallback}
        />
      )}
    </>
  );
}
