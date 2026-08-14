"use client";

/**
 * QuestionBreakdown.tsx
 * ---------------------------------------------------------------------------
 * The most useful part of the report, and the part a score alone can't do:
 * for each significant judge question, what they were actually probing for,
 * what the answer did and didn't deliver, and a rewrite using the user's OWN
 * project.
 *
 * Collapsed by default. Five expanded blocks of critique arriving at once reads
 * as a wall of things you got wrong; letting the user open them one at a time
 * makes the same content feel like something to work through.
 */

import { useState } from "react";
import type { QuestionBreakdown as Item } from "@/lib/session/sessionTypes";

export default function QuestionBreakdown({ items }: { items: Item[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              <span className="mt-0.5 font-mono text-[10px] text-neutral-600">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 text-sm leading-snug text-neutral-100">{item.question}</span>
              <span className={`mt-1 text-neutral-500 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                ⌄
              </span>
            </button>

            {isOpen && (
              <div className="space-y-3.5 border-t border-white/[0.07] px-4 py-4 text-sm leading-relaxed">
                <Row label="What they were testing" tone="neutral">{item.whatTheJudgeWasTesting}</Row>
                <Row label="Your answer" tone="neutral">{item.answerSummary}</Row>
                {item.whatWasGood && <Row label="What worked" tone="good">{item.whatWasGood}</Row>}
                {item.whatWasWeak && <Row label="What was weak" tone="gap">{item.whatWasWeak}</Row>}
                {item.strongerAnswer && (
                  <div className="rounded-md border border-sky-500/25 bg-sky-500/[0.06] p-3.5">
                    <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-sky-400">
                      A stronger version
                    </p>
                    <p className="text-neutral-100">{item.strongerAnswer}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Row({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "neutral" | "good" | "gap";
  children: React.ReactNode;
}) {
  const colour =
    tone === "good" ? "text-emerald-400" : tone === "gap" ? "text-amber-400" : "text-neutral-500";
  return (
    <div>
      <p className={`mb-1 font-mono text-[10px] uppercase tracking-[0.2em] ${colour}`}>{label}</p>
      <p className="text-neutral-200">{children}</p>
    </div>
  );
}
