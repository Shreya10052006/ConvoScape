"use client";

/**
 * CameraConsent.tsx
 * ---------------------------------------------------------------------------
 * The ONLY place in the app that can lead to a getUserMedia call. Nothing
 * upstream of an explicit tap here may request the camera.
 *
 * Two deliberate design choices:
 *
 * 1. "Continue Without Camera" is styled with equal weight, not as a muted
 *    secondary action. Declining is a legitimate choice that changes what the
 *    report can observe, not a lesser path, and the report explicitly does not
 *    penalise it.
 *
 * 2. Recording is a SEPARATE opt-in nested inside the camera choice. Analysing
 *    head position locally and keeping a video file of someone's face are
 *    materially different asks, and bundling them into one "yes" would be
 *    consent theatre.
 */

import { useState } from "react";
import { isCameraSupported } from "@/lib/vision/cameraManager";
import { isRecordingSupported } from "@/lib/vision/sessionRecorder";

interface Props {
  onEnable: (withRecording: boolean) => void;
  onSkip: () => void;
}

export default function CameraConsent({ onEnable, onSkip }: Props) {
  const supported = isCameraSupported();
  const canRecord = isRecordingSupported();
  const [record, setRecord] = useState(false);

  return (
    <div className="fixed inset-0 z-[900] flex flex-col items-center justify-center bg-black/85 px-8 text-center backdrop-blur-sm">
      <p className="font-mono text-[11px] uppercase tracking-[0.4em] text-neutral-500">Before you begin</p>
      <p className="mt-4 max-w-lg text-2xl font-light leading-snug text-neutral-100">
        Would you like ConvoScape to analyze your presentation behavior using your camera?
      </p>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-neutral-400">
        With the camera on, ConvoScape can also report on eye contact, attention direction and
        visible engagement. Video is processed on your device and never uploaded. Declining
        costs you nothing — the session runs identically and your report still covers everything
        from your speech.
      </p>

      {supported && canRecord && (
        <label className="mt-6 flex cursor-pointer items-center gap-2.5 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={record}
            onChange={(e) => setRecord(e.target.checked)}
            className="h-4 w-4 accent-sky-500"
          />
          Also record my session so I can watch it back afterwards
        </label>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <button
          onClick={() => onEnable(record)}
          disabled={!supported}
          className="rounded-full bg-sky-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
        >
          Enable Camera
        </button>
        <button
          onClick={onSkip}
          className="rounded-full border border-white/25 px-6 py-2.5 text-sm font-medium text-neutral-100 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
        >
          Continue Without Camera
        </button>
      </div>
      {!supported && (
        <p className="mt-4 text-xs text-neutral-500">Camera isn&apos;t available in this browser.</p>
      )}
    </div>
  );
}
