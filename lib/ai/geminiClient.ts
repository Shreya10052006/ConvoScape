/**
 * geminiClient.ts
 * ---------------------------------------------------------------------------
 * SERVER-ONLY. This file reads process.env.GEMINI_API_KEY, so it must never be
 * imported from a "use client" component — only from app/api/* route handlers,
 * which run on the server. Importing this from client code would either crash
 * (no env var in the browser bundle) or, worse if someone "fixed" that by
 * inlining the key, ship it to every visitor.
 *
 * Deliberately thin: one function that calls generateContent with an optional
 * JSON schema, and returns parsed structured output when a schema is given.
 * Higher-level prompt construction lives in conversationService /
 * judgeQuestionGenerator / reportService, not here.
 */

import "server-only";
import { extractJSON } from "./schemas";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiConfigError extends Error {}
export class GeminiRequestError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

interface GenerateOptions {
  systemInstruction: string;
  /** Prior turns, oldest first. Kept short by the caller — we do not send the
   * entire transcript on every call, only what's needed for context. */
  history: Array<{ role: "user" | "model"; text: string }>;
  userMessage: string;
  /** When set, requests application/json output constrained to this schema. */
  responseSchema?: object;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

function requireApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new GeminiConfigError(
      "GEMINI_API_KEY is not set. Add it to .env.local (see .env.example) and restart the dev server."
    );
  }
  return key;
}

export async function generateContent(opts: GenerateOptions): Promise<string> {
  const key = requireApiKey();

  const contents = [
    ...opts.history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: "user" as const, parts: [{ text: opts.userMessage }] },
  ];

  const body: Record<string, unknown> = {
    system_instruction: { parts: [{ text: opts.systemInstruction }] },
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.8,
      maxOutputTokens: opts.maxOutputTokens ?? 1200,
      ...(opts.responseSchema
        ? { responseMimeType: "application/json", responseSchema: opts.responseSchema }
        : {}),
    },
  };

  // Without a timeout a hung upstream request holds the conversation forever
  // and the user just watches a silent scene. 30s is generous for Flash.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/${MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      // Keep this off any client cache; each turn is unique.
      cache: "no-store",
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new GeminiRequestError("Gemini request timed out.");
    }
    throw new GeminiRequestError(`Network error calling Gemini: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GeminiRequestError(`Gemini API returned ${res.status}: ${detail.slice(0, 300)}`, res.status);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
  };

  if (data.promptFeedback?.blockReason) {
    throw new GeminiRequestError(`Prompt blocked: ${data.promptFeedback.blockReason}`);
  }

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) {
    // A MAX_TOKENS finish with no text means the budget was spent before any
    // content came back — worth naming distinctly, since the fix is a bigger
    // maxOutputTokens rather than a retry.
    const reason = candidate?.finishReason ? ` (finishReason: ${candidate.finishReason})` : "";
    throw new GeminiRequestError(`Gemini returned an empty response${reason}.`);
  }
  return text;
}

/**
 * Structured generation with tolerant parsing, shape validation, and one
 * stricter retry.
 *
 * The old version here was `JSON.parse(raw)` with a single fence-stripping
 * fallback, and it is what produced the "Gemini response was not valid JSON"
 * error the user saw. Three things were wrong with it: it treated unparseable
 * text as fatal rather than retryable, it never checked the SHAPE of output
 * that did parse (so a missing `reply` field crashed a component instead), and
 * it put the raw model output into an error message that reached the UI.
 *
 * Now: extract → validate → on failure, retry once with an explicit correction
 * telling the model exactly what it got wrong. Callers that still fail get a
 * typed error and are expected to degrade gracefully rather than surface it.
 */
export async function generateJSON<T>(
  opts: GenerateOptions,
  validate: (value: unknown) => { ok: true; value: T } | { ok: false; issue: string }
): Promise<T> {
  const raw = await generateContent(opts);

  const first = extractJSON(raw);
  if (first !== null) {
    const result = validate(first);
    if (result.ok) return result.value;

    // Parsed but wrong shape — retry telling the model precisely what failed.
    const retryRaw = await generateContent({
      ...opts,
      temperature: 0.2,
      userMessage:
        `${opts.userMessage}\n\nYour previous response was rejected: ${result.issue}. ` +
        `Reply with ONLY a single valid JSON object matching the required schema. ` +
        `No markdown fences, no commentary before or after.`,
    });
    const retryParsed = extractJSON(retryRaw);
    if (retryParsed !== null) {
      const retryResult = validate(retryParsed);
      if (retryResult.ok) return retryResult.value;
    }
    throw new GeminiRequestError(`Model output did not match the expected schema: ${result.issue}`);
  }

  // Nothing JSON-shaped at all. One retry with a blunt instruction.
  const retryRaw = await generateContent({
    ...opts,
    temperature: 0.2,
    userMessage:
      `${opts.userMessage}\n\nRespond with ONLY a single valid JSON object. ` +
      `No markdown code fences, no explanation, no text before or after the JSON.`,
  });
  const parsed = extractJSON(retryRaw);
  if (parsed === null) {
    throw new GeminiRequestError("Model did not return parseable JSON after a retry.");
  }
  const result = validate(parsed);
  if (!result.ok) {
    throw new GeminiRequestError(`Model output did not match the expected schema: ${result.issue}`);
  }
  return result.value;
}

/** Adapts a Zod schema to the validator shape generateJSON expects. */
export function zodValidator<T>(schema: {
  safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } };
}) {
  return (value: unknown): { ok: true; value: T } | { ok: false; issue: string } => {
    const parsed = schema.safeParse(value);
    if (parsed.success) return { ok: true, value: parsed.data };
    const issue = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, issue };
  };
}
