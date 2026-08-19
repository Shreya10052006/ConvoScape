"use client";

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
    <div className="fixed inset-0 z-[900] flex flex-col items-center justify-center bg-black/90 px-8 text-center backdrop-blur-md">
      <p className="font-mono text-[11px] uppercase tracking-[0.4em] text-neutral-400">
        Device Setup Before Entering
      </p>
      <h2 className="mt-4 max-w-lg text-2xl font-light leading-snug text-neutral-100 sm:text-3xl">
        Enable Microphone & Camera for your Pitch
      </h2>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-neutral-400">
        ConvoScape listens to your spoken answers in real time and uses your camera to analyze eye
        contact and presentation posture. Granting permissions now ensures seamless conversation
        with zero interruptions.
      </p>

      {supported && canRecord && (
        <label className="mt-6 flex cursor-pointer items-center gap-2.5 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={record}
            onChange={(e) => setRecord(e.target.checked)}
            className="h-4 w-4 accent-sky-500"
          />
          Also record video for replay in my feedback report
        </label>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <button
          onClick={() => onEnable(record)}
          disabled={!supported}
          className="rounded-full bg-sky-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 shadow-lg shadow-sky-500/20"
        >
          Enable Microphone & Camera
        </button>
        <button
          onClick={onSkip}
          className="rounded-full border border-white/25 px-6 py-2.5 text-sm font-medium text-neutral-100 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
        >
          Microphone Only (No Camera)
        </button>
      </div>
      {!supported && (
        <p className="mt-4 text-xs text-neutral-500">Audio/video input is not supported in this browser.</p>
      )}
    </div>
  );
}
