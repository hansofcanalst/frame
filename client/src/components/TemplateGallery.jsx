import { useRef, useState } from 'react';

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({ template, onSelect, onEdit }) {
  const videoRef  = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [imgError, setImgError] = useState(false);

  const hasVideo = Boolean(template.previewVideo);
  const hasThumb = Boolean(template.previewThumbnail) && !imgError;

  const handleMouseEnter = () => {
    if (!hasVideo) return;
    const v = videoRef.current;
    if (v) {
      v.currentTime = 0;
      v.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const handleMouseLeave = () => {
    if (!hasVideo) return;
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
      setPlaying(false);
    }
  };

  return (
    <button
      onClick={() => onSelect(template)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="bg-surface-800 border border-border rounded-xl overflow-hidden cursor-pointer hover:border-accent transition-all group text-left w-full"
    >
      {/* Preview area */}
      <div className="relative w-full bg-surface-950 overflow-hidden" style={{ aspectRatio: '9/16', maxHeight: 220 }}>

        {/* Thumbnail image — always rendered, hidden when video plays */}
        {hasThumb && (
          <img
            src={template.previewThumbnail}
            alt={template.name}
            onError={() => setImgError(true)}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${playing ? 'opacity-0' : 'opacity-100'}`}
          />
        )}

        {/* Preview video — muted, loops, plays on hover */}
        {hasVideo && (
          <video
            ref={videoRef}
            src={template.previewVideo}
            muted
            loop
            playsInline
            preload="none"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${playing ? 'opacity-100' : 'opacity-0'}`}
          />
        )}

        {/* Placeholder icon — shown when there's no thumbnail and video isn't playing */}
        {!hasThumb && !playing && (
          <div className="absolute inset-0 flex items-center justify-center">
            {hasVideo ? (
              /* Play hint when video preview exists but isn't playing yet */
              <div className="flex flex-col items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                <svg className="w-10 h-10 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
                <span className="text-accent text-xs font-medium">Hover to preview</span>
              </div>
            ) : (
              /* Generic film icon when no preview assets exist */
              <svg className="w-10 h-10 text-accent opacity-40 group-hover:opacity-70 transition-opacity"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M3.375 3h17.25A.375.375 0 0121 3.375v17.25A.375.375 0 0120.625 21H3.375A.375.375 0 013 20.625V3.375A.375.375 0 013.375 3z" />
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M6 6h.75M6 9h.75M6 12h.75M6 15h.75M6 18h.75M17.25 6h.75M17.25 9h.75M17.25 12h.75M17.25 15h.75M17.25 18h.75M9 3v18M15 3v18" />
              </svg>
            )}
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-surface-950/80 via-transparent to-transparent pointer-events-none" />

        {/* Badges + Edit button */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          <span className="bg-accent/90 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
            {template.clipSlots?.length ?? 0} clips
          </span>
          {onEdit && (
            <button
              onClick={e => { e.stopPropagation(); onEdit(template); }}
              title="Edit template"
              className="bg-black/60 hover:bg-accent text-white rounded-full p-1.5 transition-all
                opacity-0 group-hover:opacity-100"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897
                     1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
              </svg>
            </button>
          )}
        </div>

        {/* Playing indicator */}
        {playing && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-white text-xs font-mono">preview</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-ink font-semibold text-sm group-hover:text-accent transition-colors leading-snug">
            {template.name}
          </h3>
          {template.format && (
            <span className="text-ink-dim text-xs font-mono shrink-0 mt-0.5">
              {template.format.fps}fps
            </span>
          )}
        </div>
        <p
          className="text-ink-muted text-xs leading-relaxed"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {template.description}
        </p>
        {template.format && (
          <p className="text-ink-dim text-xs font-mono pt-0.5">
            {template.format.width}×{template.format.height}
          </p>
        )}
        {/* Tags */}
        {template.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {template.tags.map(tag => (
              <span key={tag} className="text-ink-dim text-xs px-1.5 py-0.5 bg-surface-700 rounded-md">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

// ── Gallery ───────────────────────────────────────────────────────────────────

/**
 * TemplateGallery
 * Props:
 *   templates: object[]
 *   onSelect:  (template) => void   — use this template in the builder
 *   onEdit:    (template) => void   — open this template in the editor (optional)
 *   onNew:     () => void           — create a new template (optional)
 */
export default function TemplateGallery({ templates, onSelect, onEdit, onNew }) {
  const empty = !templates || templates.length === 0;

  return (
    <div className="space-y-5">
      {/* Toolbar row */}
      {onNew && (
        <div className="flex justify-end">
          <button
            onClick={onNew}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-800 border border-border
              text-ink-muted text-sm hover:text-ink hover:border-accent/50 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Template
          </button>
        </div>
      )}

      {empty ? (
        <div className="text-center py-20">
          <svg className="w-12 h-12 text-ink-dim mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M3.375 3h17.25A.375.375 0 0121 3.375v17.25A.375.375 0 0120.625 21H3.375A.375.375 0 013 20.625V3.375A.375.375 0 013.375 3z" />
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M9 3v18M15 3v18M3 9h18M3 15h18" />
          </svg>
          <p className="text-ink-muted mt-4 text-sm">No templates yet.</p>
          {onNew
            ? <button onClick={onNew} className="text-accent text-xs mt-2 hover:underline">Create your first template →</button>
            : <p className="text-ink-dim text-xs mt-1">Add a JSON file to <code className="text-accent">server/templates/</code></p>
          }
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onSelect={onSelect}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
