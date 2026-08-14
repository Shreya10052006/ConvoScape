"use client";

/**
 * SceneController.tsx
 * ---------------------------------------------------------------------------
 * Renders bodies for a given scene state. As of the full-MVP build, scene
 * state is CONTROLLED from outside (app/page.tsx owns the reducer) rather than
 * owned here — the orchestrator needs to fire DIALOGUE_COMPLETE when the AI
 * conversation ends, and REPORT_READY when the report finishes generating,
 * neither of which this component can know about on its own. That's the
 * boundary from the Phase 1 docstring, just drawn one level higher: this file
 * still knows nothing about Gemini, the microphone, or the camera. It only
 * knows how to turn a SceneState into pixels, plus the handful of
 * animation-driven transitions (a walk finishing, a timer elapsing) that are
 * purely visual and have no business living in the orchestrator.
 */

import { useEffect, useRef } from "react";
import HallBackground, { useViewportFit } from "./HallBackground";
import CharacterLayer from "./CharacterLayer";
import type { SceneEvent, SceneState } from "@/lib/session/sceneMachine";
import {
  ARRIVAL_SETTLE_SECONDS,
  ASSETS,
  HALL_CALIBRATION,
  IS_CALIBRATED,
  JUDGE_1_POS,
  JUDGE_2_POS,
  JUDGE_ENTRY_DEPTH_OFFSET,
  JUDGE_ENTRY_FADE_MS,
  JUDGE_SETTLE_MS,
  RAHUL_CONVERSATION_POS,
  RAHUL_EXIT_PATH,
  RAHUL_PATH,
  RAHUL_WALK_TUNING,
} from "@/lib/scene/sceneConfig";

interface Props {
  scene: SceneState;
  send: (e: SceneEvent) => void;
  /** hall.png + hall-foreground.png present. */
  hallAvailable?: boolean;
  /** Character PNGs present. Silhouettes stand in until they are. */
  charactersAvailable?: boolean;
}

export default function SceneController({
  scene,
  send,
  hallAvailable = true,
  charactersAvailable = false,
}: Props) {
  const fit = useViewportFit(HALL_CALIBRATION);
  const timers = useRef<number[]>([]);

  // Timed beats. Anything driven by an animation finishing reports through
  // onArrive instead, so a slow device never desynchronises the scene.
  useEffect(() => {
    const after = (ms: number, e: SceneEvent) => {
      const id = window.setTimeout(() => send(e), ms);
      timers.current.push(id);
    };

    if (scene === "HALL_IDLE") after(ARRIVAL_SETTLE_SECONDS * 1000, { type: "SETTLE_COMPLETE" });
    // Rahul stands, looks over, then commits to walking. The pause is what sells
    // "he noticed you" rather than "he was dispatched".
    if (scene === "RAHUL_FAR") after(1400, { type: "SETTLE_COMPLETE" });
    if (scene === "RAHUL_NEAR") after(700, { type: "NEAR_SETTLED" });
    if (scene === "JUDGE_ENTRY") after(JUDGE_SETTLE_MS + 600, { type: "JUDGES_SEATED" });

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [scene, send]);

  if (!fit.ready) return <div className="fixed inset-0 bg-black" />;

  if (fit.portrait) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-black px-10 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.4em] text-neutral-600">ConvoScape</p>
        <p className="max-w-xs text-xl font-light leading-snug text-neutral-200">
          Turn your phone sideways to step into the hall.
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <HallBackground calibration={HALL_CALIBRATION} fit={fit} hallAvailable={hallAvailable} />

      {scene === "RAHUL_FAR" && (
        <CharacterLayer
          mode={{ kind: "static", position: RAHUL_PATH[0], asset: ASSETS.rahulFar }}
          calibration={HALL_CALIBRATION}
          fit={fit}
          idleIntensity={0.6}
          assetAvailable={charactersAvailable}
          label="RAHUL"
        />
      )}

      {scene === "RAHUL_WALKING" && (
        <CharacterLayer
          mode={{ kind: "walk", path: RAHUL_PATH, asset: ASSETS.rahulWalk, tuning: RAHUL_WALK_TUNING }}
          calibration={HALL_CALIBRATION}
          fit={fit}
          idleIntensity={0.35}
          assetAvailable={charactersAvailable}
          label="RAHUL"
          onArrive={() => send({ type: "WALK_COMPLETE" })}
        />
      )}

      {scene === "RAHUL_NEAR" && (
        <CharacterLayer
          mode={{ kind: "static", position: RAHUL_CONVERSATION_POS, asset: ASSETS.rahulNear }}
          calibration={HALL_CALIBRATION}
          fit={fit}
          idleIntensity={0.8}
          assetAvailable={charactersAvailable}
          label="RAHUL"
        />
      )}

      {scene === "RAHUL_CONVERSATION" && (
        <CharacterLayer
          mode={{ kind: "static", position: RAHUL_CONVERSATION_POS, asset: ASSETS.rahulConversation }}
          calibration={HALL_CALIBRATION}
          fit={fit}
          idleIntensity={1}
          assetAvailable={charactersAvailable}
          label="RAHUL"
        />
      )}

      {scene === "RAHUL_EXIT" && (
        <CharacterLayer
          mode={{ kind: "walk", path: RAHUL_EXIT_PATH, asset: ASSETS.rahulWalk, tuning: RAHUL_WALK_TUNING }}
          calibration={HALL_CALIBRATION}
          fit={fit}
          idleIntensity={0.35}
          assetAvailable={charactersAvailable}
          label="RAHUL"
          onArrive={() => send({ type: "EXIT_COMPLETE" })}
        />
      )}

      {(scene === "JUDGE_ENTRY" || scene === "JUDGE_CONVERSATION") && (
        <>
          <CharacterLayer
            mode={{ kind: "static", position: JUDGE_1_POS, asset: ASSETS.judge1 }}
            calibration={HALL_CALIBRATION}
            fit={fit}
            idleIntensity={0.75}
            allowFlip={false}
            fadeInMs={JUDGE_ENTRY_FADE_MS}
            settleFromDepth={JUDGE_ENTRY_DEPTH_OFFSET}
            settleMs={JUDGE_SETTLE_MS}
            assetAvailable={charactersAvailable}
            label="JUDGE 1"
          />
          <CharacterLayer
            mode={{ kind: "static", position: JUDGE_2_POS, asset: ASSETS.judge2 }}
            calibration={HALL_CALIBRATION}
            fit={fit}
            idleIntensity={0.75}
            allowFlip={false}
            fadeInMs={JUDGE_ENTRY_FADE_MS + 220}
            settleFromDepth={JUDGE_ENTRY_DEPTH_OFFSET}
            settleMs={JUDGE_SETTLE_MS + 220}
            assetAvailable={charactersAvailable}
            label="JUDGE 2"
          />
        </>
      )}

      <SceneDebugBar scene={scene} send={send} calibrated={IS_CALIBRATED} />
    </div>
  );
}

/**
 * Development-only. Lets you jump between beats while judging the blocking, and
 * says loudly when the calibration is still the placeholder. Strip in Phase 9.
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
    ["exit done", { type: "EXIT_COMPLETE" }],
    ["judges", { type: "JUDGES_SEATED" }],
  ];
  return (
    <div className="absolute bottom-3 left-3 z-[10000] flex flex-wrap items-center gap-2 rounded bg-black/70 px-3 py-2 font-mono text-[11px] text-white/80 backdrop-blur">
      <span className="text-white">{scene}</span>
      {!calibrated && <span className="text-amber-400">uncalibrated hall — run /calibrate</span>}
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
