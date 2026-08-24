/**
 * speechSynthesis.ts
 * ---------------------------------------------------------------------------
 * Wraps window.speechSynthesis. Three problems this specifically works around:
 *
 * 1. VOICE AVAILABILITY VARIES BY OS. There's no guarantee of three distinct
 *    voices existing. We pick from whatever is installed and differentiate
 *    Rahul/Judge 1/Judge 2 by pitch and rate as a fallback, not just by voice
 *    selection.
 *
 * 2. LONG UTTERANCES GET SILENTLY TRUNCATED in some browsers around ~200
 *    characters. We chunk on sentence boundaries and speak sequentially.
 *
 * 3. BARGE-IN. The mic will hear the speakers unless muted during playback.
 *    This module exposes onStart/onEnd so the caller (ConversationController)
 *    can hard-mute recognition for the duration and re-arm on true completion,
 *    not on a guess.
 */

export type CharacterVoice = "rahul" | "judge1" | "judge2";

/**
 * Canonical Neural Voice assignments across ConvoScape:
 * - Rahul (Peer Student): en-US-GuyNeural
 * - Judge 1 (Female Lead Judge): en-GB-SoniaNeural
 * - Judge 2 (Male Technical Judge): en-US-ChristopherNeural
 */
export const CHARACTER_NEURAL_VOICES: Record<CharacterVoice, string> = {
  rahul: "en-US-GuyNeural",
  judge1: "en-GB-SoniaNeural",
  judge2: "en-US-ChristopherNeural",
};

interface SpeakOptions {
  character: CharacterVoice;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
  onSpeakingChange?: (isSpeaking: boolean) => void;
}

const VOICE_TUNING: Record<CharacterVoice, { pitch: number; rate: number; preferMale: boolean }> = {
  rahul: { pitch: 1.02, rate: 1.03, preferMale: true },
  judge1: { pitch: 1.05, rate: 0.98, preferMale: false },
  judge2: { pitch: 0.95, rate: 1.02, preferMale: true },
};

let cachedVoices: SpeechSynthesisVoice[] | null = null;

function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  const v = window.speechSynthesis.getVoices();
  if (v.length) cachedVoices = v;
  return cachedVoices ?? [];
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Call once, early, so voices are populated by the time Rahul first speaks —
 * some browsers load the voice list asynchronously after page load. */
export function primeVoices(): void {
  if (!isSpeechSynthesisSupported()) return;
  loadVoices();
  window.speechSynthesis.onvoiceschanged = () => loadVoices();
}

function pickVoice(character: CharacterVoice): SpeechSynthesisVoice | null {
  const voices = loadVoices().filter((v) => v.lang.startsWith("en"));
  if (!voices.length) return null;
  const tuning = VOICE_TUNING[character];

  const scored = voices
    .map((v) => {
      const name = v.name.toLowerCase();
      const looksGuy = name.includes("guy");
      const looksChristopher = name.includes("christopher");
      const looksSonia = name.includes("sonia");
      const looksMale = /male|david|mark|daniel|guy|christopher|ryan/.test(name) && !/female/.test(name);
      const looksFemale = /female|zira|susan|samantha|sonia|jenny|aria/.test(name);
      let score = 0;
      if (character === "rahul" && looksGuy) score += 10;
      if (character === "judge2" && looksChristopher) score += 10;
      if (character === "judge1" && looksSonia) score += 10;
      if (tuning.preferMale && looksMale) score += 2;
      if (!tuning.preferMale && looksFemale) score += 2;
      if (v.localService) score += 1;
      return { v, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.v ?? voices[0];
}

function splitSentences(text: string): string[] {
  // Clause splitting on commas, semicolons, colons, and sentence ends
  const parts = text.match(/[^,;:!?.]+[,,;:!?.]*/g) ?? [text];
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    if (out.length && t.length < 8 && !/[,;:!?.]/.test(out[out.length - 1])) {
      out[out.length - 1] += " " + t;
    } else {
      out.push(t);
    }
  }
  return out.length ? out : [text];
}

let activeUtterances: SpeechSynthesisUtterance[] = [];

export function stopSpeaking(): void {
  if (!isSpeechSynthesisSupported()) return;
  window.speechSynthesis.cancel();
  activeUtterances = [];
}

export function speak(text: string, opts: SpeakOptions): void {
  if (!isSpeechSynthesisSupported()) {
    opts.onError?.();
    return;
  }
  stopSpeaking();
  const chunks = splitSentences(text);
  const voice = pickVoice(opts.character);
  const tuning = VOICE_TUNING[opts.character];

  let started = false;
  chunks.forEach((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk);
    if (voice) u.voice = voice;
    u.pitch = tuning.pitch;
    u.rate = tuning.rate;
    u.lang = "en-US";

    u.onstart = () => {
      if (i === 0) {
        started = true;
        opts.onStart?.();
      }
      opts.onSpeakingChange?.(true);
    };

    u.onend = () => {
      opts.onSpeakingChange?.(false);
      if (i === chunks.length - 1) {
        opts.onEnd?.();
      }
    };

    u.onerror = () => {
      opts.onSpeakingChange?.(false);
      if (i === chunks.length - 1) {
        if (!started) opts.onError?.();
        else opts.onEnd?.();
      }
    };

    activeUtterances.push(u);
    window.speechSynthesis.speak(u);
  });
}
