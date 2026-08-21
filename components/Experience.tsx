"use client";

/**
 * Experience.tsx
 * ---------------------------------------------------------------------------
 * The one place that knows about all the state machines at once — visual scene,
 * conversation phase, camera, recording, report — and connects them through
 * explicit events. Every other file knows about exactly one.
 *
 * That separation is what the spec asks for and it is load-bearing: a Gemini
 * failure cannot strand Rahul mid-stride because the scene machine advances on
 * animation events, and an animation glitch cannot destroy the transcript
 * because the transcript lives in a reducer this component owns, not in the
 * scene.
 *
 * PHASE ↔ SCENE MAPPING
 *   rahul        → RAHUL_CONVERSATION
 *   judgeIntro   → JUDGE_CONVERSATION  (judges already on screen)
 *   presentation → JUDGE_CONVERSATION
 *   judgeQA      → JUDGE_CONVERSATION
 * Only the rahul → judgeIntro transition moves the scene, because that's the
 * only phase boundary where bodies actually change.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import SceneController from "@/components/scene/SceneController";
import ConversationController from "@/components/conversation/ConversationController";
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
  type ConversationStage,
  type InterruptionMetrics,
  type ProjectContext,
  type SessionTimestamps,
  type TranscriptTurn,
  type WebcamResult,
} from "@/lib/session/sessionTypes";
import { InterruptionTracker } from "@/lib/speech/interruptionTracker";

interface Props {
  project: ProjectContext;
  onRestart: () => void;
  skipCameraConsentForTesting?: boolean;
}

const HIDE_JUDGES_FOR_NOW = true;

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

  useEffect(() => {
    primeVoices();
  }, []);

  // --- Upfront Device Permissions (Microphone & Camera) before entering scene ---
  const handleEnableCamera = useCallback(async (withRecording: boolean) => {
    primeVoices();
    setCameraState("CAMERA_REQUESTING");
    try {
      const stream = await requestMediaStream(true);
      setCameraStream(stream);
      setCameraState("CAMERA_ON");
      if (withRecording) {
        const started = recorderRef.current.start(stream);
        if (!started) setCameraNotice("Recording isn't supported in this browser — analysis will still run.");
      }
    } catch (err) {
      console.warn("[Experience] Camera/Mic access denied:", err);
      setCameraState("CAMERA_DENIED");
      setCameraNotice("Camera access wasn't granted — continuing with microphone only.");
    } finally {
      setCameraAsked(true);
    }
  }, []);

  const handleSkipCamera = useCallback(async () => {
    primeVoices();
    try {
      const micStream = await requestMediaStream(false);
      // Stop temporary track once browser permission is established
      micStream.getTracks().forEach((t) => t.stop());
    } catch (err) {
      console.warn("[Experience] Mic access notice:", err);
    } finally {
      setCameraState("CAMERA_OFF");
      setCameraAsked(true);
    }
  }, []);

  const handleFaceSample = useCallback((s: FaceSample) => {
    aggregatorRef.current.addSample(s);
  }, []);

  // --- Conversation ---------------------------------------------------------
  const handleTurn = useCallback((turn: TranscriptTurn) => {
    dispatchConversation({ type: "TURN_ADDED", turn });
  }, []);

  const handleTopic = useCallback((topic: string) => {
    dispatchConversation({ type: "QUESTION_TOPIC", topic });
  }, []);

  const handleStageComplete = useCallback(() => {
    const finished = stageRef.current;

    // Close the finishing phase and open the next, once each.
    if (finished === "rahul") stamp("rahulPhaseEndedAt");
    if (finished === "presentation") stamp("presentationEndedAt");
    if (finished === "judgeQA") stamp("judgeQnaEndedAt");

    if (finished === "rahul" && HIDE_JUDGES_FOR_NOW) {
      console.log("[Experience] Rahul conversation completed. Judges are hidden for now until Rahul phase is approved.");
      setRahulSpeechState("LISTENING");
      return;
    }

    dispatchConversation({ type: "ADVANCE_STAGE" });

    // Rahul's phase ending is the only boundary that changes who is on screen.
    if (finished === "rahul") {
      sceneSend({ type: "DIALOGUE_COMPLETE" }); // RAHUL_CONVERSATION -> RAHUL_EXIT
    } else if (finished === "judgeQA") {
      sceneSend({ type: "DIALOGUE_COMPLETE" }); // JUDGE_CONVERSATION -> SESSION_COMPLETE
    }
    // `stamp` is stable (useCallback with an empty dep array) so listing it is
    // free; sceneSend is a useReducer dispatch and stable by contract.
  }, [stamp]);

  // --- Session end: freeze metrics, stop capture ----------------------------
  useEffect(() => {
    if (scene !== "SESSION_COMPLETE") return;

    stamp("sessionEndedAt");
    finalInterruptionsRef.current = interruptionsRef.current.finalize();
    finalWebcamRef.current =
      aggregatorRef.current.sampleCount > 0 ? aggregatorRef.current.finalize() : { enabled: false };

    stopSpeaking();

    (async () => {
      if (recorderRef.current.isRecording) {
        const blob = await recorderRef.current.stop();
        if (blob) setRecordingBlob(blob);
      }
      stopCameraStream(cameraStream);
      setCameraStream(null);
      sceneSend({ type: "REPORT_READY" }); // -> REPORT_GENERATION
    })();
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
  // Offered once Rahul is walking away, so it lands in the natural pause before
  // the judges rather than interrupting a conversation.
  const showFullscreenPrompt = scene === "RAHUL_EXIT" && !fullscreenAsked;

  const handleRahulWalkingEnded = useCallback(() => {
    console.log("[Experience] Rahul walking approach video ended. Arrived at table.");
    sceneSend({ type: "WALK_COMPLETE" });
    sceneSend({ type: "NEAR_SETTLED" });
  }, []);

  const activeStage: Exclude<ConversationStage, "done"> =
    conversation.stage === "done" ? "judgeQA" : conversation.stage;

  const conversationActive =
    (scene === "RAHUL_CONVERSATION" &&
      cameraAsked &&
      conversation.stage === "rahul") ||
    (scene === "JUDGE_CONVERSATION" &&
      (conversation.stage === "judgeIntro" ||
        conversation.stage === "presentation" ||
        conversation.stage === "judgeQA"));

  const stageHistory = useMemo(
    () => conversation.transcript.filter((t) => t.stage === activeStage),
    [conversation.transcript, activeStage]
  );

  // The judges get a digest of what Rahul already drew out, so they don't
  // re-ask the same ground. Computed locally — it's context, not analysis.
  const priorPhaseSummary = useMemo(() => {
    if (activeStage === "rahul") return undefined;
    return summarisePhase(conversation.transcript.filter((t) => t.stage === "rahul"));
  }, [conversation.transcript, activeStage]);

  const speechMetrics = useMemo(
    () => analyzeSpeech(conversation.transcript, project),
    [conversation.transcript, project]
  );

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
    console.warn("[Experience] Rahul speaking video playback error:", err);
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
    !cameraAsked
      ? "IDLE"
      : scene === "RAHUL_WALKING" || scene === "RAHUL_NEAR" || scene === "HALL_IDLE" || scene === "RAHUL_FAR"
      ? "WALKING"
      : scene === "RAHUL_EXIT"
      ? "LEAVING"
      : rahulSpeechState;

  if (scene === "REPORT_GENERATION" || scene === "REPORT") {
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

      {conversationActive && (
        <ConversationController
          active
          stage={activeStage}
          project={project}
          stageHistory={stageHistory}
          priorPhaseSummary={priorPhaseSummary}
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
