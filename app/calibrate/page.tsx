"use client";

/**
 * /calibrate
 * ---------------------------------------------------------------------------
 * Turns your hall image into the five numbers the scene engine needs.
 *
 * You place a stand-in figure at two spots on the floor and size each one until
 * it looks right standing there. That's it. Two eyeball judgements about a
 * person's size are far more reliable than trying to locate an invisible horizon
 * by hand, and the maths recovers the horizon from them exactly.
 *
 * The image never leaves the browser — it's read with an object URL and nothing
 * is uploaded.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { solveFromTwoSamples, solveUnitScale } from "@/lib/scene/perspective";

interface Sample {
  x: number; // image px
  feetY: number; // image px
  heightPx: number; // image px, full standing height
}

export default function CalibratePage() {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [dims, setDims] = useState({ w: 1920, h: 1080 });
  const [far, setFar] = useState<Sample>({ x: 1300, feetY: 620, heightPx: 210 });
  const [near, setNear] = useState<Sample>({ x: 800, feetY: 880, heightPx: 600 });
  const [vanishX, setVanishX] = useState(960);
  const [metresToFar, setMetresToFar] = useState(7);
  const [cameraHeight, setCameraHeight] = useState(1.2);
  const [dragging, setDragging] = useState<null | { which: "far" | "near"; part: "move" | "size" }>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);

  const onFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => {
      setDims({ w: probe.naturalWidth, h: probe.naturalHeight });
      setVanishX(probe.naturalWidth / 2);
      setFar((s) => ({ ...s, x: probe.naturalWidth * 0.68, feetY: probe.naturalHeight * 0.58 }));
      setNear((s) => ({ ...s, x: probe.naturalWidth * 0.42, feetY: probe.naturalHeight * 0.82 }));
      setImgUrl(url);
    };
    probe.src = url;
  };

  const toImageSpace = useCallback(
    (clientX: number, clientY: number) => {
      const el = wrapRef.current;
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return { x: ((clientX - r.left) / r.width) * dims.w, y: ((clientY - r.top) / r.height) * dims.h };
    },
    [dims]
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const p = toImageSpace(e.clientX, e.clientY);
      const setter = dragging.which === "far" ? setFar : setNear;
      setter((s) =>
        dragging.part === "move"
          ? { ...s, x: p.x, feetY: p.y }
          : { ...s, heightPx: Math.max(20, s.feetY - p.y) }
      );
    };
    const up = () => setDragging(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, toImageSpace]);

  const solution = useMemo(() => {
    const geom = solveFromTwoSamples(far.feetY, far.heightPx, near.feetY, near.heightPx);
    if (!geom) return null;
    const unitScale = solveUnitScale(geom.horizonY, far.feetY, metresToFar, cameraHeight);
    return {
      imageWidth: Math.round(dims.w),
      imageHeight: Math.round(dims.h),
      horizonY: Math.round(geom.horizonY * 10) / 10,
      k: Math.round(geom.k * 1000) / 1000,
      unitScale: Math.round(unitScale),
      vanishX: Math.round(vanishX),
    };
  }, [far, near, dims, vanishX, metresToFar, cameraHeight]);

  const characterMetres = solution ? (solution.k * cameraHeight).toFixed(2) : "—";

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-200">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="font-mono text-sm uppercase tracking-[0.3em] text-neutral-500">ConvoScape</h1>
        <p className="mt-2 max-w-2xl text-2xl leading-snug text-neutral-100">
          Place a person at two spots on the floor. Size each one until they look right standing there.
        </p>

        {!imgUrl ? (
          <label className="mt-8 flex h-64 cursor-pointer items-center justify-center rounded border border-dashed border-neutral-700 text-neutral-400 hover:border-neutral-500">
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            Choose your hall image
          </label>
        ) : (
          <>
            <div
              ref={wrapRef}
              className="relative mt-6 w-full select-none overflow-hidden rounded border border-neutral-800"
              style={{ aspectRatio: `${dims.w} / ${dims.h}` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgUrl} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox={`0 0 ${dims.w} ${dims.h}`}
                preserveAspectRatio="none"
              >
                {solution && (
                  <>
                    <line
                      x1={0}
                      y1={solution.horizonY}
                      x2={dims.w}
                      y2={solution.horizonY}
                      stroke="#38bdf8"
                      strokeWidth={2}
                      strokeDasharray="12 8"
                    />
                    <line
                      x1={solution.vanishX}
                      y1={0}
                      x2={solution.vanishX}
                      y2={dims.h}
                      stroke="#38bdf8"
                      strokeWidth={1}
                      opacity={0.35}
                    />
                  </>
                )}
                {(["far", "near"] as const).map((which) => {
                  const s = which === "far" ? far : near;
                  const w = s.heightPx * 0.34;
                  return (
                    <g key={which}>
                      <rect
                        x={s.x - w / 2}
                        y={s.feetY - s.heightPx}
                        width={w}
                        height={s.heightPx}
                        rx={w / 2.4}
                        fill="rgba(56,189,248,0.35)"
                        stroke="#38bdf8"
                        strokeWidth={2}
                        style={{ cursor: "move" }}
                        onPointerDown={() => setDragging({ which, part: "move" })}
                      />
                      <circle
                        cx={s.x}
                        cy={s.feetY - s.heightPx}
                        r={Math.max(10, s.heightPx * 0.045)}
                        fill="#0ea5e9"
                        style={{ cursor: "ns-resize" }}
                        onPointerDown={() => setDragging({ which, part: "size" })}
                      />
                      <ellipse cx={s.x} cy={s.feetY} rx={w * 0.55} ry={w * 0.16} fill="rgba(0,0,0,0.45)" />
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="space-y-4 text-sm">
                <Field label={`Camera axis (x = ${vanishX})`}>
                  <input
                    type="range"
                    min={0}
                    max={dims.w}
                    value={vanishX}
                    onChange={(e) => setVanishX(+e.target.value)}
                    className="w-full"
                  />
                  <p className="mt-1 text-neutral-500">
                    Slide until the vertical line sits where you are looking — the point straight ahead of
                    the user, not necessarily the middle of the photo.
                  </p>
                </Field>

                <Field label={`Distance to the far figure: ${metresToFar} m`}>
                  <input
                    type="range"
                    min={2}
                    max={20}
                    step={0.5}
                    value={metresToFar}
                    onChange={(e) => setMetresToFar(+e.target.value)}
                    className="w-full"
                  />
                </Field>

                <Field label={`Seated eye height: ${cameraHeight.toFixed(2)} m`}>
                  <input
                    type="range"
                    min={0.9}
                    max={1.6}
                    step={0.05}
                    value={cameraHeight}
                    onChange={(e) => setCameraHeight(+e.target.value)}
                    className="w-full"
                  />
                </Field>

                <p className="text-neutral-400">
                  Sanity check: your figures imply a person{" "}
                  <span className="text-neutral-100">{characterMetres} m</span> tall. If that isn&apos;t
                  between about 1.6 and 1.9, one of the two figures is sized wrong.
                </p>
              </div>

              <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-widest text-neutral-500">
                  Paste into lib/scene/sceneConfig.ts
                </p>
                <pre className="overflow-auto rounded border border-neutral-800 bg-black p-4 font-mono text-xs leading-relaxed text-emerald-300">
{solution ? JSON.stringify(solution, null, 2) : "Move the figures apart to solve."}
                </pre>
                <button
                  onClick={() => solution && navigator.clipboard.writeText(JSON.stringify(solution, null, 2))}
                  className="mt-3 rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
                >
                  Copy calibration
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 font-mono text-xs uppercase tracking-widest text-neutral-400">{label}</p>
      {children}
    </div>
  );
}
