export default function Progress({ status, plannedEdits, completedEdits, totalEdits }) {
  const steps = [
    { key: 'uploading', label: 'Upload' },
    { key: 'analyzing', label: 'AI Analysis' },
    { key: 'processing', label: 'Processing' },
  ];

  const currentStepIndex = steps.findIndex(s => s.key === status);
  const pct = totalEdits > 0
    ? Math.round((completedEdits / totalEdits) * 100)
    : status === 'analyzing' ? 40 : status === 'uploading' ? 10 : 0;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 animate-fade-up">
      {/* Step indicators */}
      <div className="flex items-center justify-center gap-0">
        {steps.map((step, i) => {
          const done = i < currentStepIndex;
          const active = i === currentStepIndex;
          return (
            <div key={step.key} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500
                  ${done ? 'bg-accent text-white' : active ? 'bg-accent-muted border-2 border-accent text-accent' : 'bg-surface-700 border border-border text-ink-dim'}`}>
                  {done ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : active ? (
                    <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  ) : (
                    i + 1
                  )}
                </div>
                <span className={`text-xs font-medium ${active ? 'text-violet-400' : done ? 'text-ink-muted' : 'text-ink-dim'}`}>
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`w-16 h-px mx-1 mb-5 transition-all duration-500 ${i < currentStepIndex ? 'bg-accent' : 'bg-border'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs text-ink-muted">
          <span className="font-mono">
            {status === 'uploading' && 'Uploading file…'}
            {status === 'analyzing' && 'Claude is analyzing your media…'}
            {status === 'processing' && plannedEdits.length > 0 && (
              <>Processing: <span className="text-violet-400 font-medium">
                {plannedEdits[completedEdits]?.name ?? 'finalizing'}
              </span></>
            )}
          </span>
          <span className="font-mono text-violet-400">{pct}%</span>
        </div>
        <div className="h-1 bg-surface-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full shimmer-bar transition-all duration-700"
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        </div>
        {totalEdits > 0 && (
          <p className="text-xs text-ink-dim text-right font-mono">
            {completedEdits} / {totalEdits} edits
          </p>
        )}
      </div>

      {/* Planned edit chips */}
      {plannedEdits.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {plannedEdits.map((edit, i) => (
            <span key={i} className={`px-3 py-1 rounded-full text-xs font-mono font-medium border transition-all duration-300
              ${i < completedEdits
                ? 'bg-accent/20 border-accent/40 text-violet-300'
                : i === completedEdits
                ? 'bg-accent-muted border-accent text-white animate-pulse'
                : 'bg-surface-700 border-border text-ink-dim'
              }`}>
              {i < completedEdits && '✓ '}{edit.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
