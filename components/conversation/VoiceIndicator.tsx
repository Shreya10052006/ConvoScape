"use client";

/**
 * VoiceIndicator.tsx
 * ---------------------------------------------------------------------------
 * The brief is explicit: minimal controls, no big chat window, no chatbot
 * bubbles covering the scene. This is a single small pill, bottom-centre,
 * that tells the user whose turn it is and nothing else.
 */

import type { DialoguePhase } from "@/lib/session/dialogueMachine";

const LABEL: Record<DialoguePhase, string> = {
  IDLE: "",
  CHARACTER_SPEAKING: "Listening to them",
  AWAITING_USER: "Your turn — speak now",
  USER_SPEAKING: "Listening…",
  THINKING: "…",
};

export default function VoiceIndicator({ phase }: { phase: DialoguePhase }) {
  if (phase === "IDLE") return null;
  const pulsing = phase === "USER_SPEAKING" || phase === "AWAITING_USER";

  return (
    <div className="pointer-events-none fixed bottom-8 left-1/2 z-[500] -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full bg-black/55 px-4 py-2 backdrop-blur-sm">
        <span
          className={`h-2 w-2 rounded-full ${
            phase === "USER_SPEAKING"
              ? "bg-sky-400"
              : phase === "AWAITING_USER"
                ? "bg-emerald-400"
                : "bg-neutral-400"
          } ${pulsing ? "animate-pulse" : ""}`}
        />
        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-neutral-200">
          {LABEL[phase]}
        </span>
      </div>
    </div>
  );
}
