/**
 * faceLandmarks.ts
 * ---------------------------------------------------------------------------
 * MediaPipe Face Landmarker, running entirely in the browser via WASM.
 * No video frame, picture, or canvas ever leaves the client device.
 * Only lightweight mathematical aggregates are generated.
 *
 * Runs locally on periodic samples (3-4 Hz).
 */

import type { FaceLandmarker } from "@mediapipe/tasks-vision";

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

async function loadLandmarker(): Promise<FaceLandmarker> {
  if (landmarkerPromise) return landmarkerPromise;

  landmarkerPromise = (async () => {
    const vision = await import("@mediapipe/tasks-vision");
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
  /** Approximate yaw in degrees (negative = left, positive = right, ~0 = facing camera). */
  yawDegrees: number;
  /** Approximate pitch in degrees (negative = looking down, positive = looking up, ~0 = level). */
  pitchDegrees: number;
  /** Blendshape scores for eye closure [0..1]. */
  leftEyeBlink: number;
  rightEyeBlink: number;
  /** Gaze diversion score [0..1] derived from eyeLook blendshapes. */
  gazeAversionScore: number;
  timestamp: number;
}

function anglesFromMatrix(m: number[]): { yaw: number; pitch: number } {
  // Column-major 4x4 rotation matrix:
  // m[8] = R02, m[9] = R12, m[10] = R22
  const r02 = m[8];
  const r12 = m[9];
  const r22 = m[10];

  const yaw = (Math.atan2(r02, r22) * 180) / Math.PI;
  const pitch = (Math.atan2(-r12, Math.sqrt(r02 * r02 + r22 * r22)) * 180) / Math.PI;

  return { yaw, pitch };
}

export async function detectFace(
  video: HTMLVideoElement,
  timestampMs: number
): Promise<FaceSample | null> {
  try {
    const landmarker = await loadLandmarker();
    const result = landmarker.detectForVideo(video, timestampMs);

    if (!result.faceLandmarks?.length) {
      return {
        present: false,
        yawDegrees: 0,
        pitchDegrees: 0,
        leftEyeBlink: 0,
        rightEyeBlink: 0,
        gazeAversionScore: 0,
        timestamp: timestampMs,
      };
    }

    const matrix = result.facialTransformationMatrixes?.[0]?.data;
    const { yaw, pitch } = matrix ? anglesFromMatrix(matrix) : { yaw: 0, pitch: 0 };

    const blendshapes = result.faceBlendshapes?.[0]?.categories ?? [];
    const find = (name: string) => blendshapes.find((c) => c.categoryName === name)?.score ?? 0;

    const leftBlink = find("eyeBlinkLeft");
    const rightBlink = find("eyeBlinkRight");

    // Coarse eye gaze aversion estimation from blendshapes
    const lookOut = Math.max(find("eyeLookOutLeft"), find("eyeLookOutRight"));
    const lookIn = Math.max(find("eyeLookInLeft"), find("eyeLookInRight"));
    const lookDown = Math.max(find("eyeLookDownLeft"), find("eyeLookDownRight"));
    const lookUp = Math.max(find("eyeLookUpLeft"), find("eyeLookUpRight"));
    const gazeAversion = Math.max(lookOut, lookIn, lookDown, lookUp);

    return {
      present: true,
      yawDegrees: yaw,
      pitchDegrees: pitch,
      leftEyeBlink: leftBlink,
      rightEyeBlink: rightBlink,
      gazeAversionScore: gazeAversion,
      timestamp: timestampMs,
    };
  } catch {
    // MediaPipe unavailable or failed to execute — fail softly
    return null;
  }
}
