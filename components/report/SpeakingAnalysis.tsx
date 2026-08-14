import type { SpeechMetrics } from "@/lib/session/sessionTypes";

export default function SpeakingAnalysis({
  metrics,
  narrative,
}: {
  metrics: SpeechMetrics;
  narrative: string;
}) {
  const fillers = Object.entries(metrics.fillerWordCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <p className="text-neutral-300">{narrative}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Avg words / answer" value={metrics.avgWordsPerResponse.toFixed(0)} />
        <Stat
          label="Pace"
          value={metrics.wordsPerMinute != null ? `${metrics.wordsPerMinute.toFixed(0)} wpm` : "—"}
        />
        <Stat label="Avg response time" value={`${(metrics.avgResponseTimeMs / 1000).toFixed(1)}s`} />
        <Stat label="Long pauses" value={String(metrics.longPauseCount)} />
      </div>

      {fillers.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">Filler words</p>
          <div className="flex flex-wrap gap-2">
            {fillers.map(([word, count]) => (
              <span
                key={word}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-neutral-300"
              >
                {word} × {count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">{label}</p>
      <p className="mt-1 text-lg text-neutral-100">{value}</p>
    </div>
  );
}
