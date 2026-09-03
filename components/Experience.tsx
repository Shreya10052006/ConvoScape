"use client";

/**
 * Experience.tsx
 * ---------------------------------------------------------------------------
 * Orchestrator connecting visual scenes, dialogue machines, camera analysis,
 * speech recognition/synthesis, and the post-session report.
 *
 * FULL FLOW:
 * 1. Rahul walking approach -> Rahul 10-turn peer practice conversation
 * 2. Rahul farewell -> Judge arrival video
 * 3. Hackathon Judges 8-question panel evaluation (Female / Male alternation)
 * 4. Judges farewell -> Judges leaving video -> Instant Student Report
 * 5. Background Judges Evaluation report generation
 */

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import SceneController from "@/components/scene/SceneController";
import ConversationController from "@/components/conversation/ConversationController";
import JudgeConversationController from "@/components/conversation/JudgeConversationController";
import CameraConsent from "@/components/camera/CameraConsent";
import CameraAnalysis from "@/components/camera/CameraAnalysis";
import FullscreenPrompt from "@/components/FullscreenPrompt";
import ReportPage from "@/components/report/ReportPage";
import { sceneReducer } from "@/lib/session/sceneMachine";
import { conversationReducer, initialConversationState } from "@/lib/session/dialogueMachine";
import { analyzeSpeech } from "@/lib/speech/speechAnalysis";
import { primeVoices, stopSpeaking } from "@/lib/speech/speechSynthesis";
import { requestMediaStream, stopCameraStream, type CameraState } from "@/lib/vision/cameraManager";
import { SessionRecorder } from "@/lib/vision/sessionRecorder";
import { BehaviorAggregator } from "@/lib/vision/behaviorMetrics";
import type { FaceSample } from "@/lib/vision/faceLandmarks";
import {
  newSessionId,
  summarisePhase,
  type CompactQuestionTurn,
  type ConversationStage,
  type InterruptionMetrics,
  type ProjectContext,
  type SessionTimestamps,
  type TranscriptTurn,
  type WebcamResult,
} from "@/lib/session/sessionTypes";
import { InterruptionTracker } from "@/lib/speech/interruptionTracker";
import type { JudgesVideoState } from "@/components/scene/JudgesVideoController";

interface Props {
  project: ProjectContext;
  onRestart: () => void;
  skipCameraConsentForTesting?: boolean;
}

export default function Experience({ project, onRestart, skipCameraConsentForTesting = false }: Props) {
  const [scene, sceneSend] = useReducer(sceneReducer, "RAHUL_WALKING");
  const [conversation, dispatchConversation] = useReducer(
    conversationReducer,
    undefined,
    initialConversationState
  );

  const [cameraState, setCameraState] = useState<CameraState>("CAMERA_OFF");
  const [cameraAsked, setCameraAsked] = useState(skipCameraConsentForTesting);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraNotice, setCameraNotice] = useState<string | null>(null);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [fullscreenAsked, setFullscreenAsked] = useState(false);

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

  const aggregatorRef = useRef(new BehaviorAggregator());
  const recorderRef = useRef(new SessionRecorder());
  const finalWebcamRef = useRef<WebcamResult>({ enabled: false });
  const stageRef = useRef<ConversationStage>(conversation.stage);
  stageRef.current = conversation.stage;

  // Stored judge question turns
  const judgeTurnsRef = useRef<CompactQuestionTurn[]>([]);

  useEffect(() => {
    primeVoices();
  }, []);

  // --- Camera handlers -------------------------------------------------------
  const handleEnableCamera = useCallback(async () => {
    setCameraAsked(true);
    setCameraState("CAMERA_REQUESTING");
    try {
      const stream = await requestMediaStream();
      setCameraStream(stream);
      setCameraState("CAMERA_ON");
      try {
        await recorderRef.current.start(stream);
      } catch (recErr) {
        console.warn("[Experience] Session recording couldn't start:", recErr);
      }
    } catch {
      setCameraState("CAMERA_DENIED");
      setCameraNotice("Camera permission denied. Proceeding in audio-only mode.");
      setTimeout(() => setCameraNotice(null), 5000);
    }
  }, []);

  const handleSkipCamera = useCallback(() => {
    setCameraAsked(true);
    setCameraState("CAMERA_OFF");
  }, []);

  const handleFaceSample = useCallback((sample: FaceSample) => {
    aggregatorRef.current.addSample(sample);
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

  // Rahul stage completed
  const handleStageComplete = useCallback(() => {
    stamp("rahulPhaseEndedAt");
    dispatchConversation({ type: "ADVANCE_STAGE" });
    sceneSend({ type: "DIALOGUE_COMPLETE" }); // RAHUL_CONVERSATION -> JUDGE_ENTRY

    // Prefetch Student Communication Report in background right after Rahul finishes
    try {
      fetch("/api/report/student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project,
          transcript: conversation.transcript,
          speechMetrics,
          webcam: aggregatorRef.current.sampleCount > 0 ? aggregatorRef.current.finalize() : { enabled: false },
          sessionId: sessionIdRef.current,
          timestamps: timestampsRef.current,
          interruptions: interruptionsRef.current.finalize(),
        }),
      }).catch((err) => console.warn("[Experience] Background student report prefetch error:", err));
    } catch {}
  }, [stamp, project, conversation.transcript, speechMetrics]);

  // Judges stage completed
  const handleJudgeStageComplete = useCallback(
    (turns: CompactQuestionTurn[]) => {
      stamp("judgeQnaEndedAt");
      judgeTurnsRef.current = turns;
      sceneSend({ type: "DIALOGUE_COMPLETE" }); // JUDGE_CONVERSATION -> SESSION_COMPLETE
    },
    [stamp]
  );

  // --- Session end: freeze metrics, stop capture ----------------------------
  useEffect(() => {
    if (scene !== "SESSION_COMPLETE") return;

    stamp("sessionEndedAt");
    finalInterruptionsRef.current = interruptionsRef.current.finalize();
    finalWebcamRef.current =
      aggregatorRef.current.sampleCount > 0 ? aggregatorRef.current.finalize() : { enabled: false };

    stopSpeaking();

    const t = setTimeout(async () => {
      if (recorderRef.current.isRecording) {
        const blob = await recorderRef.current.stop();
        if (blob) setRecordingBlob(blob);
      }
      stopCameraStream(cameraStream);
      setCameraStream(null);
      sceneSend({ type: "REPORT_READY" }); // SESSION_COMPLETE -> REPORT_GENERATION
      setTimeout(() => {
        sceneSend({ type: "REPORT_READY" }); // REPORT_GENERATION -> REPORT
      }, 500);
    }, 2800);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      stopCameraStream(cameraStream);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReportReady = useCallback(() => {
    sceneSend({ type: "REPORT_READY" }); // REPORT_GENERATION -> REPORT
  }, []);

  // Camera consent is asked right after setup questions before video scene starts
  const showCameraConsent = !cameraAsked;
  const showFullscreenPrompt = scene === "RAHUL_EXIT" && !fullscreenAsked;

  const handleRahulWalkingEnded = useCallback(() => {
    console.log("[Experience] Rahul walking approach video ended.");
    sceneSend({ type: "WALK_COMPLETE" });
    sceneSend({ type: "NEAR_SETTLED" });
  }, []);

  const handleJudgeArrivalEnded = useCallback(() => {
    console.log("[Experience] Judge arrival video ended. Seating judges.");
    stamp("judgeQnaStartedAt");
    sceneSend({ type: "JUDGES_SEATED" }); // JUDGE_ENTRY -> JUDGE_CONVERSATION
  }, [stamp]);

  const activeStage: Exclude<ConversationStage, "done"> =
    conversation.stage === "done" ? "judgeQA" : conversation.stage;

  const rahulConversationActive =
    scene === "RAHUL_CONVERSATION" && cameraAsked && conversation.stage === "rahul";

  const judgeConversationActive = scene === "JUDGE_CONVERSATION";

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

  // Judge video states
  const [judgeVideoState, setJudgeVideoState] = useState<JudgesVideoState>("ARRIVAL");
  const [judgeSpeakingVideoUrl, setJudgeSpeakingVideoUrl] = useState<string | null>(null);

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

  const handleJudgeSpeakingEnded = useCallback(() => {
    setJudgeSpeakingVideoUrl(null);
    setJudgeVideoState("LISTENING");
    if (videoEndCallbackRef.current) {
      const cb = videoEndCallbackRef.current;
      videoEndCallbackRef.current = null;
      cb();
    }
  }, []);

  const handleJudgeSpeakingError = useCallback((err?: unknown) => {
    console.warn("[Experience] Judge speaking video error:", err);
    setJudgeSpeakingVideoUrl(null);
    setJudgeVideoState("LISTENING");
    if (videoErrorCallbackRef.current) {
      const cb = videoErrorCallbackRef.current;
      videoErrorCallbackRef.current = null;
      cb(err);
    }
  }, []);

  const handleJudgeVisualStateChange = useCallback((vState: JudgesVideoState, videoUrl?: string | null) => {
    setJudgeVideoState(vState);
    if (vState === "SPEAKING" && videoUrl) {
      setJudgeSpeakingVideoUrl(videoUrl);
    } else {
      setJudgeSpeakingVideoUrl(null);
    }
  }, []);

  const registerVideoEndCallback = useCallback((cb: (() => void) | null) => {
    videoEndCallbackRef.current = cb;
  }, []);

  const registerVideoErrorCallback = useCallback((cb: ((err?: unknown) => void) | null) => {
    videoErrorCallbackRef.current = cb;
  }, []);

  const rahulVideoState =
    !cameraAsked
      ? "IDLE"
      : scene === "RAHUL_WALKING" || scene === "RAHUL_NEAR" || scene === "HALL_IDLE" || scene === "RAHUL_FAR"
      ? "WALKING"
      : scene === "RAHUL_EXIT"
      ? "LEAVING"
      : rahulSpeechState;

  const currentJudgeVideoState: JudgesVideoState =
    scene === "JUDGE_ENTRY"
      ? "ARRIVAL"
      : scene === "JUDGE_CONVERSATION"
      ? judgeVideoState
      : "IDLE";

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
          Hackathon Session Concluded
        </p>
        <h2 className="text-xl md:text-2xl font-bold text-white max-w-md">
          Report is generating...
        </h2>
        <p className="mt-3 text-sm text-neutral-400 max-w-sm leading-relaxed">
          Analyzing speech metrics, vocal pacing, and judge feedback. Thank you for being patient.
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
        webcam={finalWebcamRef.current}
        recording={recordingBlob}
        sessionId={sessionIdRef.current}
        timestamps={timestampsRef.current}
        interruptions={finalInterruptionsRef.current}
        judgeTurns={judgeTurnsRef.current}
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
        judgeVideoState={currentJudgeVideoState}
        judgeSpeakingVideoUrl={judgeSpeakingVideoUrl}
        onJudgeSpeakingEnded={handleJudgeSpeakingEnded}
        onJudgeSpeakingError={handleJudgeSpeakingError}
        onJudgeArrivalEnded={handleJudgeArrivalEnded}
        onJudgeLeavingEnded={() => sceneSend({ type: "DIALOGUE_COMPLETE" })}
        hallAvailable
        charactersAvailable
      />

      {/* Stage 1: Rahul Conversation */}
      {rahulConversationActive && (
        <ConversationController
          active
          stage={activeStage}
          project={project}
          stageHistory={stageHistory}
          priorPhaseSummary={priorPhaseSummary}
          mediaStream={cameraStream}
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

      {/* Stage 2: Judges Conversation */}
      {judgeConversationActive && (
        <JudgeConversationController
          project={project}
          mediaStream={cameraStream}
          onTurn={handleTurn}
          onJudgeStageComplete={handleJudgeStageComplete}
          interruptions={interruptionsRef.current}
          onVisualStateChange={handleJudgeVisualStateChange}
          registerVideoEndCallback={registerVideoEndCallback}
          registerVideoErrorCallback={registerVideoErrorCallback}
        />
      )}

      {showCameraConsent && (
        <CameraConsent onEnable={handleEnableCamera} onSkip={handleSkipCamera} />
      )}

      {showFullscreenPrompt && <FullscreenPrompt onDismiss={() => setFullscreenAsked(true)} />}

      {cameraNotice && (
        <div className="pointer-events-none fixed left-1/2 top-6 z-[700] -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-xs text-neutral-300 backdrop-blur-sm">
          {cameraNotice}
        </div>
      )}

      {cameraStream && cameraState === "CAMERA_ON" && (
        <CameraAnalysis
          stream={cameraStream}
          onSample={handleFaceSample}
          recording={recorderRef.current.isRecording}
        />
      )}
    </>
  );
}
