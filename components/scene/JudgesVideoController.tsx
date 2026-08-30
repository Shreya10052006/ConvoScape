"use client";

import React, { useEffect, useRef, useState } from "react";
import { JUDGES_VIDEO_ASSETS } from "@/lib/scene/sceneConfig";

export type JudgesVideoState = "ARRIVAL" | "SPEAKING" | "LISTENING" | "IDLE" | "LEAVING";

interface Props {
  state: JudgesVideoState;
  speakingVideoUrl?: string | null;
  onSpeakingEnded?: () => void;
  onSpeakingError?: (err?: unknown) => void;
  onArrivalEnded?: () => void;
  onLeavingEnded?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function JudgesVideoController({
  state,
  speakingVideoUrl = null,
  onSpeakingEnded,
  onSpeakingError,
  onArrivalEnded,
  onLeavingEnded,
  className = "",
  style = {},
}: Props) {
  const listeningVideoRef = useRef<HTMLVideoElement | null>(null);
  const arrivalVideoRef = useRef<HTMLVideoElement | null>(null);
  const speakingVideoRef = useRef<HTMLVideoElement | null>(null);
  const leavingVideoRef = useRef<HTMLVideoElement | null>(null);

  const [speakingActive, setSpeakingActive] = useState(false);
  const isArrival = state === "ARRIVAL";
  const isLeaving = state === "LEAVING";

  // 1. Ensure base judges listening video plays continuously in the background (muted)
  useEffect(() => {
    const el = listeningVideoRef.current;
    if (el) {
      el.muted = true;
      el.play().catch(() => {});
    }
  }, []);

  // 2. Handle Judge Arrival video playback
  useEffect(() => {
    const el = arrivalVideoRef.current;
    if (!el) return;

    if (isArrival) {
      el.currentTime = 0;
      el.muted = true;
      const p = el.play();
      if (p !== undefined) {
        p.catch((err) => {
          console.warn("[JudgesVideoController] Arrival play error:", err);
          // Fallback if video fails to play
          onArrivalEnded?.();
        });
      }
    } else {
      el.pause();
    }
  }, [isArrival, onArrivalEnded]);

  // 3. Handle Judge Leaving video playback
  useEffect(() => {
    const el = leavingVideoRef.current;
    if (!el) return;

    if (isLeaving) {
      el.currentTime = 0;
      el.muted = true;
      const p = el.play();
      if (p !== undefined) {
        p.catch((err) => {
          console.warn("[JudgesVideoController] Leaving play error (likely not uploaded yet, fallback):", err);
          onLeavingEnded?.();
        });
      }
    } else {
      el.pause();
    }
  }, [isLeaving, onLeavingEnded]);

  // 4. Handle Speaking video playback (live lip-sync with audio)
  useEffect(() => {
    const el = speakingVideoRef.current;
    if (!el) return;

    if (state === "SPEAKING" && speakingVideoUrl) {
      if (el.src !== speakingVideoUrl && !el.src.endsWith(speakingVideoUrl)) {
        el.src = speakingVideoUrl;
        el.load();
      }
      el.currentTime = 0;
      el.muted = false;
      el.volume = 1.0;

      const p = el.play();
      if (p !== undefined) {
        p.then(() => {
          setSpeakingActive(true);
        }).catch((err) => {
          console.warn("[JudgesVideoController] Unmuted speaking play blocked, retrying muted:", err);
          el.muted = true;
          el.play().then(() => setSpeakingActive(true)).catch(() => {
            setSpeakingActive(false);
            onSpeakingError?.(err);
          });
        });
      }
    } else {
      setSpeakingActive(false);
      el.pause();
    }
  }, [state, speakingVideoUrl, onSpeakingError]);

  return (
    <div
      className={`fixed inset-0 z-10 h-full w-full overflow-hidden bg-black ${className}`}
      style={style}
    >
      {/* Layer 1: Base continuous looping judge listening video (zIndex: 1) */}
      <video
        ref={listeningVideoRef}
        src={JUDGES_VIDEO_ASSETS.listening}
        autoPlay
        playsInline
        muted
        loop
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover z-[1]"
      />

      {/* Layer 2: Judge Arrival approach video (zIndex: 2) */}
      <video
        ref={arrivalVideoRef}
        src={JUDGES_VIDEO_ASSETS.arrival}
        playsInline
        muted
        preload="auto"
        onEnded={() => {
          if (isArrival) {
            console.log("[JudgesVideoController] Arrival video ended.");
            onArrivalEnded?.();
          }
        }}
        onError={() => {
          if (isArrival) {
            console.warn("[JudgesVideoController] Arrival video error, continuing.");
            onArrivalEnded?.();
          }
        }}
        className={`absolute inset-0 h-full w-full object-cover z-[2] transition-opacity duration-300 ${
          isArrival ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Layer 3: Active Judge Speaking Video with audio (zIndex: 3) */}
      <video
        ref={speakingVideoRef}
        playsInline
        preload="auto"
        onEnded={() => {
          console.log("[JudgesVideoController] Speaking video ended.");
          setSpeakingActive(false);
          onSpeakingEnded?.();
        }}
        onError={(e) => {
          console.error("[JudgesVideoController] Speaking video error:", e.currentTarget.error);
          setSpeakingActive(false);
          onSpeakingError?.(e.currentTarget.error);
        }}
        className={`absolute inset-0 h-full w-full object-cover z-[3] transition-opacity duration-200 ${
          state === "SPEAKING" && speakingActive ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Layer 4: Judge Leaving Video (zIndex: 4) */}
      <video
        ref={leavingVideoRef}
        src={JUDGES_VIDEO_ASSETS.leaving}
        playsInline
        muted
        preload="auto"
        onEnded={() => {
          if (isLeaving) {
            console.log("[JudgesVideoController] Leaving video ended.");
            onLeavingEnded?.();
          }
        }}
        onError={() => {
          if (isLeaving) {
            console.log("[JudgesVideoController] Leaving video not found or errored, transitioning to report immediately.");
            onLeavingEnded?.();
          }
        }}
        className={`absolute inset-0 h-full w-full object-cover z-[4] transition-opacity duration-300 ${
          isLeaving ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
    </div>
  );
}
