"use client";

import React, { useEffect, useRef, useState } from "react";
import { RAHUL_VIDEO_ASSETS } from "@/lib/scene/sceneConfig";

export type RahulVideoState = "WALKING" | "SPEAKING" | "LISTENING" | "IDLE" | "LEAVING";

interface Props {
  state: RahulVideoState;
  speakingVideoUrl?: string | null;
  onSpeakingEnded?: () => void;
  onSpeakingError?: (err?: unknown) => void;
  onWalkingEnded?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function RahulVideoController({
  state,
  speakingVideoUrl = null,
  onSpeakingEnded,
  onSpeakingError,
  onWalkingEnded,
  className = "",
  style = {},
}: Props) {
  const listeningVideoRef = useRef<HTMLVideoElement | null>(null);
  const walkingVideoRef = useRef<HTMLVideoElement | null>(null);
  const speakingVideoRef = useRef<HTMLVideoElement | null>(null);

  const [speakingActive, setSpeakingActive] = useState(false);
  const isWalking = state === "WALKING";

  // Base listening video plays ONLY when Rahul is in the LISTENING state
  useEffect(() => {
    const el = listeningVideoRef.current;
    if (!el) return;

    if (state === "LISTENING") {
      el.muted = true;
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [state]);

  // Handle Walking video playback & preload opening turn
  useEffect(() => {
    const el = walkingVideoRef.current;
    if (!el) return;

    if (isWalking) {
      el.muted = true;
      el.defaultMuted = true;
      el.playsInline = true;

      // Preload opening video while walking so transition into speaking is instant
      if (speakingVideoRef.current) {
        speakingVideoRef.current.src = "/generated/rahul-response-turn1-opening.mp4";
        speakingVideoRef.current.preload = "auto";
        speakingVideoRef.current.load();
      }

      const startPlay = () => {
        el.muted = true;
        const playPromise = el.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("[RahulVideoController] Walking approach video started playing.");
            })
            .catch((err) => {
              console.warn("[RahulVideoController] Autoplay deferred, will retry on canplay:", err);
            });
        }
      };

      if (el.readyState >= 2) {
        startPlay();
      } else {
        el.addEventListener("canplay", startPlay, { once: true });
        el.addEventListener("loadeddata", startPlay, { once: true });
        startPlay();
      }
    } else {
      el.pause();
    }
  }, [isWalking]);

  // Handle Speaking video playback (live lip-sync with sound)
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
          console.warn("[RahulVideoController] Unmuted speaking play blocked, retrying muted:", err);
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
      {/* 1. Base Layer: Looping listening video — ONLY active & visible when Rahul is listening */}
      <video
        ref={listeningVideoRef}
        src={RAHUL_VIDEO_ASSETS.listening}
        playsInline
        muted
        loop
        preload="auto"
        className={`absolute inset-0 h-full w-full object-cover z-[1] transition-opacity duration-300 ${
          state === "LISTENING" ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* 2. Walking Layer: Rahul walking approach from hall door to table */}
      <video
        ref={walkingVideoRef}
        src={RAHUL_VIDEO_ASSETS.walking}
        autoPlay
        playsInline
        muted
        preload="auto"
        onEnded={() => {
          if (isWalking) {
            console.log("[RahulVideoController] Walking video ended -> Transitioning to opening line.");
            onWalkingEnded?.();
          }
        }}
        onTimeUpdate={(e) => {
          if (isWalking) {
            const v = e.currentTarget;
            if (v.duration > 0 && v.currentTime >= v.duration - 0.2) {
              console.log("[RahulVideoController] Walking video near end -> Pre-triggering transition.");
              onWalkingEnded?.();
            }
          }
        }}
        className={`absolute inset-0 h-full w-full object-cover z-[2] transition-opacity duration-300 ${
          isWalking ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* 3. Speaking Layer: Live dynamic lip-sync video with audio (zIndex: 3) */}
      <video
        ref={speakingVideoRef}
        playsInline
        preload="auto"
        onEnded={() => {
          console.log("[RahulVideoController] Speaking video ended.");
          setSpeakingActive(false);
          onSpeakingEnded?.();
        }}
        onError={(e) => {
          console.error("[RahulVideoController] Speaking video error:", e.currentTarget.error);
          setSpeakingActive(false);
          onSpeakingError?.(e.currentTarget.error);
        }}
        className={`absolute inset-0 h-full w-full object-cover z-[3] transition-opacity duration-200 ${
          state === "SPEAKING" && speakingActive ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
    </div>
  );
}
