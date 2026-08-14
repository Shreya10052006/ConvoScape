"use client";

/**
 * TranscriptOverlay.tsx
 * ---------------------------------------------------------------------------
 * A caption, not a chat log. Shows only the most recent character line, the
 * way film subtitles work — present while relevant, gone once it isn't. The
 * brief explicitly rules out a "huge chat window" or "traditional chatbot
 * bubbles covering the scene", so there is deliberately no scrollback here;
 * the full transcript exists in state for the report, just not on screen.
 */

import { useEffect, useState } from "react";
import type { Speaker } from "@/lib/session/sessionTypes";

const SPEAKER_LABEL: Record<Speaker, string> = {
  rahul: "RAHUL",
  judge1: "JUDGE 1",
  judge2: "JUDGE 2",
  user: "YOU",
  // Present for exhaustiveness only — system messages never reach this caption
  // surface, they render through the separate SYSTEM_MESSAGE overlay.
  system: "",
};

interface Props {
  speaker: Speaker | null;
  text: string;
}

export default function TranscriptOverlay({ speaker, text }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!text) {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, [text]);

  if (!visible || !speaker || speaker === "user") return null;

  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[400] w-[min(640px,88vw)] -translate-x-1/2 text-center">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-neutral-400">
        {SPEAKER_LABEL[speaker]}
      </p>
      <p className="text-balance text-lg font-light leading-snug text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
        {text}
      </p>
    </div>
  );
}
