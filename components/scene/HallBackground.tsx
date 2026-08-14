"use client";

/**
 * HallBackground.tsx
 * ---------------------------------------------------------------------------
 * The hall is drawn twice, and this is the part of Phase 1 most likely to be
 * skipped by mistake.
 *
 *   Layer 1 (z=0)   hall.png              — the room, untouched
 *   Layer 2 (z=1k)  characters            — placed by CharacterLayer
 *   Layer 3 (z=9k)  hall-foreground.png   — table edge, laptop, mug, cut out
 *                                            with alpha, drawn OVER everyone
 *
 * Layer 3 is what makes "the table hides his legs" physically true instead of a
 * fudge. Without it the only options are to stop Rahul short of the table (kills
 * the brief) or to crop him arbitrarily (reads as a floating bust). Both are
 * immediately legible as fake.
 *
 * Both layers use identical fit maths so they can never drift apart.
 *
 * The hall is never cropped to fit a layout, never re-composed, never blended.
 * It is scaled to cover and centre-cropped with a bias toward the floor, and
 * that is the only transformation it ever receives.
 */

import { useEffect, useState } from "react";
import { fitHallToViewport, type HallCalibration, type ViewportFit } from "@/lib/scene/perspective";
import { ASSETS } from "@/lib/scene/sceneConfig";

export function useViewportFit(
  calibration: HallCalibration
): ViewportFit & { ready: boolean; portrait: boolean } {
  const [fit, setFit] = useState<ViewportFit>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [ready, setReady] = useState(false);
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const measure = () => {
      setFit(fitHallToViewport(calibration, window.innerWidth, window.innerHeight));
      // The hall is 3:2. On a portrait phone, cover-cropping it would throw away
      // more than half the width — the aisle Rahul walks down disappears and the
      // composition you designed stops existing. Better to ask for a rotation
      // than to silently show a different room.
      setPortrait(window.innerHeight > window.innerWidth * 1.05);
      setReady(true);
    };
    measure();
    window.addEventListener("resize", measure);
    // orientationchange fires before the new dimensions settle on iOS, hence the
    // deferred re-measure.
    const onOrient = () => setTimeout(measure, 250);
    window.addEventListener("orientationchange", onOrient);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", onOrient);
    };
  }, [calibration]);

  return { ...fit, ready, portrait };
}

interface Props {
  calibration: HallCalibration;
  fit: ViewportFit;
  /** Renders a procedural stand-in when hall.png is absent. */
  hallAvailable?: boolean;
}

export default function HallBackground({ calibration, fit, hallAvailable = true }: Props) {
  const style = {
    width: calibration.imageWidth * fit.scale,
    height: calibration.imageHeight * fit.scale,
    transform: `translate3d(${fit.offsetX}px, ${fit.offsetY}px, 0)`,
  } as const;

  return (
    <>
      <div className="absolute left-0 top-0" style={{ ...style, zIndex: 0 }}>
        {hallAvailable ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ASSETS.hall} alt="" className="h-full w-full select-none" draggable={false} />
        ) : (
          <ProceduralHall calibration={calibration} />
        )}
      </div>

      <div className="pointer-events-none absolute left-0 top-0" style={{ ...style, zIndex: 9000 }}>
        {/* Missing foreground plate degrades to nothing rather than a broken
            image icon — the scene still runs, Rahul's legs just show. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ASSETS.hallForeground}
          alt=""
          className="h-full w-full select-none"
          draggable={false}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
    </>
  );
}

/**
 * A grey-box hall drawn from the same calibration constants as everything else.
 * Its only job is to let the walk be judged before the real image exists: if the
 * floor grid and the character agree, the maths is right, and swapping in the
 * real photograph changes nothing structural.
 */
function ProceduralHall({ calibration }: { calibration: HallCalibration }) {
  const { imageWidth: W, imageHeight: H, horizonY, unitScale, vanishX } = calibration;
  const depths = [1, 1.5, 2, 3, 4, 5.5, 7, 9, 12, 16];
  const lanes = [-6, -4, -2.5, -1.2, 0, 1.2, 2.5, 4, 6];

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="air" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#141a24" />
          <stop offset="55%" stopColor="#1d2430" />
          <stop offset="100%" stopColor="#2a2f38" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#air)" />
      <rect y={horizonY} width={W} height={H - horizonY} fill="#2f3540" />
      {lanes.map((x) => (
        <line
          key={`l${x}`}
          x1={vanishX + (unitScale * x) / 40}
          y1={horizonY + unitScale / 40}
          x2={vanishX + (unitScale * x) / 0.9}
          y2={horizonY + unitScale / 0.9}
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={2}
        />
      ))}
      {depths.map((d) => (
        <line
          key={`d${d}`}
          x1={0}
          y1={horizonY + unitScale / d}
          x2={W}
          y2={horizonY + unitScale / d}
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={2}
        />
      ))}
      <line x1={0} y1={horizonY} x2={W} y2={horizonY} stroke="rgba(120,200,255,0.28)" strokeDasharray="14 10" />
      <text x={24} y={horizonY - 14} fill="rgba(120,200,255,0.6)" fontSize={22} fontFamily="ui-monospace, monospace">
        horizon / eye level
      </text>
    </svg>
  );
}
