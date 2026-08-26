/**
 * behaviorMetrics.ts
 * ---------------------------------------------------------------------------
 * Aggregates client-side FaceSample readings into high-level presentation metrics.
 *
 * GUARANTEES:
 * 1. Strictly local processing (runs in browser only).
 * 2. Privacy-preserving: only derived summary numbers leave the browser.
 * 3. NO psychological/emotion mind-reading (no "confidence", "nervousness", or "lie detection").
 * 4. Temporal smoothing to prevent landmark noise from triggering false events.
 */

import type { FaceSample } from "./faceLandmarks";
import type { CameraMetrics } from "@/lib/session/sessionTypes";

// Configurable thresholds
const YAW_FORWARD_THRESHOLD = 15; // degrees +/-
const PITCH_LEVEL_THRESHOLD_UP = 15; // degrees + (looking up)
const PITCH_LEVEL_THRESHOLD_DOWN = -12; // degrees - (looking down)
const GAZE_AVERSION_THRESHOLD = 0.55; // blendshape score [0..1]
const PROLONGED_LOOK_AWAY_CONSECUTIVE_SAMPLES = 8; // ~2 seconds at 4 Hz

export type GazeClassification = "LOOKING_TOWARD_CAMERA" | "LOOKING_AWAY" | "UNCERTAIN";
export type HeadOrientationClass = "FORWARD" | "LEFT" | "RIGHT" | "UP" | "DOWN" | "UNCERTAIN";

export class BehaviorAggregator {
  private samples: FaceSample[] = [];
  private firstTimestamp: number | null = null;
  private lastTimestamp: number | null = null;

  // Interruption and state tracking
  private lastFacePresent = false;
  private faceLostCount = 0;
  private consecutiveLookAwayCount = 0;
  private prolongedLookAwayCount = 0;

  // Blink state
  private blinkState = { left: false, right: false };
  private blinkCount = 0;

  addSample(s: FaceSample): void {
    this.samples.push(s);
    if (this.firstTimestamp == null) this.firstTimestamp = s.timestamp;
    this.lastTimestamp = s.timestamp;

    // Track face presence transitions
    if (this.lastFacePresent && !s.present) {
      this.faceLostCount++;
    }
    this.lastFacePresent = s.present;

    if (!s.present) {
      this.consecutiveLookAwayCount = 0;
      return;
    }

    // Blink detection
    const leftClosed = s.leftEyeBlink > 0.5;
    const rightClosed = s.rightEyeBlink > 0.5;
    if (leftClosed && !this.blinkState.left) this.blinkCount++;
    this.blinkState = { left: leftClosed, right: rightClosed };

    // Gaze classification
    const isLookingAway =
      Math.abs(s.yawDegrees) > YAW_FORWARD_THRESHOLD * 1.5 ||
      s.gazeAversionScore > GAZE_AVERSION_THRESHOLD;

    if (isLookingAway) {
      this.consecutiveLookAwayCount++;
      if (this.consecutiveLookAwayCount === PROLONGED_LOOK_AWAY_CONSECUTIVE_SAMPLES) {
        this.prolongedLookAwayCount++;
      }
    } else {
      this.consecutiveLookAwayCount = 0;
    }
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  finalize(): CameraMetrics {
    const total = Math.max(1, this.samples.length);
    const presentSamples = this.samples.filter((s) => s.present);
    const presentCount = presentSamples.length;

    const faceDetectedRatio = roundRatio(presentCount / total);
    const faceNotDetectedRatio = roundRatio(1 - faceDetectedRatio);

    if (presentCount === 0) {
      return {
        enabled: true,
        samplesAnalyzed: total,
        faceDetectedRatio: 0,
        faceNotDetectedRatio: 1,
        eyeContactRatio: 0,
        lookingAwayRatio: 0,
        forwardFacingRatio: 0,
        headOrientation: {
          forwardRatio: 0,
          leftRatio: 0,
          rightRatio: 0,
          upRatio: 0,
          downRatio: 0,
        },
        interruptions: {
          faceLostCount: this.faceLostCount,
          prolongedLookAwayCount: this.prolongedLookAwayCount,
        },
        analysisDurationSeconds: this.getDurationSeconds(),
        averageHeadTurnDegrees: 0,
        blinkRatePerMinute: 0,
      };
    }

    // Classify head orientation
    let forwardCount = 0;
    let leftCount = 0;
    let rightCount = 0;
    let upCount = 0;
    let downCount = 0;

    // Classify gaze / eye contact consistency
    let eyeContactCount = 0;
    let lookingAwayCount = 0;

    for (const s of presentSamples) {
      const isYawForward = Math.abs(s.yawDegrees) <= YAW_FORWARD_THRESHOLD;
      const isPitchLevel =
        s.pitchDegrees >= PITCH_LEVEL_THRESHOLD_DOWN && s.pitchDegrees <= PITCH_LEVEL_THRESHOLD_UP;

      if (isYawForward && isPitchLevel) {
        forwardCount++;
      } else if (s.yawDegrees < -YAW_FORWARD_THRESHOLD) {
        leftCount++;
      } else if (s.yawDegrees > YAW_FORWARD_THRESHOLD) {
        rightCount++;
      } else if (s.pitchDegrees > PITCH_LEVEL_THRESHOLD_UP) {
        upCount++;
      } else if (s.pitchDegrees < PITCH_LEVEL_THRESHOLD_DOWN) {
        downCount++;
      }

      // Eye contact approximation (forward orientation and low gaze aversion)
      if (isYawForward && isPitchLevel && s.gazeAversionScore < GAZE_AVORMATION_SAFE_THRESHOLD) {
        eyeContactCount++;
      } else if (
        Math.abs(s.yawDegrees) > YAW_FORWARD_THRESHOLD * 1.5 ||
        s.gazeAversionScore > GAZE_AVERSION_THRESHOLD
      ) {
        lookingAwayCount++;
      }
      // Note: Uncertain samples are excluded from both counters per specification
    }

    const forwardFacingRatio = roundRatio(forwardCount / presentCount);
    const eyeContactRatio = roundRatio(eyeContactCount / presentCount);
    const lookingAwayRatio = roundRatio(lookingAwayCount / presentCount);

    const averageHeadTurnDegrees = Math.round(
      presentSamples.reduce((sum, s) => sum + Math.abs(s.yawDegrees), 0) / presentCount
    );

    const durationSec = this.getDurationSeconds();
    const durationMin = Math.max(durationSec / 60, 0.1);
    const blinkRatePerMinute = Math.round((this.blinkCount / durationMin) * 10) / 10;

    return {
      enabled: true,
      samplesAnalyzed: total,
      faceDetectedRatio,
      faceNotDetectedRatio,
      eyeContactRatio,
      lookingAwayRatio,
      forwardFacingRatio,
      headOrientation: {
        forwardRatio: roundRatio(forwardCount / presentCount),
        leftRatio: roundRatio(leftCount / presentCount),
        rightRatio: roundRatio(rightCount / presentCount),
        upRatio: roundRatio(upCount / presentCount),
        downRatio: roundRatio(downCount / presentCount),
      },
      interruptions: {
        faceLostCount: this.faceLostCount,
        prolongedLookAwayCount: this.prolongedLookAwayCount,
      },
      analysisDurationSeconds: durationSec,
      averageHeadTurnDegrees,
      blinkRatePerMinute,
    };
  }

  private getDurationSeconds(): number {
    if (this.firstTimestamp == null || this.lastTimestamp == null) return 0;
    return Math.max(1, Math.round((this.lastTimestamp - this.firstTimestamp) / 1000));
  }
}

const GAZE_AVORMATION_SAFE_THRESHOLD = 0.45;

function roundRatio(num: number): number {
  return Math.round(Math.min(1, Math.max(0, num)) * 100) / 100;
}
