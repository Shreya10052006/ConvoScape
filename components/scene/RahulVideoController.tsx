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

  // Base listening video plays whenever Rahul is at the table (NOT walking)
  useEffect(() => {
    const el = listeningVideoRef.current;
    if (!el) return;

    if (!isWalking) {
      el.muted = true;
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [isWalking]);

  // Handle Walking video playback
  useEffect(() => {
    const el = walkingVideoRef.current;
    if (!el) return;

    if (isWalking) {
      el.currentTime = 0;
      el.muted = true;
      el.defaultMuted = true;
      el.playsInline = true;

      const startPlay = () => {
        el.muted = true;
        const playPromise = el.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("[RahulVideoController] Walking approach video started playing at 0.0s.");
            })
            .catch((err) => {
              console.warn("[RahulVideoController] Walking play error (immediate):", err);
              // Retry after a short delay — browser may need a tick after fullscreen transition
              setTimeout(() => {
                el.muted = true;
                el.play()
                  .then(() => console.log("[RahulVideoController] Walking video started on retry."))
                  .catch((e2) => console.warn("[RahulVideoController] Walking play retry also failed:", e2));
              }, 150);
            });
        }
      };

      if (el.readyState >= 2) {
        // Already loaded — play immediately
        startPlay();
      } else {
        // Wait for canplay / loadeddata, but also attempt immediate call
        // (some browsers need the src request in-flight to register intent)
        el.addEventListener("canplay", startPlay, { once: true });
        el.addEventListener("loadeddata", startPlay, { once: true });
        // Attempt immediate — will retry via event if it fails
        el.muted = true;
        el.play().catch(() => {
          // Event listeners will handle it once data is ready
        });
      }

      // Additional safety: force-play after 300 ms in case events fired before
      // this effect ran (e.g. video was already in cache)
      const safetyTimer = setTimeout(() => {
        if (el.paused && walkingVideoRef.current === el) {
          el.muted = true;
          el.play().catch(() => {});
        }
      }, 300);

      return () => {
        clearTimeout(safetyTimer);
        el.removeEventListener("canplay", startPlay);
        el.removeEventListener("loadeddata", startPlay);
      };
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
      {/* 1. Base Layer: Looping listening video — ALWAYS visible when Rahul is at table listening */}
      <video
        ref={listeningVideoRef}
        src={RAHUL_VIDEO_ASSETS.listening}
        playsInline
        muted
        loop
        preload="auto"
        className={`absolute inset-0 h-full w-full object-cover z-[1] transition-opacity duration-300 ${
          !isWalking ? "opacity-100" : "opacity-0 pointer-events-none"
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
            console.log("[RahulVideoController] Walking video reached 100% end -> Transitioning to opening line.");
            onWalkingEnded?.();
          }
        }}
        className={`absolute inset-0 h-full w-full object-cover z-[2] transition-opacity duration-300 ${
          isWalking ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* 3. Speaking Layer: Live dynamic lip-sync video with audio (zIndex: 3) */}
      <video
        ref={speakingVideoRef}
        src={speakingVideoUrl || undefined}
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
        className={`absolute inset-0 h-full w-full object-cover z-[3] transition-opacity duration-150 ${
          state === "SPEAKING" && speakingActive ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
    </div>
  );
}
