/**
 * sessionRecorder.ts
 * ---------------------------------------------------------------------------
 * Records the user's camera to a local Blob using MediaRecorder.
 *
 * PRIVACY POSITION, stated plainly because it's the whole point: the recording
 * never leaves the browser. It is not uploaded, not sent to Gemini, not written
 * to a server. It lives as an in-memory Blob for the session and is offered
 * back to the user as a playback source and a download. Sending video to a
 * model would cost tokens, add a huge upload, and buy nothing the face-landmark
 * metrics don't already provide locally.
 *
 * Codec selection is a negotiation, not an assumption — Safari and Chrome
 * disagree about what they'll record, so we ask the browser what it supports
 * rather than hardcoding webm/vp9 and failing silently on Safari.
 */

const CANDIDATE_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return CANDIDATE_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

export function isRecordingSupported(): boolean {
  return typeof MediaRecorder !== "undefined" && pickMimeType() !== undefined;
}

export class SessionRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mimeType: string | undefined;

  start(stream: MediaStream): boolean {
    if (!isRecordingSupported()) return false;
    try {
      this.mimeType = pickMimeType();
      this.recorder = new MediaRecorder(stream, this.mimeType ? { mimeType: this.mimeType } : undefined);
      this.chunks = [];
      this.recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      // Timeslice so we accumulate chunks progressively; if the tab crashes
      // mid-session we still hold everything up to the last second.
      this.recorder.start(1000);
      return true;
    } catch {
      this.recorder = null;
      return false;
    }
  }

  get isRecording(): boolean {
    return this.recorder?.state === "recording";
  }

  /** Resolves with the finished Blob, or null if nothing was captured. */
  stop(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const rec = this.recorder;
      if (!rec || rec.state === "inactive") {
        resolve(this.chunks.length ? new Blob(this.chunks, { type: this.mimeType }) : null);
        return;
      }
      rec.onstop = () => {
        resolve(this.chunks.length ? new Blob(this.chunks, { type: this.mimeType }) : null);
        this.recorder = null;
      };
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    });
  }
}
