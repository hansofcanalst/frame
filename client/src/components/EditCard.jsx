import { useState } from 'react';

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="w-8 h-8 text-white drop-shadow-lg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  );
}

// Skeleton card shown while an edit is processing
export function EditCardSkeleton({ name }) {
  return (
    <div className="card animate-pulse flex flex-col">
      <div className="aspect-video bg-surface-700 flex items-center justify-center">
        <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
      </div>
      <div className="p-4 space-y-2">
        <div className="h-4 bg-surface-700 rounded w-2/3" />
        <div className="h-3 bg-surface-700 rounded w-full" />
        <div className="h-3 bg-surface-700 rounded w-3/4" />
      </div>
    </div>
  );
}

export default function EditCard({ edit, index }) {
  const [videoOpen, setVideoOpen] = useState(false);
  const isVideo = edit.outputUrl?.endsWith('.mp4');

  const fileName = `${edit.name.replace(/\s+/g, '-').toLowerCase()}-edit${isVideo ? '.mp4' : '.jpg'}`;

  return (
    <div className="card group flex flex-col animate-fade-up hover:border-border-light transition-colors duration-200"
      style={{ animationDelay: `${index * 60}ms` }}>

      {/* Preview */}
      <div className="relative aspect-video bg-surface-900 overflow-hidden">
        {isVideo ? (
          <>
            {videoOpen ? (
              <video
                src={edit.outputUrl}
                className="w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
                controls
              />
            ) : (
              <>
                <img
                  src={edit.thumbUrl}
                  alt={edit.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <button
                  onClick={() => setVideoOpen(true)}
                  className="absolute inset-0 flex items-center justify-center bg-black/30
                    opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                >
                  <div className="w-14 h-14 rounded-full bg-black/60 border border-white/20 flex items-center justify-center backdrop-blur-sm">
                    <PlayIcon />
                  </div>
                </button>
              </>
            )}
            {/* Video badge */}
            <span className="absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-mono bg-black/70 text-white/70 backdrop-blur-sm">
              VIDEO
            </span>
          </>
        ) : (
          <img
            src={edit.outputUrl}
            alt={edit.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}

        {/* Index badge */}
        <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 text-white/70 text-xs font-mono flex items-center justify-center backdrop-blur-sm">
          {index + 1}
        </span>
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <h3 className="text-ink font-semibold text-sm leading-tight">{edit.name}</h3>
          {edit.description && (
            <p className="text-ink-muted text-xs mt-1 leading-relaxed line-clamp-2">{edit.description}</p>
          )}
        </div>

        <a
          href={edit.outputUrl}
          download={fileName}
          className="mt-auto btn-ghost text-xs px-3 py-1.5 justify-center"
          onClick={e => e.stopPropagation()}
        >
          <DownloadIcon />
          Download
        </a>
      </div>
    </div>
  );
}
