/**
 * behaviorMetrics.ts
 * ---------------------------------------------------------------------------
 * Turns a stream of FaceSample readings into the three numbers the report
 * actually uses. This is the ONLY thing that leaves the browser if the camera
 * is on — never raw video, never a frame, never an image.
 *
 * Deliberately does not attempt to infer anxiety, confidence, engagement, or
 * any psychological state. "forwardFacingRatio" and "averageHeadTurn" are
 * physically observable facts; the report layer is responsible for describing
 * them in behavioral language ("frequent head turns") rather than diagnostic
 * language ("nervous").
 */

import type { FaceSample } from "./faceLandmarks";
import type { WebcamMetrics } from "@/lib/session/sessionTypes";

const FORWARD_FACING_YAW_THRESHOLD = 15; // degrees
const BLINK_SCORE_THRESHOLD = 0.5;

export class BehaviorAggregator {
  private samples: FaceSample[] = [];
  private blinkState = { left: false, right: false };
  private blinkCount = 0;
  private firstTimestamp: number | null = null;
  private lastTimestamp: number | null = null;

  addSample(s: FaceSample): void {
    this.samples.push(s);
    if (this.firstTimestamp == null) this.firstTimestamp = s.timestamp;
    this.lastTimestamp = s.timestamp;

    if (!s.present) return;

    // Rising-edge blink detection: count a blink when the eye transitions from
    // open to closed, not on every sample where it happens to be closed.
    const leftClosed = s.leftEyeBlink > BLINK_SCORE_THRESHOLD;
    const rightClosed = s.rightEyeBlink > BLINK_SCORE_THRESHOLD;
    if (leftClosed && !this.blinkState.left) this.blinkCount++;
    this.blinkState = { left: leftClosed, right: rightClosed };
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  finalize(): WebcamMetrics {
    const present = this.samples.filter((s) => s.present);
    const forward = present.filter((s) => Math.abs(s.yawDegrees) <= FORWARD_FACING_YAW_THRESHOLD);

    const forwardFacingRatio = this.samples.length ? forward.length / this.samples.length : 0;
    const averageHeadTurnDegrees = present.length
      ? present.reduce((sum, s) => sum + Math.abs(s.yawDegrees), 0) / present.length
      : 0;

    const elapsedMinutes =
      this.firstTimestamp != null && this.lastTimestamp != null
        ? Math.max((this.lastTimestamp - this.firstTimestamp) / 60000, 1 / 60)
        : 1 / 60;
    const blinkRatePerMinute = this.blinkCount / elapsedMinutes;

    return {
      enabled: true,
      forwardFacingRatio,
      averageHeadTurnDegrees,
      blinkRatePerMinute,
      sampleCount: this.samples.length,
    };
  }
}
