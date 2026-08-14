/**
 * speechRecognition.ts
 * ---------------------------------------------------------------------------
 * Wraps SpeechRecognition (Chrome/Safari only — no Firefox support at all) so
 * the rest of the app depends on a small stable interface, not a vendor-
 * prefixed browser API. Whoever calls this receives { text, startTime,
 * endTime } regardless of whether the words came from the mic or the typed
 * fallback in ConversationController.
 *
 * Known limitations, left visible on purpose rather than hidden:
 *  - Chrome streams audio to Google's servers for recognition; this is not a
 *    fully local pipeline. Documented in the README, not just here.
 *  - Auto-stops on ~silence, which can cut off a slow talker mid-thought.
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
  return (w.SpeechRecognition as SpeechRecognitionCtor) ??
    (w.webkitSpeechRecognition as SpeechRecognitionCtor) ??
    null;
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
  recog.continuous = false;
  recog.interimResults = Boolean(opts.onInterim);
  recog.lang = opts.lang ?? "en-US";

  const startTime = performance.now();
  let settled = false;

  recog.onresult = (event: unknown) => {
    // SpeechRecognitionEvent isn't in lib.dom by default in this TS config;
    // narrow it locally rather than widening the global type.
    const e = event as { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        settled = true;
        opts.onResult({
          text: r[0].transcript.trim(),
          startTime,
          endTime: performance.now(),
          isFinal: true,
        });
      } else {
        opts.onInterim?.(r[0].transcript);
      }
    }
  };

  recog.onerror = (event: unknown) => {
    const code = (event as { error?: string }).error;
    if (code === "no-speech") opts.onError("no-speech");
    else if (code === "not-allowed" || code === "service-not-allowed") opts.onError("not-allowed");
    else if (code === "network") opts.onError("network");
    else if (code === "aborted") opts.onError("aborted");
    else opts.onError("network");
  };

  recog.onend = () => opts.onEnd();

  try {
    recog.start();
  } catch {
    opts.onError("network");
    return null;
  }

  return { stop: () => recog.stop() };
}
