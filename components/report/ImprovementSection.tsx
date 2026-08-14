export function BulletList({ title, items, tone }: { title: string; items: string[]; tone: "good" | "gap" }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">{title}</p>
      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed text-neutral-200">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone === "good" ? "bg-emerald-400" : "bg-amber-400"}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MostImportant({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-sky-500/30 bg-sky-500/[0.06] p-5">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-sky-400">
        Most important improvement
      </p>
      <p className="text-sm leading-relaxed text-neutral-100">{text}</p>
    </div>
  );
}
