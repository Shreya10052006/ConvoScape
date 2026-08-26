"use client";

/**
 * CameraAnalysis.tsx
 * ---------------------------------------------------------------------------
 * Local browser-only camera self-view and lightweight 4 Hz sampling loop.
 *
 * PRIVACY:
 * No video, frames, or pictures are ever transmitted.
 * MediaPipe Face Landmarker runs locally via WASM.
 * Only mathematical aggregate metrics are collected.
 */

import { useEffect, useRef, useState } from "react";
import { detectFace, type FaceSample } from "@/lib/vision/faceLandmarks";

const CAMERA_SAMPLE_INTERVAL_MS = 250; // 4 Hz sampling rate

interface Props {
  stream: MediaStream;
  onSample: (s: FaceSample) => void;
  recording?: boolean;
}

export default function CameraAnalysis({ stream, onSample, recording = false }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [modelUnavailable, setModelUnavailable] = useState(false);
  const [faceVisible, setFaceVisible] = useState(true);

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
    let consecutiveErrors = 0;

    const sampleLoop = async () => {
      if (cancelled) return;
      try {
        const sample = await detectFace(video, performance.now());
        if (cancelled) return;

        if (sample) {
          onSample(sample);
          setFaceVisible(sample.present);
          consecutiveErrors = 0;
        } else {
          consecutiveErrors++;
          if (consecutiveErrors > 6) {
            setModelUnavailable(true);
            return;
          }
        }
      } catch (err) {
        console.warn("[CameraAnalysis] Local frame sample error:", err);
      }

      if (!cancelled) {
        window.setTimeout(sampleLoop, CAMERA_SAMPLE_INTERVAL_MS);
      }
    };

    sampleLoop();
    return () => {
      cancelled = true;
    };
  }, [ready, onSample]);

  return (
    <div className="fixed bottom-6 right-6 z-[600] overflow-hidden rounded-xl border border-white/20 bg-neutral-950 shadow-2xl backdrop-blur-md">
      <video
        ref={videoRef}
        muted
        playsInline
        className="h-28 w-36 -scale-x-100 object-cover opacity-90 rounded-t-xl"
      />
      <div className="flex items-center justify-between gap-2 bg-black/80 px-2.5 py-1 text-[10px] font-mono border-t border-white/10">
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${
              modelUnavailable
                ? "bg-neutral-500"
                : faceVisible
                ? "bg-emerald-400 animate-pulse"
                : "bg-amber-400"
            }`}
          />
          <span className="text-neutral-300">
            {modelUnavailable
              ? "Analysis paused"
              : faceVisible
              ? "Camera analysis active"
              : "Face not detected"}
          </span>
        </div>
        {recording && (
          <span className="rounded bg-red-500/20 px-1 py-0.2 text-[9px] text-red-400 border border-red-500/30 uppercase">
            REC
          </span>
        )}
      </div>
    </div>
  );
}
