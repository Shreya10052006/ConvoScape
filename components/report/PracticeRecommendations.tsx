export default function PracticeRecommendations({
  howToPractice,
  onRestart,
}: {
  howToPractice: string;
  onRestart: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
          How to practice
        </p>
        <p className="text-sm leading-relaxed text-neutral-200">{howToPractice}</p>
      </div>

      <button
        onClick={onRestart}
        className="rounded-full bg-sky-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
      >
        Try Again
      </button>
    </div>
  );
}
