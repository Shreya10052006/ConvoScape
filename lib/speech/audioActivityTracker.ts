/**
 * audioActivityTracker.ts
 * ---------------------------------------------------------------------------
 * Lightweight browser-side Web Audio API Voice Activity & Pause Detector (VAD).
 *
 * Responsibilities:
 * - STT is responsible for the WORDS.
 * - AudioActivityTracker is responsible for PAUSES & SILENCE TIMINGS.
 *
 * Runs non-blocking audio energy analysis directly from the microphone
 * MediaStream to capture real pause and silence behavior without guessing from STT.
 */

import type { AudioPauseTiming } from "@/lib/session/sessionTypes";

const SHORT_PAUSE_MS = 500;  // 0.5s pause threshold
const LONG_PAUSE_MS = 2000;  // 2.0s long pause threshold
const VOICE_ENERGY_THRESHOLD = 0.015; // RMS audio energy threshold

export class AudioActivityTracker {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private intervalId: number | null = null;

  private turnStartTime: number = 0;
  private speechStartTime: number | null = null;
  private speechEndTime: number | null = null;
  private isCurrentlySpeaking: boolean = false;
  private lastSpeechOffsetTime: number | null = null;
  private speechActiveMs: number = 0;
  private lastSampleTime: number = 0;

  private pauses: number[] = []; // pause durations in ms
  private longPauses: number[] = []; // long pause durations in ms

  private isAudioVadActive: boolean = false;

  /**
   * Start tracking audio activity for a new answer turn.
   */
  public start(stream?: MediaStream | null): void {
    this.reset();
    this.turnStartTime = performance.now();
    this.lastSampleTime = this.turnStartTime;

    if (typeof window === "undefined" || !stream) {
      return;
    }

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextClass) return;

      const audioCtx = new AudioContextClass();
      if (audioCtx.state === "suspended") {
        void audioCtx.resume();
      }

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.2;

      const sourceNode = audioCtx.createMediaStreamSource(stream);
      sourceNode.connect(analyser);

      this.audioCtx = audioCtx;
      this.analyser = analyser;
      this.sourceNode = sourceNode;
      this.isAudioVadActive = true;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      // Lightweight polling loop every 50ms
      this.intervalId = window.setInterval(() => {
        if (!this.analyser) return;

        this.analyser.getByteTimeDomainData(dataArray);
        const now = performance.now();
        const delta = Math.max(0, now - this.lastSampleTime);
        this.lastSampleTime = now;

        // Calculate RMS energy
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const norm = (dataArray[i] - 128) / 128;
          sum += norm * norm;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const isSpeaking = rms > VOICE_ENERGY_THRESHOLD;

        if (isSpeaking) {
          this.speechEndTime = now;
          this.speechActiveMs += delta;

          if (this.speechStartTime === null) {
            this.speechStartTime = now;
          }

          if (!this.isCurrentlySpeaking) {
            // Transition: silence -> speaking
            if (this.lastSpeechOffsetTime !== null) {
              const pauseDuration = now - this.lastSpeechOffsetTime;
              if (pauseDuration >= SHORT_PAUSE_MS) {
                this.pauses.push(pauseDuration);
                if (pauseDuration >= LONG_PAUSE_MS) {
                  this.longPauses.push(pauseDuration);
                }
              }
              this.lastSpeechOffsetTime = null;
            }
            this.isCurrentlySpeaking = true;
          }
        } else {
          if (this.isCurrentlySpeaking) {
            // Transition: speaking -> silence
            this.isCurrentlySpeaking = false;
            this.lastSpeechOffsetTime = now;
          }
        }
      }, 50);
    } catch (e) {
      console.warn("[AudioActivityTracker] Could not initialize Web Audio VAD:", e);
      this.isAudioVadActive = false;
    }
  }

  /**
   * Stop tracking audio activity and compute detailed pause timing metrics.
   */
  public stop(fallbackStartTime?: number, fallbackEndTime?: number): AudioPauseTiming {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const turnEndTime = performance.now();

    // Check if ended during a pause
    if (this.lastSpeechOffsetTime !== null && this.speechStartTime !== null) {
      const trailingPause = turnEndTime - this.lastSpeechOffsetTime;
      // Discount final 1.4s silence finalization buffer if it matches recognizer timeout
      const effectivePause = Math.max(0, trailingPause - 1000);
      if (effectivePause >= SHORT_PAUSE_MS) {
        this.pauses.push(effectivePause);
        if (effectivePause >= LONG_PAUSE_MS) {
          this.longPauses.push(effectivePause);
        }
      }
    }

    try {
      this.sourceNode?.disconnect();
      if (this.audioCtx && this.audioCtx.state !== "closed") {
        void this.audioCtx.close();
      }
    } catch {}

    const totalDurationSeconds =
      Math.max(0.1, (turnEndTime - (this.turnStartTime || fallbackStartTime || turnEndTime))) / 1000;

    let silenceDurationSeconds = this.pauses.reduce((a, b) => a + b, 0) / 1000;
    let speakingDurationSeconds = Math.max(
      0,
      this.speechActiveMs > 0 ? this.speechActiveMs / 1000 : totalDurationSeconds - silenceDurationSeconds
    );

    // If VAD wasn't active or produced 0, fallback gracefully
    if (!this.isAudioVadActive) {
      const st = fallbackStartTime ?? this.turnStartTime;
      const et = fallbackEndTime ?? turnEndTime;
      const durSec = Math.max(0.1, (et - st) / 1000);
      return {
        speechStartTime: st,
        speechEndTime: et,
        totalDurationSeconds: Math.round(durSec * 10) / 10,
        speakingDurationSeconds: Math.round(durSec * 10) / 10,
        silenceDurationSeconds: 0,
        pauseCount: 0,
        longPauseCount: 0,
        longPauseDurations: [],
        longestPauseSeconds: 0,
        avgPauseDurationSeconds: 0,
        isAudioVad: false,
      };
    }

    const avgPauseSec =
      this.pauses.length > 0
        ? Math.round((this.pauses.reduce((a, b) => a + b, 0) / this.pauses.length / 1000) * 10) / 10
        : 0;

    const longestPauseSec =
      this.pauses.length > 0 ? Math.round((Math.max(...this.pauses) / 1000) * 10) / 10 : 0;

    const timing: AudioPauseTiming = {
      speechStartTime: this.speechStartTime ?? (fallbackStartTime ?? null),
      speechEndTime: this.speechEndTime ?? (fallbackEndTime ?? null),
      totalDurationSeconds: Math.round(totalDurationSeconds * 10) / 10,
      speakingDurationSeconds: Math.round(speakingDurationSeconds * 10) / 10,
      silenceDurationSeconds: Math.round(silenceDurationSeconds * 10) / 10,
      pauseCount: this.pauses.length,
      longPauseCount: this.longPauses.length,
      longPauseDurations: this.longPauses.map((p) => Math.round((p / 1000) * 10) / 10),
      longestPauseSeconds: longestPauseSec,
      avgPauseDurationSeconds: avgPauseSec,
      isAudioVad: true,
    };

    return timing;
  }

  private reset(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.audioCtx = null;
    this.analyser = null;
    this.sourceNode = null;
    this.speechStartTime = null;
    this.speechEndTime = null;
    this.isCurrentlySpeaking = false;
    this.lastSpeechOffsetTime = null;
    this.speechActiveMs = 0;
    this.pauses = [];
    this.longPauses = [];
    this.isAudioVadActive = false;
  }
}
