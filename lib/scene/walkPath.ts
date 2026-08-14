/**
 * walkPath.ts
 * ---------------------------------------------------------------------------
 * Moves a character along the floor at a believable speed, and keeps the
 * sprite's feet locked to the ground while it does.
 *
 * Two failure modes this exists to prevent:
 *
 * 1. SLIDING. Tweening screen coordinates gives constant *screen* speed, which
 *    is not constant *world* speed. We integrate in world space and project at
 *    the last moment.
 *
 * 2. ICE-SKATING. If the sprite cycles on a timer while the body moves at a
 *    varying rate, the feet slip against the floor. We advance the sprite by
 *    distance travelled, not by elapsed time, so one stride of animation always
 *    equals one stride of ground covered.
 */

import type { WorldPoint } from "./perspective";

export interface WalkTuning {
  /** Walking speed in camera heights per second. 1.3 m/s ÷ 1.2 m ≈ 1.08. */
  speed: number;
  /** Stride length in camera heights. 0.72 m ÷ 1.2 m ≈ 0.6. */
  stride: number;
  /** Frames in one full walk cycle (left step + right step) in the sheet. */
  framesPerCycle: number;
  /** Distance from the destination over which he slows to a stop. */
  decelDistance: number;
  /** Distance over which he accelerates from standing at the start. */
  accelDistance: number;
}

export const DEFAULT_WALK: WalkTuning = {
  speed: 1.05,
  stride: 0.6,
  framesPerCycle: 8,
  decelDistance: 0.9,
  accelDistance: 0.5,
};

export interface WalkState {
  position: WorldPoint;
  /** 0..1 through the current sprite cycle. */
  cyclePhase: number;
  /** Index into the sprite sheet. */
  frame: number;
  /** True once the final waypoint is reached. */
  finished: boolean;
  /** Current speed as a fraction of full speed — useful for blending to idle. */
  speedRatio: number;
  /** Facing, derived from movement direction. -1 = character's left, 1 = right. */
  facing: number;
}

/**
 * A path is a list of floor waypoints. Rahul's default route deliberately has a
 * turn in it: a person crossing a hall notices you, changes line, and comes
 * over. A dead-straight approach reads as a conveyor belt.
 */
export class WalkPath {
  private readonly waypoints: WorldPoint[];
  private readonly legLengths: number[];
  private readonly totalLength: number;
  private travelled = 0;
  private cycleDistance = 0;

  constructor(waypoints: WorldPoint[], private readonly tuning: WalkTuning = DEFAULT_WALK) {
    if (waypoints.length < 2) throw new Error("A walk path needs at least two waypoints.");
    this.waypoints = waypoints;
    this.legLengths = [];
    let total = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const len = dist(waypoints[i - 1], waypoints[i]);
      this.legLengths.push(len);
      total += len;
    }
    this.totalLength = total;
  }

  get length(): number {
    return this.totalLength;
  }

  /** Estimated duration in seconds, for scripting the scene beats around it. */
  get estimatedDuration(): number {
    const t = this.tuning;
    const cruise = Math.max(0, this.totalLength - t.accelDistance - t.decelDistance);
    // Ramps average half speed, so they cost twice their distance in time.
    return (cruise + 2 * t.accelDistance + 2 * t.decelDistance) / t.speed;
  }

  reset(): void {
    this.travelled = 0;
    this.cycleDistance = 0;
  }

  /**
   * Advance by dt seconds and return the new state.
   * dt is clamped so a backgrounded tab doesn't teleport him across the hall.
   */
  step(dtSeconds: number): WalkState {
    const t = this.tuning;
    const dt = Math.min(dtSeconds, 1 / 20);

    const remaining = this.totalLength - this.travelled;
    const speedRatio = Math.min(
      1,
      Math.max(
        0.12,
        Math.min(
          t.accelDistance > 0 ? 0.25 + (0.75 * this.travelled) / t.accelDistance : 1,
          t.decelDistance > 0 ? remaining / t.decelDistance : 1
        )
      )
    );

    const advance = t.speed * speedRatio * dt;
    this.travelled = Math.min(this.totalLength, this.travelled + advance);
    this.cycleDistance += advance;

    const cycleLength = t.stride * 2;
    const cyclePhase = (this.cycleDistance % cycleLength) / cycleLength;

    const finished = this.totalLength - this.travelled < 1e-3;
    const position = this.pointAt(this.travelled);
    const ahead = this.pointAt(Math.min(this.totalLength, this.travelled + 0.05));

    return {
      position,
      cyclePhase,
      frame: Math.floor(cyclePhase * t.framesPerCycle) % t.framesPerCycle,
      finished,
      speedRatio: finished ? 0 : speedRatio,
      facing: ahead.x >= position.x ? 1 : -1,
    };
  }

  /** Position at an arc-length offset along the path. */
  pointAt(s: number): WorldPoint {
    let remaining = Math.max(0, Math.min(s, this.totalLength));
    for (let i = 0; i < this.legLengths.length; i++) {
      const legLen = this.legLengths[i];
      if (remaining <= legLen || i === this.legLengths.length - 1) {
        const f = legLen > 0 ? remaining / legLen : 1;
        const a = this.waypoints[i];
        const b = this.waypoints[i + 1];
        return { x: lerp(a.x, b.x, f), d: lerp(a.d, b.d, f) };
      }
      remaining -= legLen;
    }
    return this.waypoints[this.waypoints.length - 1];
  }
}

function dist(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(b.x - a.x, b.d - a.d);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Idle motion. A character standing perfectly still reads as dead more strongly
 * than a character animating badly, so this runs whenever nothing else does.
 *
 * Deliberately tiny: sub-pixel at conversation scale, but the eye picks it up.
 * Three incommensurable frequencies keep it from feeling like a loop.
 */
export interface IdleOffset {
  /** Vertical bob in fractions of character height. */
  bobY: number;
  /** Lateral weight shift in fractions of character height. */
  swayX: number;
  /** Breathing scale multiplier, applied to the chest region if the asset is rigged. */
  breathScale: number;
  /** Small head rotation in degrees, for assets with a separable head layer. */
  headTilt: number;
}

export function idleOffset(elapsedSeconds: number, intensity = 1): IdleOffset {
  const t = elapsedSeconds;
  return {
    bobY: intensity * 0.0022 * Math.sin(t * 1.9),
    swayX: intensity * 0.0016 * Math.sin(t * 0.41) + intensity * 0.0006 * Math.sin(t * 1.13),
    breathScale: 1 + intensity * 0.0035 * Math.sin(t * 1.05),
    headTilt: intensity * 0.55 * Math.sin(t * 0.33 + 1.2),
  };
}
