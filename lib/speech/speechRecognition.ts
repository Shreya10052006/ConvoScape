/**
 * speechRecognition.ts
 * ---------------------------------------------------------------------------
 * High-performance, robust SpeechRecognition wrapper with real-time continuous
 * streaming, live interim transcription feedback, and auto-silence finalization.
 */

export interface RecognitionResult {
  text: string;
  startTime: number;
  endTime: number;
  isFinal: true;
}

export interface SpeechRecognitionHandle {
  stop: () => void;
}

interface StartOptions {
  onResult: (r: RecognitionResult) => void;
  onInterim?: (text: string) => void;
  onError: (reason: "no-speech" | "not-allowed" | "network" | "unsupported" | "aborted") => void;
  onEnd: () => void;
  lang?: string;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
}

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (
    (w.SpeechRecognition as SpeechRecognitionCtor) ??
    (w.webkitSpeechRecognition as SpeechRecognitionCtor) ??
    null
  );
}

export function isSpeechRecognitionSupported(): boolean {
  return getCtor() !== null;
}

export function startSpeechRecognition(opts: StartOptions): SpeechRecognitionHandle | null {
  const Ctor = getCtor();
  if (!Ctor) {
    opts.onError("unsupported");
    return null;
  }

  const recog = new Ctor();
  recog.continuous = true;
  recog.interimResults = true;
  recog.lang = opts.lang ?? "en-US";

  const startTime = performance.now();
  let settled = false;
  let accumulatedFinalText = "";
  let silenceTimeout: ReturnType<typeof setTimeout> | null = null;

  const commitResult = () => {
    if (settled) return;
    const finalTrimmed = accumulatedFinalText.trim();
    if (finalTrimmed) {
      settled = true;
      try {
        recog.stop();
      } catch {}
      opts.onResult({
        text: finalTrimmed,
        startTime,
        endTime: performance.now(),
        isFinal: true,
      });
    }
  };

  const resetSilenceTimer = () => {
    if (silenceTimeout) clearTimeout(silenceTimeout);
    silenceTimeout = setTimeout(() => {
      commitResult();
    }, 1400); // 1.4s of natural pause to finalize answer
  };

  recog.onresult = (event: unknown) => {
    const e = event as {
      resultIndex?: number;
      results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
    };
    let currentInterim = "";

    const startIndex = typeof e.resultIndex === "number" ? e.resultIndex : 0;
    for (let i = startIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        accumulatedFinalText += (accumulatedFinalText ? " " : "") + r[0].transcript.trim();
      } else {
        currentInterim += (currentInterim ? " " : "") + r[0].transcript.trim();
      }
    }

    const fullTranscript = (accumulatedFinalText + (currentInterim ? " " + currentInterim : "")).trim();
    if (fullTranscript) {
      opts.onInterim?.(fullTranscript);
      resetSilenceTimer();
    }
  };

  recog.onerror = (event: unknown) => {
    const code = (event as { error?: string }).error;
    if (code === "no-speech") {
      // Natural silence during contemplation — do not abort
      return;
    }
    if (code === "not-allowed" || code === "service-not-allowed") {
      opts.onError("not-allowed");
    } else if (code === "aborted") {
      opts.onError("aborted");
    } else {
      opts.onError("network");
    }
  };

  recog.onend = () => {
    if (silenceTimeout) clearTimeout(silenceTimeout);
    if (!settled && accumulatedFinalText.trim()) {
      commitResult();
    } else {
      opts.onEnd();
    }
  };

  try {
    recog.start();
  } catch {
    opts.onError("network");
    return null;
  }

  return {
    stop: () => {
      if (silenceTimeout) clearTimeout(silenceTimeout);
      settled = true;
      try {
        recog.stop();
      } catch {}
    },
  };
}
