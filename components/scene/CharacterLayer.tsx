"use client";

/**
 * CharacterLayer.tsx
 * ---------------------------------------------------------------------------
 * Renders one character and moves it.
 *
 * ARCHITECTURAL NOTE — a deliberate departure from the brief.
 *
 * The brief lists Framer Motion for the walk. I'm using it for UI transitions
 * (fades, the setup screen, report reveals) but NOT for character movement, for
 * two reasons:
 *
 *   1. Framer Motion animates between declared states. Our motion is the output
 *      of a physics-ish integration with a non-linear projection in the middle.
 *      Expressing that as keyframes means baking the perspective curve into
 *      hardcoded values, which breaks the moment the hall image changes.
 *
 *   2. Any React-state-per-frame approach reconciles the tree 60 times a second.
 *      With a webcam pipeline and a speech recogniser also competing for the main
 *      thread, that is where the frame budget goes.
 *
 * So: one rAF loop writes `transform` directly to a ref'd node. React renders
 * this component roughly once per scene state. Only compositor-friendly
 * properties are touched — translate and scale, never width/height/top/left —
 * so the browser skips layout and paint entirely.
 */

import { useEffect, useRef } from "react";
import {
  project,
  type HallCalibration,
  type ViewportFit,
  type WorldPoint,
} from "@/lib/scene/perspective";
import { WalkPath, idleOffset, DEFAULT_WALK, type WalkTuning } from "@/lib/scene/walkPath";
import type { CharacterAsset, SpriteSheetAsset } from "@/lib/scene/sceneConfig";

type Mode =
  | { kind: "static"; position: WorldPoint; asset: CharacterAsset }
  | { kind: "walk"; path: WorldPoint[]; asset: SpriteSheetAsset; tuning?: WalkTuning };

interface Props {
  mode: Mode;
  calibration: HallCalibration;
  fit: ViewportFit;
  /** How much idle life to add. 0 for a frozen beat, 1 for conversation. */
  idleIntensity?: number;
  /** Mirrors the sprite when he walks toward the user's left. */
  allowFlip?: boolean;
  onArrive?: () => void;
  label?: string;
  /** Set false while the asset is missing to render the labelled silhouette. */
  assetAvailable?: boolean;
  /** Fade up over this many ms on mount. Used for characters that can't walk in. */
  fadeInMs?: number;
  /**
   * Ease in from this much extra depth over `settleMs`. Real perspective
   * movement rather than a static pop, for characters whose cropped art rules
   * out a genuine walk. Feet stay grounded throughout because the position is
   * projected every frame like any other.
   */
  settleFromDepth?: number;
  settleMs?: number;
}

export default function CharacterLayer({
  mode,
  calibration,
  fit,
  idleIntensity = 1,
  allowFlip = true,
  onArrive,
  label,
  assetAvailable = true,
  fadeInMs = 0,
  settleFromDepth = 0,
  settleMs = 0,
}: Props) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const spriteRef = useRef<HTMLDivElement | null>(null);
  const arrivedRef = useRef(false);
  const onArriveRef = useRef(onArrive);
  onArriveRef.current = onArrive;

  // Stable content signature for the current beat. See the long note on the
  // effect's dependency array below — this is what stops the walk restarting.
  const modeKey =
    mode.kind === "walk"
      ? `walk:${mode.asset.src}:${mode.path.map((p) => `${p.x},${p.d}`).join("|")}`
      : `static:${mode.asset.src}:${mode.position.x},${mode.position.d}`;

  // The rAF loop reads these live rather than re-arming when they change, so a
  // parent re-render can never interrupt an in-flight walk.
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    arrivedRef.current = false;
    const walker = mode.kind === "walk" ? new WalkPath(mode.path, mode.tuning ?? DEFAULT_WALK) : null;
    const asset = mode.asset;

    // A sprite sheet's file is many frames wide, but what's on screen is ONE
    // frame. Anchoring against the sheet width would offset him by half the
    // sheet — with a 14-frame sheet that's seven bodies to the left.
    const artW = mode.kind === "walk" ? (asset as SpriteSheetAsset).frameWidth : asset.naturalWidth;
    const artH = mode.kind === "walk" ? (asset as SpriteSheetAsset).frameHeight : asset.naturalHeight;

    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    let lastFrame = -1;

    const draw = (position: WorldPoint, facing: number, spriteFrame: number | null) => {
      const p = project(calibration, position);
      const idle = idleOffset(elapsed, idleIntensity);

      // p.heightPx is the character's FULL standing height in hall-image pixels.
      // The art may only contain part of that body (a waist-cropped conversation
      // pose has standingHeightFraction > 1), so the image itself is drawn at
      // fullHeight / standingHeightFraction and the anchor does the rest.
      const scale = (p.heightPx / asset.standingHeightFraction / artH) * fit.scale;

      // Resolve the anchor: the art's feet point must land on the projected
      // floor contact point.
      const anchorX = asset.centerAnchorX * artW;
      const anchorY = asset.feetAnchorY * artH;

      const screenX = fit.offsetX + (p.x + idle.swayX * p.heightPx) * fit.scale;
      const screenY = fit.offsetY + (p.feetY - idle.bobY * p.heightPx) * fit.scale;

      const flip = allowFlip && facing < 0 ? -1 : 1;

      node.style.transform =
        `translate3d(${(screenX - anchorX).toFixed(2)}px, ${(screenY - anchorY).toFixed(2)}px, 0)` +
        ` scale(${(scale * flip).toFixed(5)}, ${scale.toFixed(5)})`;
      node.style.transformOrigin = `${anchorX}px ${anchorY}px`;
      // Painter's order among characters, but always beneath the foreground
      // plate at z=9000. Getting this wrong puts Rahul in front of your own
      // laptop, which is the exact failure the plate exists to prevent.
      node.style.zIndex = String(Math.max(1000, Math.round(8000 - p.depth * 100)));

      if (spriteFrame !== null && spriteRef.current && spriteFrame !== lastFrame) {
        const sheet = asset as SpriteSheetAsset;
        const col = spriteFrame % sheet.columns;
        const row = Math.floor(spriteFrame / sheet.columns);
        spriteRef.current.style.backgroundPosition =
          `${-col * sheet.frameWidth}px ${-row * sheet.frameHeight}px`;
        lastFrame = spriteFrame;
      }
    };

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      elapsed += dt;

      if (walker) {
        const state = walker.step(dt);
        draw(state.position, state.facing, state.speedRatio > 0.05 ? state.frame : 0);
        if (state.finished && !arrivedRef.current) {
          arrivedRef.current = true;
          onArriveRef.current?.();
        }
      } else {
        const current = modeRef.current;
        if (current.kind === "static") {
          let pos = current.position;
          if (settleFromDepth > 0 && settleMs > 0 && elapsed * 1000 < settleMs) {
            // easeOutCubic on depth only — no lateral drift, so it reads as
            // stepping forward into place rather than sliding sideways.
            const t = Math.min(1, (elapsed * 1000) / settleMs);
            const eased = 1 - Math.pow(1 - t, 3);
            pos = { x: pos.x, d: pos.d + settleFromDepth * (1 - eased) };
          }
          draw(pos, 1, null);
        }
      }

      raf = requestAnimationFrame(tick);
    };

    if (fadeInMs > 0) {
      node.style.opacity = "0";
      node.style.transition = `opacity ${fadeInMs}ms ease-out`;
      requestAnimationFrame(() => requestAnimationFrame(() => { node.style.opacity = "1"; }));
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);

    // DEPENDS ON `modeKey`, NOT `mode`.
    //
    // This was a real bug and worth spelling out. `mode` is built as an inline
    // object literal by SceneController, so it is a brand-new reference on every
    // single parent render. Depending on it meant this effect re-ran constantly,
    // and each re-run did `new WalkPath(...)` — resetting `travelled` to zero.
    // Rahul restarted his walk forever, never reached the end of the path, so
    // `finished` never became true, so onArrive never fired, so WALK_COMPLETE and
    // EXIT_COMPLETE never fired, so the judges never appeared. One stale
    // dependency array took out the entire second half of the experience.
    //
    // `modeKey` is a content signature, so the loop re-arms only when the beat
    // genuinely changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeKey, calibration, fit, idleIntensity, allowFlip, fadeInMs, settleFromDepth, settleMs]);

  const asset = mode.asset;

  return (
    <div
      ref={nodeRef}
      className="pointer-events-none absolute left-0 top-0 will-change-transform"
      style={{
        width: mode.kind === "walk" ? (asset as SpriteSheetAsset).frameWidth : asset.naturalWidth,
        height: mode.kind === "walk" ? (asset as SpriteSheetAsset).frameHeight : asset.naturalHeight,
      }}
      aria-hidden
    >
      {assetAvailable ? (
        mode.kind === "walk" ? (
          <div
            ref={spriteRef}
            style={{
              width: (asset as SpriteSheetAsset).frameWidth,
              height: (asset as SpriteSheetAsset).frameHeight,
              backgroundImage: `url(${asset.src})`,
              backgroundRepeat: "no-repeat",
              imageRendering: "auto",
            }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.src} alt="" width={asset.naturalWidth} height={asset.naturalHeight} draggable={false} />
        )
      ) : (
        <PlaceholderSilhouette width={asset.naturalWidth} height={asset.naturalHeight} label={label} />
      )}
    </div>
  );
}

/**
 * Shown when a character asset hasn't been supplied yet. Deliberately reads as
 * a blocking marker, not as art — a bad character drawing is more damaging to
 * the illusion than an honest grey stand-in, and it invites everyone to stop
 * critiquing the perspective and start critiquing the face.
 */
function PlaceholderSilhouette({
  width,
  height,
  label,
}: {
  width: number;
  height: number;
  label?: string;
}) {
  return (
    <svg width={width} height={height} viewBox="0 0 220 620" preserveAspectRatio="none">
      <g fill="rgba(18,20,28,0.82)">
        <ellipse cx="110" cy="70" rx="42" ry="46" />
        <path d="M52 130 q58 -26 116 0 l16 200 -28 8 -8 270 h-76 l-8 -270 -28 -8 z" />
      </g>
      <ellipse cx="110" cy="612" rx="58" ry="9" fill="rgba(0,0,0,0.35)" />
      {label ? (
        <text x="110" y="330" textAnchor="middle" fontSize="30" fill="rgba(255,255,255,0.75)"
          fontFamily="ui-monospace, monospace" letterSpacing="2">
          {label}
        </text>
      ) : null}
    </svg>
  );
}
