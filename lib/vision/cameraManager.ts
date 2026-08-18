/**
 * cameraManager.ts
 * ---------------------------------------------------------------------------
 * Thin wrapper around getUserMedia requesting microphone and camera permissions
 * upfront before conversation starts.
 */

export type CameraState = "CAMERA_OFF" | "CAMERA_REQUESTING" | "CAMERA_ON" | "CAMERA_DENIED" | "CAMERA_UNAVAILABLE";

export function isCameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export async function requestMediaStream(withVideo = true): Promise<MediaStream> {
  if (!isCameraSupported()) {
    throw new Error("Media devices not supported in this browser.");
  }
  if (withVideo) {
    return navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: "user" },
      audio: true,
    });
  } else {
    return navigator.mediaDevices.getUserMedia({
      audio: true,
    });
  }
}

export async function requestCameraStream(): Promise<MediaStream> {
  return requestMediaStream(true);
}

export function stopCameraStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}
