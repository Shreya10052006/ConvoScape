"use client";

/**
 * RahulVideoController.tsx
 * ---------------------------------------------------------------------------
 * Full-screen video controller for Rahul with seamless 3-way video transitions:
 *
 *   1. WALKING   : plays /assets/walking.mp4 (Rahul approaches the user's table)
 *   2. SPEAKING  : plays generated Wav2Lip video (/generated/rahul-response-[id].mp4)
 *   3. LISTENING : plays /assets/listening.mp4 ( Rahul in idle pose, looping muted)
 *
 * ROCK-SOLID PRELOAD TRANSITIONS:
 *   - listening.mp4 stays mounted as the base layer.
 *   - walking.mp4 plays during initial approach and triggers onWalkingEnded when finished.
 *   - speakingVideo fades in ONLY after canplay and play() succeed.
 *   - Never shows a black screen or gets stuck.
 */

import React, { useEffect, useRef, useState } from "react";
import { RAHUL_VIDEO_ASSETS, ASSETS } from "@/lib/scene/sceneConfig";

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
  const [videoErrors, setVideoErrors] = useState<Record<string, boolean>>({});
  const [speakingActive, setSpeakingActive] = useState(false);

  const walkingVideoRef = useRef<HTMLVideoElement | null>(null);
  const speakingVideoRef = useRef<HTMLVideoElement | null>(null);
  const listeningVideoRef = useRef<HTMLVideoElement | null>(null);

  const isWalkingState = state === "WALKING";
  const isSpeakingState = state === "SPEAKING";

  // Ensure background listening video is playing muted in background
  useEffect(() => {
    if (listeningVideoRef.current) {
      const el = listeningVideoRef.current;
      el.muted = true;
      el.volume = 0;
      const p = el.play();
      if (p !== undefined) {
        p.catch((err) => {
          console.warn("[RahulVideoController] Listening video background play notice:", err);
        });
      }
    }
  }, []);

  // Handle walking approach video playback
  useEffect(() => {
    if (isWalkingState && walkingVideoRef.current) {
      const el = walkingVideoRef.current;
      el.currentTime = 0;
      el.muted = true;
      el.volume = 0;
      const p = el.play();
      if (p !== undefined) {
        p.catch((err) => {
          console.warn("[RahulVideoController] Walking video play notice:", err);
        });
      }
    }
  }, [isWalkingState]);

  // When speakingVideoUrl changes, reset active flag until canplay confirms
  useEffect(() => {
    if (!speakingVideoUrl || !isSpeakingState) {
      setSpeakingActive(false);
    }
  }, [speakingVideoUrl, isSpeakingState]);

  const handleSpeakingCanPlay = async () => {
    const vid = speakingVideoRef.current;
    if (!vid || !isSpeakingState || !speakingVideoUrl) return;

    console.log("[RahulVideoController] Speaking Video Metadata Loaded & Ready:");
    console.log(`  URL         : ${speakingVideoUrl}`);
    console.log(`  readyState  : ${vid.readyState}`);
    console.log(`  networkState : ${vid.networkState}`);
    console.log(`  duration    : ${vid.duration.toFixed(2)}s`);
    console.log(`  resolution  : ${vid.videoWidth}x${vid.videoHeight}`);

    try {
      vid.currentTime = 0;
      vid.muted = false;
      vid.volume = 1.0;
      await vid.play();
      console.log("[RahulVideoController] Speaking video play() succeeded! Crossfading in.");
      setSpeakingActive(true);
    } catch (err) {
      console.error("[RahulVideoController] speakingVideo.play() rejected:", err);
      console.error("  Video Error State:", vid.error);
      setSpeakingActive(false);
      onSpeakingError?.(err);
    }
  };

  const handleSpeakingError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const vid = e.currentTarget;
    console.error("[RahulVideoController] Speaking video element load error:");
    console.error(`  URL         : ${speakingVideoUrl}`);
    console.error(`  readyState  : ${vid?.readyState}`);
    console.error(`  networkState : ${vid?.networkState}`);
    console.error(`  error       :`, vid?.error);

    setSpeakingActive(false);
    setVideoErrors((prev) => ({ ...prev, speaking: true }));
    onSpeakingError?.(vid?.error);
  };

  const handleListeningError = () => {
    console.error("[RahulVideoController] Failed to load background listening.mp4 asset");
    setVideoErrors((prev) => ({ ...prev, listening: true }));
  };

  // Visibility logic:
  // - Show Walking video when state === WALKING and walking video has not errored
  // - Show Speaking video when state === SPEAKING, video is active & ready
  // - Show Listening video by default whenever walking or speaking is inactive
  const showWalking = isWalkingState && !videoErrors["walking"];
  const showSpeaking = isSpeakingState && speakingActive && speakingVideoUrl && !videoErrors["speaking"];

  return (
    <div
      className={`fixed inset-0 z-10 h-full w-full overflow-hidden bg-black ${className}`}
      style={style}
    >
      {/* 1. Permanent Listening Video Layer (Base layer, visible by default) */}
      <video
        ref={listeningVideoRef}
        src={RAHUL_VIDEO_ASSETS.listening}
        muted
        playsInline
        loop
        preload="auto"
        onError={handleListeningError}
        className="absolute inset-0 h-full w-full object-cover pointer-events-none"
        style={{
          opacity: showWalking || showSpeaking ? 0 : 1,
          zIndex: showWalking || showSpeaking ? 1 : 5,
          transition: "opacity 300ms ease-in-out",
        }}
      />

      {/* 2. Walking Approach Video Layer (/assets/walking.mp4) */}
      <video
        ref={walkingVideoRef}
        src={RAHUL_VIDEO_ASSETS.walking}
        muted
        playsInline
        preload="auto"
        onEnded={() => {
          console.log("[RahulVideoController] Walking video ended. Rahul arrived at table.");
          onWalkingEnded?.();
        }}
        onError={() => {
          console.warn("[RahulVideoController] Walking video asset error, falling back to listening.");
          setVideoErrors((prev) => ({ ...prev, walking: true }));
          onWalkingEnded?.();
        }}
        className="absolute inset-0 h-full w-full object-cover pointer-events-none"
        style={{
          opacity: showWalking ? 1 : 0,
          zIndex: showWalking ? 10 : 1,
          transition: "opacity 300ms ease-in-out",
        }}
      />

      {/* 3. Generated Wav2Lip Speaking Video Layer (/generated/rahul-response-[id].mp4) */}
      {speakingVideoUrl && (
        <video
          ref={speakingVideoRef}
          key={speakingVideoUrl}
          src={speakingVideoUrl}
          playsInline
          preload="auto"
          onCanPlay={handleSpeakingCanPlay}
          onEnded={() => {
            console.log("[RahulVideoController] Generated speaking video ended. Returning to listening.");
            setSpeakingActive(false);
            onSpeakingEnded?.();
          }}
          onError={handleSpeakingError}
          className="absolute inset-0 h-full w-full object-cover pointer-events-none"
          style={{
            opacity: showSpeaking ? 1 : 0,
            zIndex: showSpeaking ? 15 : 1,
            transition: "opacity 300ms ease-in-out",
          }}
        />
      )}

      {/* Fallback Static Image if listening video fails */}
      {videoErrors["listening"] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ASSETS.rahulNear.src}
          alt="Rahul"
          className="absolute inset-0 h-full w-full object-cover pointer-events-none z-0"
        />
      )}
    </div>
  );
}
