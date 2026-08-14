/**
 * cameraManager.ts
 * ---------------------------------------------------------------------------
 * Thin wrapper around getUserMedia. The important behavior lives in the
 * caller, not here: this module NEVER requests the camera on its own — it
 * only exposes a function that must be called from a direct user action (the
 * "Enable Camera" button in CameraConsent.tsx). No component upstream of that
 * explicit tap may call requestCamera().
 */

export type CameraState = "CAMERA_OFF" | "CAMERA_REQUESTING" | "CAMERA_ON" | "CAMERA_DENIED" | "CAMERA_UNAVAILABLE";

export function isCameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export async function requestCameraStream(): Promise<MediaStream> {
  if (!isCameraSupported()) {
    throw new Error("Camera not supported in this browser.");
  }
  return navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: "user" },
    audio: false,
  });
}

export function stopCameraStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}
