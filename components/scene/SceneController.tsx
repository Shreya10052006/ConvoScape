"use client";

/**
 * SceneController.tsx
 * ---------------------------------------------------------------------------
 * Renders characters and background video layers for the active scene state.
 * Currently only Rahul is active (walking, speaking, listening).
 */

import React from "react";
import type { SceneEvent, SceneState } from "@/lib/session/sceneMachine";
import { IS_CALIBRATED } from "@/lib/scene/sceneConfig";
import RahulVideoController, { type RahulVideoState } from "./RahulVideoController";

interface Props {
  scene: SceneState;
  send: (e: SceneEvent) => void;
  rahulVideoState?: RahulVideoState;
  rahulSpeakingVideoUrl?: string | null;
  onRahulSpeakingEnded?: () => void;
  onRahulSpeakingError?: () => void;
  onRahulWalkingEnded?: () => void;
  hallAvailable?: boolean;
  charactersAvailable?: boolean;
}

export default function SceneController({
  scene,
  send,
  rahulVideoState = "IDLE",
  rahulSpeakingVideoUrl = null,
  onRahulSpeakingEnded,
  onRahulSpeakingError,
  onRahulWalkingEnded,
}: Props) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* Rahul Video Layer */}
      <RahulVideoController
        state={rahulVideoState}
        speakingVideoUrl={rahulSpeakingVideoUrl}
        onSpeakingEnded={onRahulSpeakingEnded}
        onSpeakingError={onRahulSpeakingError}
        onWalkingEnded={onRahulWalkingEnded}
      />

      <SceneDebugBar scene={scene} send={send} calibrated={IS_CALIBRATED} />
    </div>
  );
}

/**
 * Development-only scene debug helper.
 */
function SceneDebugBar({
  scene,
  send,
  calibrated,
}: {
  scene: SceneState;
  send: (e: SceneEvent) => void;
  calibrated: boolean;
}) {
  if (process.env.NODE_ENV === "production") return null;
  const beats: Array<[string, SceneEvent]> = [
    ["settle", { type: "SETTLE_COMPLETE" }],
    ["walk done", { type: "WALK_COMPLETE" }],
    ["near", { type: "NEAR_SETTLED" }],
    ["talk done", { type: "DIALOGUE_COMPLETE" }],
  ];
  return (
    <div className="absolute bottom-3 left-3 z-[10000] flex flex-wrap items-center gap-2 rounded bg-black/70 px-3 py-2 font-mono text-[11px] text-white/80 backdrop-blur">
      <span className="text-white">{scene}</span>
      {!calibrated && <span className="text-amber-400">uncalibrated hall</span>}
      {beats.map(([label, e]) => (
        <button
          key={label}
          onClick={() => send(e)}
          className="rounded border border-white/20 px-2 py-0.5 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
