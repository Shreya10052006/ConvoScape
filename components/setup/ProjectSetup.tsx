"use client";

/**
 * ProjectSetup.tsx
 * ---------------------------------------------------------------------------
 * The only conventional screen in the product, and it still shouldn't look like
 * a form. No card, no panel, no field boxes — questions asked one line at a
 * time against black, the way a stage manager would ask them before you go on.
 *
 * The design restraint here is load-bearing. If this screen looks like a SaaS
 * dashboard, the user enters the hall already knowing they're using a website.
 */

import { useState } from "react";
import type { ProjectContext } from "@/lib/session/sessionTypes";

export type { ProjectContext };

const QUESTIONS: Array<{
  key: keyof ProjectContext;
  prompt: string;
  hint: string;
  required: boolean;
  multiline?: boolean;
}> = [
  { key: "name", prompt: "What's the project called?", hint: "CareVista", required: true },
  { key: "domain", prompt: "What domain does it fall under?", hint: "HealthTech, FinTech, EdTech, Sustainability…", required: true },
  { key: "topic", prompt: "In a few words, what is it?", hint: "AI-powered rural telemedicine", required: true },
  { key: "problem", prompt: "What problem does it solve?", hint: "Lack of access to specialized care…", required: true, multiline: true },
  { key: "stack", prompt: "What did you build it with?", hint: "Tech Stack (Optional)", required: false },
];

export default function ProjectSetup({ onComplete }: { onComplete: (p: ProjectContext) => void }) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const q = QUESTIONS[step];
  const value = values[q.key] ?? "";
  const canAdvance = !q.required || value.trim().length > 1;

  const advance = () => {
    if (!canAdvance) return;
    if (step === QUESTIONS.length - 1) {
      onComplete({
        userName: values.userName || "Alex",
        college: values.college || "Tech University",
        name: values.name ?? "",
        domain: values.domain ?? "",
        topic: values.topic ?? "",
        description: values.topic || values.name || "",
        stack: values.stack,
        problem: values.problem,
      });
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    <main className="fixed inset-0 flex flex-col justify-center bg-black px-8 text-neutral-100 sm:px-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.4em] text-neutral-600">
        {String(step + 1).padStart(2, "0")} / {String(QUESTIONS.length).padStart(2, "0")}
      </p>

      <label htmlFor="answer" className="mt-4 max-w-2xl text-3xl font-light leading-tight sm:text-4xl">
        {q.prompt}
      </label>

      {q.multiline ? (
        <textarea
          id="answer"
          autoFocus
          rows={3}
          value={value}
          placeholder={q.hint}
          onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) advance();
          }}
          className="mt-8 max-w-2xl resize-none border-0 border-b border-neutral-800 bg-transparent pb-3 text-xl text-neutral-100 placeholder:text-neutral-700 focus:border-sky-400 focus:outline-none"
        />
      ) : (
        <input
          id="answer"
          autoFocus
          value={value}
          placeholder={q.hint}
          onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && advance()}
          className="mt-8 max-w-2xl border-0 border-b border-neutral-800 bg-transparent pb-3 text-xl text-neutral-100 placeholder:text-neutral-700 focus:border-sky-400 focus:outline-none"
        />
      )}

      <div className="mt-10 flex items-center gap-6">
        <button
          onClick={advance}
          disabled={!canAdvance}
          className="font-mono text-sm uppercase tracking-[0.2em] text-sky-400 disabled:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          {step === QUESTIONS.length - 1 ? "Walk in" : "Next"}
        </button>
        {!q.required && (
          <button
            onClick={() => setStep((s) => Math.min(s + 1, QUESTIONS.length - 1))}
            className="font-mono text-sm uppercase tracking-[0.2em] text-neutral-600 hover:text-neutral-400"
          >
            Skip
          </button>
        )}
        {step > 0 && (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="font-mono text-sm uppercase tracking-[0.2em] text-neutral-700 hover:text-neutral-500"
          >
            Back
          </button>
        )}
      </div>
    </main>
  );
}
