"use client";

/**
 * ConversationController.tsx
 * ---------------------------------------------------------------------------
 * Drives ONE conversation phase. It does not know where anyone is standing
 * (scene state) or whether the camera is on (camera state) — only whose turn it
 * is, what was said, and what should be said next. That boundary is what stops
 * a Gemini timeout from stranding Rahul mid-stride and a dropped animation
 * frame from losing a user's answer.
 *
 * TWO RULES ENFORCED HERE THAT ARE EASY TO GET WRONG:
 *
 * 1. ONLY CHARACTER_DIALOGUE IS EVER SPOKEN. System notices ("Take your time",
 *    "Your presentation has started") are UI text. They're pushed through
 *    `showSystem()`, which never touches speak(). The TTS call site reads from
 *    exactly one place so the two can't be confused.
 *
 * 2. THE MIC IS HARD-MUTED WHILE A CHARACTER TALKS. Recognition starts only on
 *    the TTS `end` event, never on a timer, because the recogniser will happily
 *    transcribe the synthesiser through the speakers otherwise.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isSpeechRecognitionSupported,
  startSpeechRecognition,
  type SpeechRecognitionHandle,
} from "@/lib/speech/speechRecognition";
import { speak, stopSpeaking, type CharacterVoice } from "@/lib/speech/speechSynthesis";
import {
  PRESENTATION_SECONDS,
  STAGE_TURN_TARGET,
  newTurnId,
  type ConversationStage,
  type ProjectContext,
  type Speaker,
  type TranscriptTurn,
} from "@/lib/session/sessionTypes";
import type { DialoguePhase } from "@/lib/session/dialogueMachine";
import type { ValidatedTurn } from "@/lib/ai/schemas";
import type { InterruptionTracker } from "@/lib/speech/interruptionTracker";
import VoiceIndicator from "./VoiceIndicator";
import TranscriptOverlay from "./TranscriptOverlay";
import PresentationTimer from "./PresentationTimer";

/** How long to let the user sit in silence before a gentle, unspoken nudge. */
const IDLE_NUDGE_MS = 20_000;

interface Props {
  active: boolean;
  stage: Exclude<ConversationStage, "done">;
  project: ProjectContext;
  stageHistory: TranscriptTurn[];
  priorPhaseSummary?: string;
  onTurn: (turn: TranscriptTurn) => void;
  onTopic: (topic: string) => void;
  onStageComplete: () => void;
  /** Shared across phases so counts accumulate over the whole session. */
  interruptions?: InterruptionTracker;
  onVisualStateChange?: (state: "SPEAKING" | "LISTENING" | "IDLE") => void;
  onRahulVideoGenerated?: (url: string) => void;
  registerVideoEndCallback?: (cb: (() => void) | null) => void;
  registerVideoErrorCallback?: (cb: (() => void) | null) => void;
}

type LocalStatus = "idle" | "requesting" | "speaking" | "listening" | "typing" | "presenting" | "error";

export default function ConversationController({
  active,
  stage,
  project,
  stageHistory,
  priorPhaseSummary,
  onTurn,
  onTopic,
  onStageComplete,
  interruptions,
  onVisualStateChange,
  onRahulVideoGenerated,
  registerVideoEndCallback,
  registerVideoErrorCallback,
}: Props) {
  const [status, setStatus] = useState<LocalStatus>("idle");
  const [caption, setCaption] = useState("");
  const [captionSpeaker, setCaptionSpeaker] = useState<Speaker | null>(null);
  const [systemNotice, setSystemNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userInterimSpeech, setUserInterimSpeech] = useState("");
  const [typedValue, setTypedValue] = useState("");
  const [micUnavailable, setMicUnavailable] = useState(false);
  const [presentationEndsAt, setPresentationEndsAt] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    if (status === "speaking") {
      onVisualStateChange?.("SPEAKING");
    } else if (status === "listening" || status === "presenting" || status === "typing") {
      onVisualStateChange?.("LISTENING");
    } else {
      onVisualStateChange?.("IDLE");
    }
  }, [active, status, onVisualStateChange]);

  const recognitionRef = useRef<SpeechRecognitionHandle | null>(null);
  const answersThisStageRef = useRef(0);
  const openedForStageRef = useRef<string | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const lastRequestRef = useRef<{ userAnswer?: string; isFinalTurn?: boolean }>({});
  const beginListeningRef = useRef<() => void>(() => {});

  const target = STAGE_TURN_TARGET[stage];
  const speechSupported = isSpeechRecognitionSupported();

  /** SYSTEM_MESSAGE path — visible, never spoken. */
  const showSystem = useCallback((text: string, persistMs = 5000) => {
    setSystemNotice(text);
    window.setTimeout(() => setSystemNotice((cur) => (cur === text ? null : cur)), persistMs);
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const submitAnswer = useCallback(
    (text: string, startTime?: number, endTime?: number) => {
      clearIdleTimer();
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setPresentationEndsAt(null);
      setUserInterimSpeech("");

      onTurn({
        id: newTurnId(),
        speaker: "user",
        text,
        stage,
        kind: "CHARACTER_DIALOGUE",
        startTime,
        endTime,
      });
      setCaption("");
      setCaptionSpeaker(null);

      answersThisStageRef.current += 1;
      const isFinal = answersThisStageRef.current >= target;
      void requestTurnRef.current(text, isFinal);
    },
    [clearIdleTimer, onTurn, stage, target]
  );

  const beginListening = useCallback(() => {
    setTypedValue("");
    setUserInterimSpeech("");

    if (stage === "presentation") {
      // The uninterrupted presentation round: timer visible, no prompting.
      setPresentationEndsAt(Date.now() + PRESENTATION_SECONDS * 1000);
      setStatus("presenting");
      showSystem(`Your presentation has started — about ${Math.round(PRESENTATION_SECONDS / 60)} minutes.`, 6000);
    } else {
      setStatus("listening");
    }

    if (!speechSupported || micUnavailable) {
      setStatus(stage === "presentation" ? "presenting" : "typing");
      return;
    }

    interruptions?.userSpeechStarted();
    recognitionRef.current = startSpeechRecognition({
      onInterim: (liveText) => {
        setUserInterimSpeech(liveText);
      },
      onResult: (r) => {
        interruptions?.userSpeechEnded();
        if (r.text) submitAnswer(r.text, r.startTime, r.endTime);
      },
      onError: (reason) => {
        if (reason === "not-allowed" || reason === "unsupported") {
          setMicUnavailable(true);
          showSystem("Microphone unavailable — you can type your response instead.", 6000);
        }
        setStatus("typing");
      },
      onEnd: () => {
        interruptions?.userSpeechEnded();
        setStatus((s) => (s === "listening" || s === "presenting" ? "typing" : s));
      },
    });

    // Silence nudge. Deliberately a SYSTEM_MESSAGE, never spoken, and never a
    // character repeating themselves — the spec calls that out specifically.
    clearIdleTimer();
    idleTimerRef.current = window.setTimeout(() => {
      showSystem("Take your time. You can respond when you're ready.", 6000);
    }, IDLE_NUDGE_MS);
  }, [stage, speechSupported, micUnavailable, showSystem, submitAnswer, clearIdleTimer, interruptions]);

  beginListeningRef.current = beginListening;

  const requestTurn = useCallback(
    async (userAnswer?: string, isFinalTurn?: boolean) => {
      lastRequestRef.current = { userAnswer, isFinalTurn };
      setStatus("requesting");
      setErrorMessage(null);

      const rahulTurnCount = stageHistory.filter((t) => t.speaker === "rahul").length;

      // --- Instant Pre-Generated Turn 1 (Opening Introduction) ---
      if (stage === "rahul" && rahulTurnCount === 0) {
        const replyText = "Hey! I was just walking around checking out other tables. I'm Rahul, 3rd year CS from RV College. What's your name, and where are you guys from?";
        onTurn({
          id: newTurnId(),
          speaker: "rahul",
          text: replyText,
          stage,
          kind: "CHARACTER_DIALOGUE",
          endTime: performance.now(),
        });
        onTopic("intro");
        setStatus("speaking");
        setCaption(replyText);
        setCaptionSpeaker("rahul");

        registerVideoEndCallback?.(() => {
          registerVideoEndCallback?.(null);
          registerVideoErrorCallback?.(null);
          setCaption("");
          setCaptionSpeaker(null);
          onVisualStateChange?.("LISTENING");
          beginListeningRef.current();
        });

        onRahulVideoGenerated?.("/generated/rahul-response-turn1-opening.mp4");
        onVisualStateChange?.("SPEAKING");

        // Background Warmup Ping: wake up Modal GPU container while Turn 1 intro is playing
        void fetch("/api/generate-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ warmup: true }),
        }).catch(() => null);

        return;
      }

      // --- Instant Pre-Generated Final Turn (Farewell & Judging Countdown) ---
      if (stage === "rahul" && isFinalTurn) {
        const replyText = "That sounds seriously awesome! Best of luck with the demo — I heard the judges are starting their rounds in a few hours, so make sure you're ready. I gotta run back to my table to finish our deployment. Catch you later!";
        onTurn({
          id: newTurnId(),
          speaker: "rahul",
          text: replyText,
          stage,
          kind: "CHARACTER_DIALOGUE",
          endTime: performance.now(),
        });
        onTopic("farewell");
        setStatus("speaking");
        setCaption(replyText);
        setCaptionSpeaker("rahul");

        registerVideoEndCallback?.(() => {
          registerVideoEndCallback?.(null);
          registerVideoErrorCallback?.(null);
          setCaption("");
          setCaptionSpeaker(null);
          onVisualStateChange?.("LISTENING");
          onStageComplete();
        });

        onRahulVideoGenerated?.("/generated/rahul-response-turn-farewell.mp4");
        onVisualStateChange?.("SPEAKING");
        return;
      }

      try {
        const res = await fetch("/api/conversation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stage,
            project,
            stageHistory,
            questionsAskedThisStage: stageHistory
              .filter((t) => t.speaker !== "user")
              .map((t) => t.text.slice(0, 60)),
            userAnswer,
            isFinalTurn,
            priorPhaseSummary,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || "The conversation service is unavailable.");

        const turn = data as ValidatedTurn & { speaker?: Speaker };
        // The model picks who speaks in the judge phases; Rahul's phase is
        // always Rahul regardless of what comes back.
        const speaker: Speaker =
          stage === "rahul" ? "rahul" : turn.speaker === "judge2" ? "judge2" : "judge1";

        onTurn({
          id: newTurnId(),
          speaker,
          text: turn.reply,
          stage,
          kind: "CHARACTER_DIALOGUE",
          endTime: performance.now(),
        });
        onTopic(turn.topicCovered);

        const proceed = () => {
          if (isFinalTurn) {
            setCaption("");
            setCaptionSpeaker(null);
            onStageComplete();
          } else {
            beginListeningRef.current();
          }
        };

        if ((data as { degraded?: boolean }).degraded) {
          showSystem("Running in offline mode — questions are less tailored than usual.", 6000);
        }

        if (speaker === "rahul") {
          const rahulTurnCount = stageHistory.filter((t) => t.speaker === "rahul").length;
          let textHash = 0;
          for (let i = 0; i < turn.reply.length; i++) {
            textHash = ((textHash << 5) - textHash + turn.reply.charCodeAt(i)) | 0;
          }
          const hashStr = Math.abs(textHash).toString(36);
          const turnId = isFinalTurn
            ? "turn-farewell"
            : rahulTurnCount === 0
            ? "turn1-opening"
            : `dynamic-${hashStr}`;

          // Trigger immediate status, caption, and audio/video playback setup
          setStatus("speaking");
          setCaption(turn.reply);
          setCaptionSpeaker(speaker);

          const triggerFallback = () => {
            console.warn("[ConversationController] Video playback failed or slow, using TTS over listening.mp4.");
            registerVideoEndCallback?.(null);
            registerVideoErrorCallback?.(null);
            speak(turn.reply, {
              character: "rahul",
              onStart: () => interruptions?.characterSpeechStarted(),
              onEnd: () => {
                interruptions?.characterSpeechEnded();
                setCaption("");
                setCaptionSpeaker(null);
                onVisualStateChange?.("LISTENING");
                proceed();
              },
              onError: () => {
                interruptions?.characterSpeechEnded();
                setCaption("");
                setCaptionSpeaker(null);
                window.setTimeout(proceed, 1500);
              },
            });
          };

          registerVideoErrorCallback?.(triggerFallback);

          registerVideoEndCallback?.(() => {
            registerVideoEndCallback?.(null);
            registerVideoErrorCallback?.(null);
            setCaption("");
            setCaptionSpeaker(null);
            onVisualStateChange?.("LISTENING");
            proceed();
          });

          // Fetch generated video (instant 15ms cache hit for Turn 1 or pre-generated turns)
          try {
            const vidRes = await fetch("/api/generate-video", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ responseId: turnId, text: turn.reply }),
            });
            const vidData = await vidRes.json();
            if (vidRes.ok && vidData.videoUrl) {
              onRahulVideoGenerated?.(vidData.videoUrl);
              onVisualStateChange?.("SPEAKING");
              return;
            } else {
              triggerFallback();
            }
          } catch (vidErr) {
            console.warn("[ConversationController] Video generation error, falling back to TTS:", vidErr);
            triggerFallback();
          }
          return;
        }

        setCaption(turn.reply);
        setCaptionSpeaker(speaker);
        setStatus("speaking");

        speak(turn.reply, {
          character: speaker as CharacterVoice,
          onStart: () => interruptions?.characterSpeechStarted(),
          onEnd: () => {
            interruptions?.characterSpeechEnded();
            proceed();
          },
          onError: () => {
            interruptions?.characterSpeechEnded();
            window.setTimeout(proceed, 1500);
          },
        });
      } catch (err) {
        setStatus("error");
        setErrorMessage((err as Error).message);
      }
    },
    [stage, project, stageHistory, priorPhaseSummary, onTurn, onTopic, onStageComplete, interruptions, showSystem, onVisualStateChange, onRahulVideoGenerated, registerVideoEndCallback, registerVideoErrorCallback]
  );

  const requestTurnRef = useRef(requestTurn);
  requestTurnRef.current = requestTurn;

  // Open the phase exactly once when it becomes active.
  useEffect(() => {
    if (!active) return;
    if (openedForStageRef.current === stage) return;
    openedForStageRef.current = stage;
    answersThisStageRef.current = 0;
    void requestTurnRef.current(undefined, false);
  }, [active, stage]);

  // Teardown when this phase stops being active.
  useEffect(() => {
    if (active) return;
    stopSpeaking();
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    clearIdleTimer();
    setCaption("");
    setCaptionSpeaker(null);
    setPresentationEndsAt(null);
    setStatus("idle");
  }, [active, clearIdleTimer]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      recognitionRef.current?.stop();
      clearIdleTimer();
    };
  }, [clearIdleTimer]);

  if (!active) return null;

  const phase: DialoguePhase =
    status === "speaking" ? "CHARACTER_SPEAKING"
    : status === "listening" || status === "presenting" ? "USER_SPEAKING"
    : status === "typing" ? "AWAITING_USER"
    : status === "requesting" ? "THINKING"
    : "IDLE";

  const showTypedInput = status === "typing" || status === "listening" || (status === "presenting" && micUnavailable);

  return (
    <>
      <TranscriptOverlay speaker={captionSpeaker} text={caption} />
      <VoiceIndicator phase={phase} />

      {userInterimSpeech && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-[450] -translate-x-1/2 rounded-2xl bg-black/80 px-6 py-3 text-center backdrop-blur-md border border-white/20 max-w-[min(560px,90vw)] shadow-xl">
          <p className="font-mono text-[10px] uppercase tracking-widest text-sky-400 mb-1">Live Voice Input</p>
          <p className="text-base text-neutral-100 italic">&ldquo;{userInterimSpeech}&rdquo;</p>
        </div>
      )}

      {presentationEndsAt && (
        <PresentationTimer
          endsAt={presentationEndsAt}
          onExpire={() => showSystem("Time's up — wrap up when you're ready.", 6000)}
        />
      )}

      {/* SYSTEM_MESSAGE surface. Never routed to TTS. */}
      {systemNotice && (
        <div
          role="status"
          className="pointer-events-none fixed left-1/2 top-6 z-[700] -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-center text-xs text-neutral-200 backdrop-blur-sm"
        >
          {systemNotice}
        </div>
      )}

      {showTypedInput && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (typedValue.trim()) submitAnswer(typedValue.trim());
          }}
          className="fixed bottom-20 left-1/2 z-[500] flex w-[min(580px,90vw)] -translate-x-1/2 items-center gap-2"
        >
          {speechSupported && !micUnavailable && (
            <button
              type="button"
              onClick={() => {
                if (status === "listening") {
                  recognitionRef.current?.stop();
                  setStatus("typing");
                } else {
                  beginListening();
                }
              }}
              title={status === "listening" ? "Listening... Click to pause mic" : "Click to speak with microphone"}
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all backdrop-blur-sm ${
                status === "listening"
                  ? "border-emerald-400 bg-emerald-500/25 text-emerald-300 shadow-[0_0_15px_rgba(52,211,153,0.5)]"
                  : "border-white/20 bg-black/60 text-neutral-300 hover:border-white/40 hover:bg-white/10 hover:text-white"
              }`}
            >
              {status === "listening" && (
                <span className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping" />
              )}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 relative z-10"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </button>
          )}
          <input
            autoFocus
            value={typedValue}
            onChange={(e) => setTypedValue(e.target.value)}
            placeholder={
              status === "listening"
                ? "Listening to your voice... (or type here)"
                : speechSupported
                ? "Type response, or click mic to speak…"
                : "Voice unavailable — type your response"
            }
            aria-label="Your response"
            className="flex-1 rounded-full border border-white/20 bg-black/60 px-4 py-2 text-sm text-white placeholder:text-neutral-500 backdrop-blur-sm focus:border-sky-400 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-full bg-sky-500 px-5 py-2 text-sm font-medium text-white hover:bg-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 transition-colors"
          >
            Send
          </button>
        </form>
      )}

      {status === "presenting" && !showTypedInput && (
        <button
          onClick={() => {
            recognitionRef.current?.stop();
            setStatus("typing");
          }}
          className="fixed bottom-20 left-1/2 z-[500] -translate-x-1/2 rounded-full border border-white/20 bg-black/60 px-5 py-2 text-xs uppercase tracking-widest text-neutral-200 backdrop-blur-sm hover:bg-white/10"
        >
          I&apos;ve finished presenting
        </button>
      )}

      {status === "error" && (
        <div className="fixed bottom-20 left-1/2 z-[500] flex w-[min(460px,90vw)] -translate-x-1/2 flex-col items-center gap-2 rounded-lg bg-black/75 px-5 py-4 text-center backdrop-blur-sm">
          <p className="text-sm text-neutral-200">{errorMessage}</p>
          <div className="flex gap-4">
            <button
              onClick={() =>
                void requestTurn(lastRequestRef.current.userAnswer, lastRequestRef.current.isFinalTurn)
              }
              className="font-mono text-xs uppercase tracking-widest text-sky-400 hover:text-sky-300"
            >
              Retry
            </button>
            <button
              onClick={onStageComplete}
              className="font-mono text-xs uppercase tracking-widest text-neutral-500 hover:text-neutral-300"
            >
              Skip ahead
            </button>
          </div>
        </div>
      )}
    </>
  );
}
