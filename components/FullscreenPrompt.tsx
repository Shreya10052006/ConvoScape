"use client";

/**
 * FullscreenPrompt.tsx
 * ---------------------------------------------------------------------------
 * Offers fullscreen before the judging phase, where immersion matters most.
 *
 * Never forced. requestFullscreen() must be called from a user gesture or the
 * browser rejects it, and some environments (iOS Safari on iPhone, embedded
 * webviews) don't support it on arbitrary elements at all. So the failure path
 * is silent dismissal rather than an error — the session is fully playable
 * windowed, and nagging about a browser limitation the user can't fix would
 * just be noise.
 */

import { useCallback, useEffect, useState } from "react";

export function isFullscreenSupported(): boolean {
  return typeof document !== "undefined" && !!document.documentElement.requestFullscreen;
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const enter = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
      return true;
    } catch {
      return false;
    }
  }, []);

  const exit = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* nothing useful to do */
    }
  }, []);

  return { isFullscreen, enter, exit };
}

interface Props {
  onDismiss: () => void;
}

export default function FullscreenPrompt({ onDismiss }: Props) {
  const { enter } = useFullscreen();

  if (!isFullscreenSupported()) {
    // Nothing to offer — get out of the way immediately rather than showing a
    // button that can't work.
    onDismiss();
    return null;
  }

  return (
    <div className="fixed inset-0 z-[900] flex flex-col items-center justify-center bg-black/85 px-8 text-center backdrop-blur-sm">
      <p className="font-mono text-[11px] uppercase tracking-[0.4em] text-neutral-500">
        The judges are on their way
      </p>
      <p className="mt-4 max-w-md text-2xl font-light leading-snug text-neutral-100">
        Go fullscreen for the evaluation?
      </p>
      <p className="mt-3 max-w-sm text-sm text-neutral-400">
        Filling the screen makes the room feel real, which is most of the point of practising
        this way.
      </p>
      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={async () => {
            await enter();
            onDismiss();
          }}
          className="rounded-full bg-sky-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
        >
          Enter Fullscreen
        </button>
        <button
          onClick={onDismiss}
          className="rounded-full border border-white/25 px-6 py-2.5 text-sm font-medium text-neutral-100 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
        >
          Stay As Is
        </button>
      </div>
    </div>
  );
}
