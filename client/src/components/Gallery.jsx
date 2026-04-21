import EditCard, { EditCardSkeleton } from './EditCard.jsx';

export default function Gallery({ edits, plannedEdits, isProcessing }) {
  // Show completed edits + skeleton placeholders for pending
  const pendingCount = Math.max(0, plannedEdits.length - edits.length);

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="text-ink font-semibold text-lg">
          Generated Edits
          <span className="ml-3 text-ink-muted font-normal text-sm">
            {edits.length}{plannedEdits.length > 0 ? ` / ${plannedEdits.length}` : ''} ready
          </span>
        </h2>
        {edits.length > 0 && (
          <button
            className="btn-ghost text-xs py-1.5"
            onClick={() => {
              edits.forEach((edit, i) => {
                setTimeout(() => {
                  const a = document.createElement('a');
                  a.href = edit.outputUrl;
                  a.download = `${edit.name.replace(/\s+/g, '-').toLowerCase()}-edit${edit.outputUrl.endsWith('.mp4') ? '.mp4' : '.jpg'}`;
                  a.click();
                }, i * 400);
              });
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download all
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {edits.map((edit, i) => (
          <EditCard key={`${edit.name}-${i}`} edit={edit} index={i} />
        ))}
        {isProcessing && Array.from({ length: pendingCount }).map((_, i) => (
          <EditCardSkeleton
            key={`skeleton-${i}`}
            name={plannedEdits[edits.length + i]?.name ?? '…'}
          />
        ))}
      </div>
    </div>
  );
}
