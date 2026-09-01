"use client";

/**
 * JudgeConversationController.tsx
 * ---------------------------------------------------------------------------
 * Orchestrates the full 8-question hackathon judging panel dialogue.
 * Alternates between:
 * - Female Judge (Judge 1): Fixed pre-generated anchor questions (Q1, Q3, Q5, Q7, clarification, farewell)
 * - Male Judge (Judge 2): Gemini-tailored questions (Team Intro, Q2, Q4, Q6, Q8)
 *
 * Implements:
 * 1. Background video generation & zero-latency interleaved prefetch state machine
 * 2. Team-name confirmation branch (CONFIRMED -> Q1; DENIED/UNCLEAR -> Female clarification)
 * 3. Strict context boundaries (Q2=Questionnaire, Q4=Q1-Q2, Q6=Q1-Q4, Q8=Q1-Q6)
 * 4. AudioActivityTracker pause timing and raw speech preservation
 * 5. Zero black screens
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import type {
  ProjectContext,
  TranscriptTurn,
  DetailedUserAnswer,
  AudioPauseTiming,
  CompactQuestionTurn,
} from "@/lib/session/sessionTypes";
import type { InterruptionTracker } from "@/lib/speech/interruptionTracker";
import type { JudgesVideoState } from "@/components/scene/JudgesVideoController";
import { speak, stopSpeaking } from "@/lib/speech/speechSynthesis";
import { AudioActivityTracker } from "@/lib/speech/audioActivityTracker";
import { analyzeSingleAnswer } from "@/lib/speech/speechAnalysis";
import PresentationTimer from "./PresentationTimer";

export type ConfirmationIntent = "CONFIRMED" | "DENIED" | "UNCLEAR";

export function classifyTeamConfirmation(transcript: string): ConfirmationIntent {
  const clean = transcript.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "");
  if (!clean) return "UNCLEAR";

  const confirmRegex = /\b(yes|yeah|yep|yup|correct|thats right|that is right|thats us|that is us|sure|right|true|affirmative|indeed)\b/i;
  const denyRegex = /\b(no|nope|not our team|wrong team|nah|not us|different team|incorrect|actually were|actually we are|actually we)\b/i;

  if (denyRegex.test(clean) && !confirmRegex.test(clean)) {
    return "DENIED";
  }
  if (confirmRegex.test(clean) && !denyRegex.test(clean)) {
    return "CONFIRMED";
  }
  return "UNCLEAR";
}

// Fixed Judge Video Constants
export const FIXED_JUDGE_TURNS = {
  clarification: {
    text: "Oh, sorry about the confusion. Could you tell us your team name?",
    speaker: "judge1" as const,
    videoUrl: "/generated/judge-female-team-name-clarification.mp4",
  },
  q1: {
    text: "Alright. You’ll have about three minutes to present your project. Give us a clear idea of the problem you’re solving, how your solution works, and what you’ve actually built so far.",
    speaker: "judge1" as const,
    videoUrl: "/generated/judge-female-q1.mp4",
  },
  q3: {
    text: "Now that I understand the basic idea, I'm curious — what made you choose this particular approach instead of the other ways you could have solved the problem?",
    speaker: "judge1" as const,
    videoUrl: "/generated/judge-female-q3.mp4",
  },
  q5: {
    text: "Thinking about the actual users of your project, what do you think would be the biggest challenge in getting people to really use it?",
    speaker: "judge1" as const,
    videoUrl: "/generated/judge-female-q5.mp4",
  },
  q7: {
    text: "One last thing I'm curious about — if you had a little more time to improve this project, what would you change first, and why?",
    speaker: "judge1" as const,
    videoUrl: "/generated/judge-female-q7.mp4",
  },
  farewell: {
    text: "Alright, I think we’ve got everything we need. Thanks for explaining your project, and all the best!",
    speaker: "judge1" as const,
    videoUrl: "/generated/judge-female-farewell.mp4",
  },
};

type PrefetchStatus = "IDLE" | "GENERATING_TEXT" | "TEXT_READY" | "GENERATING_VIDEO" | "READY" | "PLAYING" | "ERROR";

interface PrefetchSlot {
  questionNumber: number;
  speaker: "judge1" | "judge2";
  questionText?: string;
  reasoningTarget?: string;
  videoUrl?: string;
  status: PrefetchStatus;
  startedAt?: number;
  readyAt?: number;
  error?: string;
}

interface Props {
  project: ProjectContext;
  mediaStream?: MediaStream | null;
  onTurn: (turn: TranscriptTurn) => void;
  onJudgeStageComplete: (judgeTurns: CompactQuestionTurn[]) => void;
  interruptions: InterruptionTracker;
  onVisualStateChange: (state: JudgesVideoState, videoUrl?: string | null) => void;
  registerVideoEndCallback: (cb: () => void) => void;
  registerVideoErrorCallback: (cb: () => void) => void;
}

export default function JudgeConversationController({
  project,
  mediaStream,
  onTurn,
  onJudgeStageComplete,
  interruptions,
  onVisualStateChange,
  registerVideoEndCallback,
  registerVideoErrorCallback,
}: Props) {
  // Step in Judge sequence:
  // 0: Team Name Intro (Male)
  // 1: Team Confirmation (User response)
  // 2: Female Clarification (if denied/unclear)
  // 3: Q1 (Female - 3m presentation)
  // 4: Q2 (Male - Tailored from Questionnaire)
  // 5: Q3 (Female - Fixed)
  // 6: Q4 (Male - Tailored from Q1+Q2)
  // 7: Q5 (Female - Fixed)
  // 8: Q6 (Male - Tailored from Q1..Q4)
  // 9: Q7 (Female - Fixed)
  // 10: Q8 (Male - Tailored from Q1..Q6)
  // 11: Farewell (Female - Fixed)
  // 12: Done
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [status, setStatus] = useState<"idle" | "speaking" | "listening" | "submitting" | "done">("idle");
  const [caption, setCaption] = useState("");
  const [captionSpeaker, setCaptionSpeaker] = useState<"judge1" | "judge2" | "user" | null>(null);
  const [userInterimSpeech, setUserInterimSpeech] = useState("");
  const [typedValue, setTypedValue] = useState("");
  const [micUnavailable, setMicUnavailable] = useState(false);
  const [presentationEndsAt, setPresentationEndsAt] = useState<number | null>(null);

  // Prefetch Slots for Q2, Q4, Q6, Q8 and Team Intro
  const prefetchSlots = useRef<Record<string, PrefetchSlot>>({
    "team-intro": { questionNumber: 0, speaker: "judge2", status: "IDLE" },
    q2: { questionNumber: 2, speaker: "judge2", status: "IDLE" },
    q4: { questionNumber: 4, speaker: "judge2", status: "IDLE" },
    q6: { questionNumber: 6, speaker: "judge2", status: "IDLE" },
    q8: { questionNumber: 8, speaker: "judge2", status: "IDLE" },
  });

  // Recorded question-answer records for report
  const judgeTurnsRef = useRef<CompactQuestionTurn[]>([]);
  const userAnswersMap = useRef<Record<number, string>>({});

  // Audio Activity Tracker
  const audioActivityTrackerRef = useRef<AudioActivityTracker>(new AudioActivityTracker());
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const listenStartTimeRef = useRef<number>(0);

  // Safe team name string
  const teamName = project.teamName || project.name || "Alpha";

  // --------------------------------------------------------------------------
  // Prefetch Generator Functions
  // --------------------------------------------------------------------------

  // Generate dynamic Male Team-Name Intro video
  const prefetchTeamIntro = useCallback(async () => {
    const slot = prefetchSlots.current["team-intro"];
    if (slot.status !== "IDLE" && slot.status !== "ERROR") return;

    slot.status = "GENERATING_VIDEO";
    slot.startedAt = Date.now();
    const introText = `Hi! You guys are Team ${teamName}, right?`;
    slot.questionText = introText;

    try {
      const cleanName = teamName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
      const resId = `team-intro-${cleanName || "default"}`;
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId: resId, text: introText, character: "judge2" }),
      });

      if (res.ok) {
        const data = await res.json();
        slot.videoUrl = data.videoUrl;
        slot.status = "READY";
        slot.readyAt = Date.now();
      } else {
        slot.status = "ERROR";
      }
    } catch {
      slot.status = "ERROR";
    }
  }, [teamName]);

  // Generate Tailored Question (Q2, Q4, Q6, Q8)
  const prefetchTailoredSlot = useCallback(
    async (qNum: 2 | 4 | 6 | 8) => {
      const slotKey = `q${qNum}`;
      const slot = prefetchSlots.current[slotKey];
      if (slot.status !== "IDLE" && slot.status !== "ERROR") return;

      slot.status = "GENERATING_TEXT";
      slot.startedAt = Date.now();

      try {
        // 1. Request tailored question from Gemini
        const res = await fetch("/api/conversation/judge-tailored", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionNumber: qNum,
            project,
            answersMap: userAnswersMap.current,
          }),
        });

        if (!res.ok) throw new Error("Gemini tailored request failed");
        const data = await res.json();
        slot.questionText = data.question;
        slot.reasoningTarget = data.reasoningTarget;
        slot.status = "TEXT_READY";

        // 2. Request Wav2Lip video generation
        slot.status = "GENERATING_VIDEO";
        const cleanId = `judge2-q${qNum}-${Date.now().toString(36)}`;
        const videoRes = await fetch("/api/generate-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            responseId: cleanId,
            text: data.question,
            character: "judge2",
          }),
        });

        if (videoRes.ok) {
          const videoData = await videoRes.json();
          slot.videoUrl = videoData.videoUrl;
          slot.status = "READY";
          slot.readyAt = Date.now();
        } else {
          slot.status = "ERROR";
        }
      } catch (err) {
        console.error(`[JudgeController] Prefetch failed for Q${qNum}:`, err);
        slot.status = "ERROR";
      }
    },
    [project]
  );

  // Initialize Prefetches early
  useEffect(() => {
    prefetchTeamIntro();
    prefetchTailoredSlot(2);
  }, [prefetchTeamIntro, prefetchTailoredSlot]);

  // --------------------------------------------------------------------------
  // Speech Recognition (STT)
  // --------------------------------------------------------------------------
  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setMicUnavailable(true);
      setStatus("listening");
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onstart = () => {
        isListeningRef.current = true;
        listenStartTimeRef.current = Date.now();
        audioActivityTrackerRef.current.start(mediaStream);
        setStatus("listening");
        setCaption("");
      };

      rec.onresult = (event: any) => {
        let interim = "";
        let final = "";
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0].transcript + " ";
          } else {
            interim += result[0].transcript;
          }
        }
        const fullText = (final + interim).trim();
        setUserInterimSpeech(fullText);
        setCaption(fullText);
        setCaptionSpeaker("user");
      };

      rec.onerror = (e: any) => {
        console.warn("[JudgeController] STT error:", e.error);
        if (e.error === "not-allowed") setMicUnavailable(true);
      };

      rec.onend = () => {
        if (isListeningRef.current) {
          try {
            rec.start();
          } catch {}
        }
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      setMicUnavailable(true);
      setStatus("listening");
    }
  }, [mediaStream]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
  }, []);

  // --------------------------------------------------------------------------
  // Step Execution & Speaking Handlers
  // --------------------------------------------------------------------------

  // Speak a turn (via MP4 video or TTS fallback)
  const speakTurn = useCallback(
    (text: string, speaker: "judge1" | "judge2", videoUrl?: string | null, onEnded?: () => void) => {
      setStatus("speaking");
      setCaption(text);
      setCaptionSpeaker(speaker);

      if (videoUrl) {
        onVisualStateChange("SPEAKING", videoUrl);
        // Video ends callback will trigger onEnded
      } else {
        // Fallback to browser TTS over judge listening loop
        onVisualStateChange("LISTENING");
        speak(text, {
          character: speaker,
          onStart: () => interruptions.characterSpeechStarted(Date.now()),
          onEnd: () => {
            interruptions.characterSpeechEnded(Date.now());
            onEnded?.();
          },
          onError: () => onEnded?.(),
        });
      }
    },
    [interruptions, onVisualStateChange]
  );

  // Advance state machine
  const executeStep = useCallback(
    (step: number) => {
      setCurrentStep(step);

      // Step 0: Team Name Intro (Male Judge)
      if (step === 0) {
        const slot = prefetchSlots.current["team-intro"];
        const text = slot.questionText || `Hi! You guys are Team ${teamName}, right?`;
        speakTurn(text, "judge2", slot.videoUrl, () => {
          onVisualStateChange("LISTENING");
          startListening();
        });
        return;
      }

      // Step 2: Female Clarification
      if (step === 2) {
        const item = FIXED_JUDGE_TURNS.clarification;
        speakTurn(item.text, "judge1", item.videoUrl, () => {
          onVisualStateChange("LISTENING");
          startListening();
        });
        return;
      }

      // Step 3: Q1 (Female Judge - 3m Presentation)
      if (step === 3) {
        const item = FIXED_JUDGE_TURNS.q1;
        speakTurn(item.text, "judge1", item.videoUrl, () => {
          onVisualStateChange("LISTENING");
          setPresentationEndsAt(Date.now() + 180_000); // 3 minutes soft presentation timer
          startListening();
        });
        return;
      }

      // Step 4: Q2 (Male Judge - Tailored from Questionnaire)
      if (step === 4) {
        setPresentationEndsAt(null);
        const slot = prefetchSlots.current["q2"];
        const text = slot.questionText || `What were the technical factors that led you to choose your current architecture for ${project.name}?`;
        speakTurn(text, "judge2", slot.videoUrl, () => {
          onVisualStateChange("LISTENING");
          startListening();
        });
        return;
      }

      // Step 5: Q3 (Female Judge - Fixed)
      if (step === 5) {
        const item = FIXED_JUDGE_TURNS.q3;
        speakTurn(item.text, "judge1", item.videoUrl, () => {
          onVisualStateChange("LISTENING");
          startListening();
        });
        return;
      }

      // Step 6: Q4 (Male Judge - Tailored from Q1+Q2)
      if (step === 6) {
        const slot = prefetchSlots.current["q4"];
        const text = slot.questionText || `How does your system perform when scaled or handling sudden user load?`;
        speakTurn(text, "judge2", slot.videoUrl, () => {
          onVisualStateChange("LISTENING");
          startListening();
        });
        return;
      }

      // Step 7: Q5 (Female Judge - Fixed)
      if (step === 7) {
        const item = FIXED_JUDGE_TURNS.q5;
        speakTurn(item.text, "judge1", item.videoUrl, () => {
          onVisualStateChange("LISTENING");
          startListening();
        });
        return;
      }

      // Step 8: Q6 (Male Judge - Tailored from Q1..Q4)
      if (step === 8) {
        const slot = prefetchSlots.current["q6"];
        const text = slot.questionText || `How does ${project.name} handle unexpected edge cases or corrupted input data?`;
        speakTurn(text, "judge2", slot.videoUrl, () => {
          onVisualStateChange("LISTENING");
          startListening();
        });
        return;
      }

      // Step 9: Q7 (Female Judge - Fixed)
      if (step === 9) {
        const item = FIXED_JUDGE_TURNS.q7;
        speakTurn(item.text, "judge1", item.videoUrl, () => {
          onVisualStateChange("LISTENING");
          startListening();
        });
        return;
      }

      // Step 10: Q8 (Male Judge - Tailored from Q1..Q6)
      if (step === 10) {
        const slot = prefetchSlots.current["q8"];
        const text = slot.questionText || `What is the most significant trade-off you made during this build?`;
        speakTurn(text, "judge2", slot.videoUrl, () => {
          onVisualStateChange("LISTENING");
          startListening();
        });
        return;
      }

      // Step 11: Farewell (Female Judge - Fixed)
      if (step === 11) {
        const item = FIXED_JUDGE_TURNS.farewell;
        speakTurn(item.text, "judge1", item.videoUrl, () => {
          setStatus("done");
          onVisualStateChange("LEAVING");
          onJudgeStageComplete(judgeTurnsRef.current);
        });
        return;
      }
    },
    [onJudgeStageComplete, onVisualStateChange, project.name, speakTurn, startListening, teamName]
  );

  // Register Video End callback from scene
  useEffect(() => {
    registerVideoEndCallback(() => {
      if (status === "speaking") {
        onVisualStateChange("LISTENING");
        startListening();
      }
    });

    registerVideoErrorCallback(() => {
      if (status === "speaking") {
        onVisualStateChange("LISTENING");
        startListening();
      }
    });
  }, [onVisualStateChange, registerVideoEndCallback, registerVideoErrorCallback, startListening, status]);

  // Start step 0 when mounted
  useEffect(() => {
    executeStep(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------------------------------------------------------------------------
  // User Answer Submission
  // --------------------------------------------------------------------------
  const submitAnswer = useCallback(() => {
    const rawAnswer = (userInterimSpeech || typedValue).trim();
    if (!rawAnswer && currentStep !== 1) return;

    stopListening();
    stopSpeaking();
    setStatus("submitting");

    const answerEndTime = Date.now();
    const pauseStats: AudioPauseTiming = audioActivityTrackerRef.current.stop(
      listenStartTimeRef.current,
      answerEndTime
    );

    const detailed: DetailedUserAnswer = analyzeSingleAnswer(
      rawAnswer || "Yes",
      pauseStats,
      project
    );

    // Step 0 -> Step 1: Team Confirmation Intent Classification
    if (currentStep === 0) {
      const intent = classifyTeamConfirmation(rawAnswer);
      if (intent === "CONFIRMED") {
        executeStep(3); // Proceed directly to Q1
      } else {
        executeStep(2); // Clarification branch
      }
      setUserInterimSpeech("");
      setTypedValue("");
      return;
    }

    // Step 2: User gave team name in clarification
    if (currentStep === 2) {
      executeStep(3); // Proceed to Q1
      setUserInterimSpeech("");
      setTypedValue("");
      return;
    }

    // Map question number (Step 3=Q1, Step 4=Q2, Step 5=Q3, Step 6=Q4, Step 7=Q5, Step 8=Q6, Step 9=Q7, Step 10=Q8)
    const qNum = currentStep === 3 ? 1 : currentStep - 2;
    userAnswersMap.current[qNum] = rawAnswer;

    // Record turn
    const turnRecord: CompactQuestionTurn = {
      questionNumber: qNum,
      stage: "judgeQA",
      speaker: qNum % 2 === 1 ? "judge1" : "judge2",
      questionText: caption,
      userAnswer: rawAnswer,
      rawTranscript: rawAnswer,
      durationSeconds: detailed.durationSeconds,
      speakingDurationSeconds: detailed.speakingDurationSeconds,
      silenceDurationSeconds: detailed.silenceDurationSeconds,
      wordCount: detailed.wordCount,
      fillerWords: detailed.fillerWords,
      fillerCount: detailed.fillerCount,
      pauseCount: detailed.pauseCount,
      longPauseCount: detailed.longPauseCount,
    };
    judgeTurnsRef.current.push(turnRecord);

    onTurn({
      id: `judge_turn_${qNum}_${Date.now()}`,
      stage: "judgeQA",
      speaker: "user",
      text: rawAnswer,
      rawTranscript: rawAnswer,
      detailedAnswer: detailed,
      kind: "CHARACTER_DIALOGUE",
    });

    setUserInterimSpeech("");
    setTypedValue("");

    // Trigger next tailored question prefetch in background immediately!
    if (qNum === 2) {
      prefetchTailoredSlot(4);
    } else if (qNum === 4) {
      prefetchTailoredSlot(6);
    } else if (qNum === 6) {
      prefetchTailoredSlot(8);
    }

    // Advance to next step
    if (currentStep < 10) {
      executeStep(currentStep + 1);
    } else {
      executeStep(11); // Farewell
    }
  }, [caption, currentStep, executeStep, onTurn, prefetchTailoredSlot, project, stopListening, typedValue, userInterimSpeech]);

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center justify-end p-4 pb-6 pointer-events-none">
      {/* Live Captions */}
      {caption && (
        <div className="mb-4 max-w-2xl rounded-2xl bg-black/75 px-5 py-3.5 text-center backdrop-blur-md border border-white/10 shadow-2xl transition-all pointer-events-auto">
          {captionSpeaker && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 block mb-1">
              {captionSpeaker === "judge1"
                ? "Female Judge (Lead Evaluator)"
                : captionSpeaker === "judge2"
                ? "Male Judge (Technical Evaluator)"
                : "You (Speaking)"}
            </span>
          )}
          <p className="text-sm sm:text-base font-medium text-white/95 leading-relaxed">{caption}</p>
        </div>
      )}

      {/* Presentation Timer during Q1 */}
      {presentationEndsAt && status === "listening" && (
        <div className="mb-3 pointer-events-auto">
          <PresentationTimer endsAt={presentationEndsAt} onExpire={() => {}} />
        </div>
      )}

      {/* Input controls when listening */}
      {status === "listening" && (
        <div className="w-full max-w-xl flex flex-col items-center gap-2 pointer-events-auto">
          {micUnavailable && (
            <input
              type="text"
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitAnswer()}
              placeholder="Type your response to the judges..."
              className="w-full rounded-xl bg-black/80 border border-white/20 px-4 py-3 text-sm text-white placeholder-neutral-400 focus:outline-none focus:border-sky-400 shadow-xl"
            />
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={submitAnswer}
              className="px-6 py-2.5 rounded-full bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-sky-500/25 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              <span>Submit Answer</span>
              <span className="text-xs opacity-75">&rarr;</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
