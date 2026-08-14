import type { CoachingReport } from "@/lib/session/sessionTypes";

const LABELS: Array<[keyof CoachingReport["overall"], string]> = [
  ["communicationScore", "Communication"],
  ["technicalExplanationScore", "Technical Explanation"],
  ["clarityScore", "Clarity"],
  ["confidenceScore", "Confidence"],
  ["questionHandlingScore", "Question Handling"],
  ["specificityScore", "Specificity"],
  ["structureScore", "Structure"],
  ["relevanceScore", "Relevance"],
];

export default function ScoreCard({ overall }: { overall: CoachingReport["overall"] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {LABELS.map(([key, label]) => {
        const value = overall[key];
        return (
          <div key={key} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">{label}</p>
            <p className="mt-1.5 text-3xl font-light text-white">
              {value}
              <span className="text-base text-neutral-500">/10</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}
