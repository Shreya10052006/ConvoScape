/**
 * faceLandmarks.ts
 * ---------------------------------------------------------------------------
 * MediaPipe Face Landmarker, running entirely in the browser via WASM. No
 * video frame or image ever leaves the device — only the derived numeric
 * metrics in behaviorMetrics.ts do, and only if the caller chooses to send
 * them to the report endpoint.
 *
 * Explicitly NOT using YOLO or any object-detection model: this is about the
 * user's own face/head behavior, not detecting objects in the room, so a
 * face-landmark model is the right-sized tool and YOLO would be unused weight.
 *
 * Sampling, not every frame: analyzing 30-60fps of video is wasted work for
 * signals (head orientation, blink rate) that don't change that fast. We
 * sample a few times a second — see behaviorMetrics.ts's SAMPLE_INTERVAL_MS.
 */

import type { FaceLandmarker } from "@mediapipe/tasks-vision";

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

async function loadLandmarker(): Promise<FaceLandmarker> {
  if (landmarkerPromise) return landmarkerPromise;

  landmarkerPromise = (async () => {
    const vision = await import("@mediapipe/tasks-vision");
    // WasmFileset isn't exported by the package, only used internally by its own
    // types — so the fileset is typed structurally from what forVisionTasks
    // actually returns, rather than naming a type we can't import.
    const fileset = await vision.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    return vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
  })();

  return landmarkerPromise;
}

export interface FaceSample {
  present: boolean;
  /** Approximate yaw in degrees, derived from the facial transform matrix. 0 = facing camera. */
  yawDegrees: number;
  /** Blendshape scores for eye closure, used to detect blinks. */
  leftEyeBlink: number;
  rightEyeBlink: number;
  timestamp: number;
}

function yawFromMatrix(m: number[]): number {
  // Column-major 4x4. The (0,2) / (2,2) pair gives yaw for a rotation matrix
  // in this convention; good enough for a coarse "facing camera or not" signal
  // — this is a wellness/coaching cue, not a precision tracking system.
  const r02 = m[8];
  const r22 = m[10];
  return (Math.atan2(r02, r22) * 180) / Math.PI;
}

export async function detectFace(video: HTMLVideoElement, timestampMs: number): Promise<FaceSample | null> {
  try {
    const landmarker = await loadLandmarker();
    const result = landmarker.detectForVideo(video, timestampMs);

    if (!result.faceLandmarks?.length) {
      return { present: false, yawDegrees: 0, leftEyeBlink: 0, rightEyeBlink: 0, timestamp: timestampMs };
    }

    const matrix = result.facialTransformationMatrixes?.[0]?.data;
    const yaw = matrix ? yawFromMatrix(matrix) : 0;

    const blendshapes = result.faceBlendshapes?.[0]?.categories ?? [];
    const find = (name: string) => blendshapes.find((c) => c.categoryName === name)?.score ?? 0;

    return {
      present: true,
      yawDegrees: yaw,
      leftEyeBlink: find("eyeBlinkLeft"),
      rightEyeBlink: find("eyeBlinkRight"),
      timestamp: timestampMs,
    };
  } catch {
    // Model failed to load or run (e.g. no GPU delegate, blocked CDN). Treated
    // as "no signal this frame" rather than crashing the session — camera
    // analysis is optional and its failure must never take the conversation
    // down with it.
    return null;
  }
}
