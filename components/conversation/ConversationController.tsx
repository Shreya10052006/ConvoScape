"use client";

/**
 * ConversationController.tsx
 * ---------------------------------------------------------------------------
 * Zero-Latency Interleaved Prefetch Conversation Controller for ConvoScape.
 *
 * Sequence:
 * Intro (pre-gen) -> Q1 (pre-gen) -> Q2 (tailored) -> Q3 (pre-gen) ->
 * Q4 (tailored) -> Q5 (pre-gen) -> Q6 (tailored) -> Q7 (pre-gen) ->
 * Q8 (tailored) -> Q9 (pre-gen) -> Q10 (tailored) -> Farewell (pre-gen).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isSpeechRecognitionSupported,
  startSpeechRecognition,
  type SpeechRecognitionHandle,
} from "@/lib/speech/speechRecognition";
import { AudioActivityTracker } from "@/lib/speech/audioActivityTracker";
import { analyzeSingleAnswer } from "@/lib/speech/speechAnalysis";
import { speak, stopSpeaking, type CharacterVoice } from "@/lib/speech/speechSynthesis";
import {
  PRESENTATION_SECONDS,
  newTurnId,
  type ConversationStage,
  type ProjectContext,
  type Speaker,
  type TranscriptTurn,
} from "@/lib/session/sessionTypes";
import type { DialoguePhase } from "@/lib/session/dialogueMachine";
import type { InterruptionTracker } from "@/lib/speech/interruptionTracker";
import VoiceIndicator from "./VoiceIndicator";
import TranscriptOverlay from "./TranscriptOverlay";
import PresentationTimer from "./PresentationTimer";

const IDLE_NUDGE_MS = 20_000;

interface Props {
  active: boolean;
  stage: Exclude<ConversationStage, "done">;
  project: ProjectContext;
  stageHistory: TranscriptTurn[];
  priorPhaseSummary?: string;
  mediaStream?: MediaStream | null;
  onTurn: (turn: TranscriptTurn) => void;
  onTopic: (topic: string) => void;
  onStageComplete: () => void;
  interruptions?: InterruptionTracker;
  onVisualStateChange?: (state: "SPEAKING" | "LISTENING" | "IDLE") => void;
  onRahulVideoGenerated?: (url: string) => void;
  registerVideoEndCallback?: (cb: (() => void) | null) => void;
  registerVideoErrorCallback?: (cb: (() => void) | null) => void;
}

type LocalStatus = "idle" | "requesting" | "speaking" | "listening" | "typing" | "presenting" | "error";

interface PrefetchedSlot {
  questionNum: 2 | 4 | 6 | 8 | 10;
  status: "IDLE" | "GENERATING" | "READY" | "PLAYING" | "ERROR";
  reply?: string;
  topicCovered?: string;
  videoUrl?: string;
  promise?: Promise<void>;
}

// 5 Fixed Pre-Generated Anchor Questions
const FIXED_QUESTIONS: Record<1 | 3 | 5 | 7 | 9, { text: string; videoUrl: string; topic: string }> = {
  1: {
    text: "So, what are you guys working on? I’ve been seeing so many different projects around here, so I’m curious — what’s yours about, and what made you guys decide to build it?",
    videoUrl: "/generated/rahul-response-rahul-q1.mp4",
    topic: "project overview",
  },
  3: {
    text: "Yeah, I get what you mean. One thing I always find interesting with hackathon projects is how different the idea sounds compared to actually using it. If you had to show this to someone who knew nothing about it, what would you want them to understand first?",
    videoUrl: "/generated/rahul-response-rahul-q3.mp4",
    topic: "user perspective",
  },
  5: {
    text: "By the way, I always get curious about the tech side of these projects. When you guys were actually building this, what part ended up being more difficult than you expected?",
    videoUrl: "/generated/rahul-response-rahul-q5.mp4",
    topic: "technical hurdles",
  },
  7: {
    text: "Okay, random question — if you guys actually got another month to keep working on this after the hackathon, what would you change or add first?",
    videoUrl: "/generated/rahul-response-rahul-q7.mp4",
    topic: "future roadmap",
  },
  9: {
    text: "Honestly, after working on it and talking about it this much, what’s the one part of your project you’re most excited to show someone?",
    videoUrl: "/generated/rahul-response-rahul-q9.mp4",
    topic: "favorite highlight",
  },
};

const INTRO_TURN = {
  text: "Hey! I was just walking around checking out other tables. I'm Rahul, 3rd year CS from RV College. What's your name, and where are you guys from?",
  videoUrl: "/generated/rahul-response-turn1-opening.mp4",
  topic: "intro",
};

const FAREWELL_TURN = {
  text: "That sounds seriously awesome! Best of luck with the demo — I heard the judges are starting their rounds in a few hours, so make sure you're ready. I gotta run back to my table to finish our deployment. Catch you later!",
  videoUrl: "/generated/rahul-response-turn-farewell.mp4",
  topic: "farewell",
};

// 3 Short Peer Reaction Filler Clips (1.5-2 seconds each)
const FILLER_VIDEOS = [
  { text: "Ah, got it.", videoUrl: "/generated/rahul-response-rahul-filler-1.mp4" },
  { text: "Hmm, okay, makes sense.", videoUrl: "/generated/rahul-response-rahul-filler-2.mp4" },
  { text: "Right, that's interesting.", videoUrl: "/generated/rahul-response-rahul-filler-3.mp4" },
];

export default function ConversationController({
  active,
  stage,
  project,
  stageHistory,
  priorPhaseSummary,
  mediaStream,
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

  // Current Step in Rahul's sequence: 0=Intro, 1=Q1, 2=Q2, ..., 10=Q10, 11=Farewell
  const currentStepRef = useRef<number>(0);
  // Store user answers indexed by question number (1..10)
  const answersRef = useRef<Record<number, string>>({});
  // Prefetch slots for tailored turns (Q2, Q4, Q6, Q8, Q10)
  const prefetchSlotsRef = useRef<Record<number, PrefetchedSlot>>({
    2: { questionNum: 2, status: "IDLE" },
    4: { questionNum: 4, status: "IDLE" },
    6: { questionNum: 6, status: "IDLE" },
    8: { questionNum: 8, status: "IDLE" },
    10: { questionNum: 10, status: "IDLE" },
  });

  const recognitionRef = useRef<SpeechRecognitionHandle | null>(null);
  const audioActivityTrackerRef = useRef<AudioActivityTracker>(new AudioActivityTracker());
  const idleTimerRef = useRef<number | null>(null);
  const beginListeningRef = useRef<() => void>(() => {});

  const speechSupported = isSpeechRecognitionSupported();

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

  /**
   * Trigger background generation of a tailored question + TTS + Wav2Lip video.
   */
  const triggerPrefetch = useCallback(
    (qNum: 2 | 4 | 6 | 8 | 10) => {
      const slot = prefetchSlotsRef.current[qNum];
      if (!slot || slot.status === "GENERATING" || slot.status === "READY") return;

      slot.status = "GENERATING";

      // Assemble strict context boundary for this tailored question
      const allowedAnswers: Array<{ questionNum: number; answer: string }> = [];
      if (qNum >= 4) {
        if (answersRef.current[1]) allowedAnswers.push({ questionNum: 1, answer: answersRef.current[1] });
        if (answersRef.current[2]) allowedAnswers.push({ questionNum: 2, answer: answersRef.current[2] });
      }
      if (qNum >= 6) {
        if (answersRef.current[3]) allowedAnswers.push({ questionNum: 3, answer: answersRef.current[3] });
        if (answersRef.current[4]) allowedAnswers.push({ questionNum: 4, answer: answersRef.current[4] });
      }
      if (qNum >= 8) {
        if (answersRef.current[5]) allowedAnswers.push({ questionNum: 5, answer: answersRef.current[5] });
        if (answersRef.current[6]) allowedAnswers.push({ questionNum: 6, answer: answersRef.current[6] });
      }
      if (qNum >= 10) {
        if (answersRef.current[7]) allowedAnswers.push({ questionNum: 7, answer: answersRef.current[7] });
        if (answersRef.current[8]) allowedAnswers.push({ questionNum: 8, answer: answersRef.current[8] });
      }

      console.log(`[Prefetch Queue] Starting background generation for Q${qNum} with ${allowedAnswers.length} prior answers...`);

      const genPromise = (async () => {
        try {
          // 1. Fetch Tailored Question from Gemini
          const turnRes = await fetch("/api/conversation/tailored", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              questionNumber: qNum,
              project,
              allowedAnswers,
            }),
          });
          const turnData = await turnRes.json();
          const replyText = turnData.reply || `What made you choose this architecture for ${project.name}?`;
          const topic = turnData.topicCovered || `tailored-q${qNum}`;

          slot.reply = replyText;
          slot.topicCovered = topic;

          // 2. Render Wav2Lip Video in Background Daemon
          let textHash = 0;
          for (let i = 0; i < replyText.length; i++) {
            textHash = ((textHash << 5) - textHash + replyText.charCodeAt(i)) | 0;
          }
          const hashStr = Math.abs(textHash).toString(36);
          const videoId = `tailored-q${qNum}-${hashStr}`;

          const vidRes = await fetch("/api/generate-video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ responseId: videoId, text: replyText }),
          });
          const vidData = await vidRes.json();

          if (vidRes.ok && vidData.videoUrl) {
            slot.videoUrl = vidData.videoUrl;
            slot.status = "READY";
            console.log(`[Prefetch Queue] Q${qNum} video is READY in background cache: ${vidData.videoUrl}`);
          } else {
            console.warn(`[Prefetch Queue] Video generation returned non-ok for Q${qNum}, marked ready with TTS fallback.`);
            slot.status = "READY";
          }
        } catch (err) {
          console.warn(`[Prefetch Queue] Background prefetch error for Q${qNum}:`, err);
          slot.status = "READY"; // Still ready so state machine won't hang; uses fallback TTS
        }
      })();

      slot.promise = genPromise;
    },
    [project]
  );

  /**
   * Play a character turn with video, or graceful TTS fallback over listening.mp4.
   */
  const playCharacterTurn = useCallback(
    (text: string, topic: string, videoUrl?: string, onEnded?: () => void) => {
      onTurn({
        id: newTurnId(),
        speaker: "rahul",
        text,
        stage,
        kind: "CHARACTER_DIALOGUE",
        endTime: performance.now(),
      });
      onTopic(topic);

      setStatus("speaking");
      setCaption(text);
      setCaptionSpeaker("rahul");
      onVisualStateChange?.("SPEAKING");

      const cleanupAndProceed = () => {
        registerVideoEndCallback?.(null);
        registerVideoErrorCallback?.(null);
        setCaption("");
        setCaptionSpeaker(null);
        onVisualStateChange?.("LISTENING");
        if (onEnded) onEnded();
      };

      const fallbackTTS = () => {
        console.warn("[ConversationController] Video unavailable, using TTS audio over listening.mp4.");
        registerVideoEndCallback?.(null);
        registerVideoErrorCallback?.(null);
        speak(text, {
          character: "rahul",
          onStart: () => interruptions?.characterSpeechStarted(),
          onEnd: () => {
            interruptions?.characterSpeechEnded();
            cleanupAndProceed();
          },
          onError: () => {
            interruptions?.characterSpeechEnded();
            window.setTimeout(cleanupAndProceed, 1200);
          },
        });
      };

      if (videoUrl) {
        registerVideoErrorCallback?.(fallbackTTS);
        registerVideoEndCallback?.(cleanupAndProceed);
        onRahulVideoGenerated?.(videoUrl);
      } else {
        fallbackTTS();
      }
    },
    [onTurn, onTopic, stage, onVisualStateChange, registerVideoEndCallback, registerVideoErrorCallback, onRahulVideoGenerated, interruptions]
  );

  /**
   * Advance through the 12 conversation steps.
   */
  const executeStep = useCallback(
    async (step: number) => {
      currentStepRef.current = step;

      // --- STEP 0: INTRO VIDEO (Pre-generated) ---
      if (step === 0) {
        // Kick off Q2 generation immediately from questionnaire!
        triggerPrefetch(2);

        playCharacterTurn(INTRO_TURN.text, INTRO_TURN.topic, INTRO_TURN.videoUrl, () => {
          beginListeningRef.current();
        });
        return;
      }

      // --- STEP 1: Q1 (Pre-generated) ---
      if (step === 1) {
        const q = FIXED_QUESTIONS[1];
        playCharacterTurn(q.text, q.topic, q.videoUrl, () => {
          beginListeningRef.current();
        });
        return;
      }

      // --- STEP 2: Q2 (Tailored - already ready from setup/intro) ---
      if (step === 2) {
        const slot = prefetchSlotsRef.current[2];
        if (slot.status === "GENERATING" && slot.promise) {
          const filler = FILLER_VIDEOS[0];
          playCharacterTurn(filler.text, "acknowledgement", filler.videoUrl);
          await slot.promise;
        }
        const text = slot.reply || `What made you choose this problem to work on for ${project.name}?`;
        const topic = slot.topicCovered || "project motivation";
        playCharacterTurn(text, topic, slot.videoUrl, () => {
          beginListeningRef.current();
        });
        return;
      }

      // --- STEP 3: Q3 (Pre-generated) ---
      if (step === 3) {
        const q = FIXED_QUESTIONS[3];
        playCharacterTurn(q.text, q.topic, q.videoUrl, () => {
          beginListeningRef.current();
        });
        return;
      }

      // --- STEP 4: Q4 (Tailored - generated in background during Q3) ---
      if (step === 4) {
        const slot = prefetchSlotsRef.current[4];
        if (slot.status === "GENERATING" && slot.promise) {
          const filler = FILLER_VIDEOS[1];
          playCharacterTurn(filler.text, "acknowledgement", filler.videoUrl);
          await slot.promise;
        }
        const text = slot.reply || `How does the core workflow in ${project.name} handle high load or latency?`;
        const topic = slot.topicCovered || "architecture deep-dive";
        playCharacterTurn(text, topic, slot.videoUrl, () => {
          beginListeningRef.current();
        });
        return;
      }

      // --- STEP 5: Q5 (Pre-generated) ---
      if (step === 5) {
        const q = FIXED_QUESTIONS[5];
        playCharacterTurn(q.text, q.topic, q.videoUrl, () => {
          beginListeningRef.current();
        });
        return;
      }

      // --- STEP 6: Q6 (Tailored - generated in background during Q5) ---
      if (step === 6) {
        const slot = prefetchSlotsRef.current[6];
        if (slot.status === "GENERATING" && slot.promise) {
          const filler = FILLER_VIDEOS[2];
          playCharacterTurn(filler.text, "acknowledgement", filler.videoUrl);
          await slot.promise;
        }
        const text = slot.reply || `When edge cases or bad inputs occur in ${project.name}, how do you prevent failures?`;
        const topic = slot.topicCovered || "edge case handling";
        playCharacterTurn(text, topic, slot.videoUrl, () => {
          beginListeningRef.current();
        });
        return;
      }

      // --- STEP 7: Q7 (Pre-generated) ---
      if (step === 7) {
        const q = FIXED_QUESTIONS[7];
        playCharacterTurn(q.text, q.topic, q.videoUrl, () => {
          beginListeningRef.current();
        });
        return;
      }

      // --- STEP 8: Q8 (Tailored - generated in background during Q7) ---
      if (step === 8) {
        const slot = prefetchSlotsRef.current[8];
        if (slot.status === "GENERATING" && slot.promise) {
          const filler = FILLER_VIDEOS[0];
          playCharacterTurn(filler.text, "acknowledgement", filler.videoUrl);
          await slot.promise;
        }
        const text = slot.reply || `What trade-off did you have to make during development that you'd rethink with more time?`;
        const topic = slot.topicCovered || "engineering trade-offs";
        playCharacterTurn(text, topic, slot.videoUrl, () => {
          beginListeningRef.current();
        });
        return;
      }

      // --- STEP 9: Q9 (Pre-generated) ---
      if (step === 9) {
        const q = FIXED_QUESTIONS[9];
        playCharacterTurn(q.text, q.topic, q.videoUrl, () => {
          beginListeningRef.current();
        });
        return;
      }

      // --- STEP 10: Q10 (Tailored - generated in background during Q9) ---
      if (step === 10) {
        const slot = prefetchSlotsRef.current[10];
        if (slot.status === "GENERATING" && slot.promise) {
          const filler = FILLER_VIDEOS[1];
          playCharacterTurn(filler.text, "acknowledgement", filler.videoUrl);
          await slot.promise;
        }
        const text = slot.reply || `What's the single most important takeaway you want the judges to remember about ${project.name}?`;
        const topic = slot.topicCovered || "key takeaway";
        playCharacterTurn(text, topic, slot.videoUrl, () => {
          beginListeningRef.current();
        });
        return;
      }

      // --- STEP 11: FAREWELL (Pre-generated) ---
      if (step === 11) {
        playCharacterTurn(FAREWELL_TURN.text, FAREWELL_TURN.topic, FAREWELL_TURN.videoUrl, () => {
          onStageComplete();
        });
      }
    },
    [playCharacterTurn, triggerPrefetch, project, onStageComplete]
  );

  const submitAnswer = useCallback(
    (text: string, startTime?: number, endTime?: number) => {
      clearIdleTimer();
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setPresentationEndsAt(null);
      setUserInterimSpeech("");

      const pauseTiming = audioActivityTrackerRef.current.stop(startTime, endTime);
      const detailedAnswer = analyzeSingleAnswer(text, pauseTiming, project);

      onTurn({
        id: newTurnId(),
        speaker: "user",
        text,
        rawTranscript: text,
        normalizedTranscript: detailedAnswer.normalizedTranscript,
        detailedAnswer,
        stage,
        kind: "CHARACTER_DIALOGUE",
        startTime: startTime ?? pauseTiming.speechStartTime ?? undefined,
        endTime: endTime ?? pauseTiming.speechEndTime ?? undefined,
      });
      setCaption("");
      setCaptionSpeaker(null);

      const currentStep = currentStepRef.current;

      if (stage === "rahul") {
        // Record user answer for context boundary tracking
        // Step 0 = Intro Answer, Step 1 = Q1 Answer, Step 2 = Q2 Answer, etc.
        if (currentStep >= 1 && currentStep <= 10) {
          answersRef.current[currentStep] = text;
        }

        // TRIGGER BACKGROUND PREFETCH PIPELINES
        if (currentStep === 2) {
          // User just answered Q2 -> Trigger Q4 background generation (Context: Questionnaire + Q1 + Q2)
          triggerPrefetch(4);
        } else if (currentStep === 4) {
          // User just answered Q4 -> Trigger Q6 background generation (Context: Questionnaire + Q1..Q4)
          triggerPrefetch(6);
        } else if (currentStep === 6) {
          // User just answered Q6 -> Trigger Q8 background generation (Context: Questionnaire + Q1..Q6)
          triggerPrefetch(8);
        } else if (currentStep === 8) {
          // User just answered Q8 -> Trigger Q10 background generation (Context: Questionnaire + Q1..Q8)
          triggerPrefetch(10);
        }

        // Advance to next step
        const nextStep = currentStep + 1;
        void executeStep(nextStep);
      }
    },
    [clearIdleTimer, onTurn, stage, triggerPrefetch, executeStep, project]
  );

  const beginListening = useCallback(() => {
    setTypedValue("");
    setUserInterimSpeech("");

    if (stage === "presentation") {
      setPresentationEndsAt(Date.now() + PRESENTATION_SECONDS * 1000);
      setStatus("presenting");
      showSystem(`Your presentation has started — about ${Math.round(PRESENTATION_SECONDS / 60)} minutes.`, 6000);
    } else {
      setStatus("listening");
    }

    // Start lightweight browser-side Web Audio VAD for accurate pause timing
    audioActivityTrackerRef.current.start(mediaStream);

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

    clearIdleTimer();
    idleTimerRef.current = window.setTimeout(() => {
      showSystem("Take your time. You can respond when you're ready.", 6000);
    }, IDLE_NUDGE_MS);
  }, [stage, speechSupported, micUnavailable, showSystem, submitAnswer, clearIdleTimer, interruptions, mediaStream]);

  beginListeningRef.current = beginListening;

  // Initialize Rahul's stage at step 0 (Intro)
  useEffect(() => {
    if (!active) return;
    if (stage === "rahul") {
      void executeStep(0);
    }
  }, [active, stage, executeStep]);

  // Teardown when inactive
  useEffect(() => {
    if (active) return;
    stopSpeaking();
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    audioActivityTrackerRef.current.stop();
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
      audioActivityTrackerRef.current.stop();
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

      {status === "error" && (
        <div className="fixed bottom-20 left-1/2 z-[500] flex w-[min(460px,90vw)] -translate-x-1/2 flex-col items-center gap-2 rounded-lg bg-black/75 px-5 py-4 text-center backdrop-blur-sm">
          <p className="text-sm text-neutral-200">{errorMessage}</p>
          <div className="flex gap-4">
            <button
              onClick={() => void executeStep(currentStepRef.current)}
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
