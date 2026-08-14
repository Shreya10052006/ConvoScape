"use client";

/**
 * PresentationTimer.tsx
 * ---------------------------------------------------------------------------
 * Visible during the uninterrupted presentation round only. Deliberately small
 * and cornered rather than a dashboard panel — the user should feel the clock
 * the way they would in a real room, not be presented with a widget.
 *
 * Expiry is a soft signal. The user is not cut off mid-sentence; the judges
 * don't interrupt. It just turns amber and fires a SYSTEM_MESSAGE, which the
 * parent shows and never speaks.
 */

import { useEffect, useState } from "react";

interface Props {
  endsAt: number;
  onExpire?: () => void;
}

export default function PresentationTimer({ endsAt, onExpire }: Props) {
  const [remaining, setRemaining] = useState(() => Math.max(0, endsAt - Date.now()));
  const [fired, setFired] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      const left = Math.max(0, endsAt - Date.now());
      setRemaining(left);
      if (left === 0 && !fired) {
        setFired(true);
        onExpire?.();
      }
    }, 250);
    return () => clearInterval(id);
  }, [endsAt, fired, onExpire]);

  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const expired = remaining === 0;

  return (
    <div
      role="timer"
      aria-live="off"
      className="pointer-events-none fixed left-6 top-6 z-[600] flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-1.5 backdrop-blur-sm"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${expired ? "bg-amber-400" : "bg-emerald-400 animate-pulse"}`} />
      <span className={`font-mono text-xs tabular-nums ${expired ? "text-amber-300" : "text-neutral-200"}`}>
        {minutes}:{String(seconds).padStart(2, "0")}
      </span>
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500">
        {expired ? "wrap up" : "presenting"}
      </span>
    </div>
  );
}
