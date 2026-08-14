"use client";

/**
 * CameraAnalysis.tsx
 * ---------------------------------------------------------------------------
 * Renders the live self-view (the brief requires the webcam be visible to the
 * user, never secretly captured) and runs the sampling loop that feeds
 * BehaviorAggregator. Frames are sampled a few times a second, not every
 * frame — head orientation and blink rate don't change fast enough to justify
 * 30-60 analyses per second, and running MediaPipe that often would compete
 * with the rest of the scene for the main thread for no benefit.
 *
 * Nothing here uploads anything. `onSample` hands the parent one small numeric
 * reading at a time; the parent's aggregator (lib/vision/behaviorMetrics.ts)
 * is the only thing that persists across the session, and only derived
 * numbers ever reach the report endpoint.
 */

import { useEffect, useRef, useState } from "react";
import { detectFace, type FaceSample } from "@/lib/vision/faceLandmarks";

const SAMPLE_INTERVAL_MS = 500;

interface Props {
  stream: MediaStream;
  onSample: (s: FaceSample) => void;
  /** Shows a distinct indicator when a video file is actually being written. */
  recording?: boolean;
}

export default function CameraAnalysis({ stream, onSample, recording = false }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [modelError, setModelError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    video.play().catch(() => {});
    const onLoaded = () => setReady(true);
    video.addEventListener("loadedmetadata", onLoaded);
    return () => video.removeEventListener("loadedmetadata", onLoaded);
  }, [stream]);

  useEffect(() => {
    if (!ready) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let failureCount = 0;

    const tick = async () => {
      if (cancelled) return;
      const sample = await detectFace(video, performance.now());
      if (cancelled) return;

      if (sample) {
        onSample(sample);
        failureCount = 0;
      } else {
        failureCount++;
        // Model failing to load/run repeatedly (blocked CDN, no GPU delegate,
        // etc.) — stop trying and say so quietly rather than retrying forever.
        if (failureCount > 4) {
          setModelError(true);
          return;
        }
      }
      window.setTimeout(tick, SAMPLE_INTERVAL_MS);
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [ready, onSample]);

  return (
    <div className="fixed bottom-6 right-6 z-[600] overflow-hidden rounded-lg border border-white/15 bg-black shadow-2xl">
      <video
        ref={videoRef}
        muted
        playsInline
        className="h-28 w-36 -scale-x-100 object-cover opacity-90"
      />
      <div className="absolute left-1.5 top-1.5 flex items-center gap-1.5 rounded bg-black/50 px-1.5 py-0.5">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        <span className="font-mono text-[9px] uppercase tracking-wider text-white/80">
          {recording ? "recording" : modelError ? "analysis unavailable" : "analyzing"}
        </span>
      </div>
    </div>
  );
}
