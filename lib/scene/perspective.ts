/**
 * perspective.ts
 * ---------------------------------------------------------------------------
 * The single most important file in Phase 1.
 *
 * Everything that makes Rahul "walk" instead of "slide" comes from one fact:
 *
 *   For a pinhole camera looking roughly horizontally at a flat floor, a person
 *   standing with their feet on that floor at depth d appears with:
 *
 *       feetY      = horizonY + (f * H) / d          (feet sink toward horizon)
 *       heightPx   = (f * h) / d = k * (feetY - horizonY)
 *       xScreen    = vanishX + (f * X) / d
 *
 *   where H = camera height above the floor, h = character's real height,
 *   k = h / H, and X = lateral world offset from the camera axis.
 *
 * The consequence people miss: apparent height is a *linear* function of the
 * feet's screen Y, but screen Y is a *hyperbolic* function of depth. So if you
 * tween Y linearly over time (the default instinct, and what Framer Motion will
 * happily do for you), the character decelerates unnaturally in the distance and
 * lunges at the end. Constant walking speed in the world means constant change
 * in d, which means Y follows 1/(a + bt). That single correction is the
 * difference between "a person walked up to my table" and "a PNG got bigger."
 *
 * UNITS
 * -----
 * All world distances are expressed in CAMERA HEIGHTS, not metres. The camera is
 * the user's seated eye level (~1.15-1.25 m). This removes the need to ever know
 * the focal length in pixels: one calibration constant (`unitScale`, which is
 * f * H in pixels) ties the whole system together.
 *
 * Working in camera heights also means the model degrades gracefully. If your
 * estimate of the hall's real dimensions is off by 20%, everything is off by the
 * same 20% and the scene still looks internally consistent — which is all the
 * eye actually checks.
 */

export interface HallCalibration {
  /** Natural pixel dimensions of hall.png. All calibration values are in this space. */
  imageWidth: number;
  imageHeight: number;

  /**
   * Y of the horizon line in image pixels. This is eye level, NOT the back wall
   * and NOT the top of the tables. In an interior shot it is usually invisible;
   * derive it with /calibrate rather than guessing.
   */
  horizonY: number;

  /**
   * k = character height / camera height. A 1.75 m person seen from a seated
   * 1.20 m camera gives k ≈ 1.46. Derived by calibration; do not hand-tune this
   * without also re-checking horizonY, the two are coupled.
   */
  k: number;

  /**
   * f * H in pixels. Converts depth (camera heights) to pixels of vertical
   * offset from the horizon. Sets the "how far away is far" feel.
   */
  unitScale: number;

  /**
   * Screen X of the camera axis — where a person standing directly in front of
   * the camera at any depth appears. Rarely dead centre in a real photo.
   */
  vanishX: number;
}

/** A position on the floor, in world units (camera heights). */
export interface WorldPoint {
  /** Lateral offset from the camera axis. Positive = user's right. */
  x: number;
  /** Distance from the camera plane. Must be > 0. */
  d: number;
}

/** Where and how big to draw a character, in hall-image pixel space. */
export interface ScreenPlacement {
  /** Screen X of the character's centre line. */
  x: number;
  /** Screen Y of the character's feet (their contact point with the floor). */
  feetY: number;
  /** Full standing height in pixels, floor to top of head. */
  heightPx: number;
  /** Depth, carried through for painter's-algorithm sorting. */
  depth: number;
}

const MIN_DEPTH = 0.35; // ~40 cm from the lens. Closer than this is meaningless.

/** Screen Y of a floor point at depth d. */
export function feetYFromDepth(cal: HallCalibration, d: number): number {
  return cal.horizonY + cal.unitScale / Math.max(d, MIN_DEPTH);
}

/** Depth of a floor point at screen Y. Inverse of feetYFromDepth. */
export function depthFromFeetY(cal: HallCalibration, feetY: number): number {
  const u = feetY - cal.horizonY;
  if (u <= 0) return Infinity; // at or above the horizon = infinitely far
  return cal.unitScale / u;
}

/** Apparent standing height, in pixels, of a character at depth d. */
export function heightPxFromDepth(cal: HallCalibration, d: number): number {
  return (cal.k * cal.unitScale) / Math.max(d, MIN_DEPTH);
}

/** Full placement for a world position. This is the function the renderer calls. */
export function project(cal: HallCalibration, p: WorldPoint): ScreenPlacement {
  const d = Math.max(p.d, MIN_DEPTH);
  const u = cal.unitScale / d;
  return {
    x: cal.vanishX + (cal.unitScale * p.x) / d,
    feetY: cal.horizonY + u,
    heightPx: cal.k * u,
    depth: d,
  };
}

/**
 * Recover a world position from a point the user clicked on the floor.
 * Used by the calibration tool and by any future click-to-place authoring.
 */
export function unproject(cal: HallCalibration, screenX: number, feetY: number): WorldPoint {
  const d = depthFromFeetY(cal, feetY);
  return { x: ((screenX - cal.vanishX) * d) / cal.unitScale, d };
}

/**
 * Derive horizonY and k from two observations of the same character standing at
 * two different places on the floor.
 *
 * Because heightPx = k * (feetY - horizonY) is linear in feetY, two points
 * determine the line exactly:
 *
 *     k        = (p2 - p1) / (y2 - y1)
 *     horizonY = y1 - p1 / k
 *
 * This is why the calibration tool asks you to drag a silhouette to two spots
 * and match the sizes by eye. Two eyeball judgements beat one measured guess,
 * because the errors are in a quantity humans are good at (does that person look
 * the right size standing there?) rather than one they're bad at (where exactly
 * is the invisible horizon?).
 */
export function solveFromTwoSamples(
  y1: number,
  heightPx1: number,
  y2: number,
  heightPx2: number
): { horizonY: number; k: number } | null {
  const dy = y2 - y1;
  if (Math.abs(dy) < 1e-6) return null;
  const k = (heightPx2 - heightPx1) / dy;
  if (k <= 0) return null; // nearer must mean bigger, or the samples are wrong
  return { horizonY: y1 - heightPx1 / k, k };
}

/**
 * Fix the depth scale by asserting a real-world distance for one sample.
 * `metresAway` is the estimated distance from the user to that spot;
 * `cameraHeightMetres` is the seated eye height (default 1.2 m).
 */
export function solveUnitScale(
  horizonY: number,
  sampleFeetY: number,
  metresAway: number,
  cameraHeightMetres = 1.2
): number {
  const depthInCameraHeights = metresAway / cameraHeightMetres;
  return (sampleFeetY - horizonY) * depthInCameraHeights;
}

/**
 * Convert hall-image pixel space to CSS pixels for a viewport that renders the
 * hall with `object-fit: cover`. The hall must never be letterboxed or the
 * illusion breaks at the edges, so we scale to cover and centre-crop.
 *
 * Returned as a transform to apply to the whole character layer, so individual
 * characters never need to know about the viewport at all.
 */
export interface ViewportFit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function fitHallToViewport(
  cal: HallCalibration,
  viewportW: number,
  viewportH: number,
  /**
   * 0 keeps the top of the image, 1 keeps the bottom. The hall is 3:2 and most
   * displays are wider, so height gets cropped — and the bottom third is the
   * desk that does the occluding, which we cannot afford to lose. Ceiling is the
   * cheapest thing in the frame, so the crop comes off the top.
   */
  focusY = 0.78
): ViewportFit {
  const scale = Math.max(viewportW / cal.imageWidth, viewportH / cal.imageHeight);
  const scaledW = cal.imageWidth * scale;
  const scaledH = cal.imageHeight * scale;
  return {
    scale,
    offsetX: (viewportW - scaledW) / 2,
    offsetY: (viewportH - scaledH) * focusY,
  };
}
