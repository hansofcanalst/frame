import { useState, useEffect } from 'react';

// ── Constants ──────────────────────────────────────────────────────────────────

const PLATFORM_LABELS = {
  'ig-post':  'IG Post',
  'ig-story': 'IG Story',
  'tiktok':   'TikTok',
  'youtube':  'YouTube',
};

const STYLE_TAG_COLORS = {
  Classic:    'text-violet-400 border-violet-500/40 bg-violet-500/10',
  Neon:       'text-cyan-400   border-cyan-500/40   bg-cyan-500/10',
  Cinematic:  'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
  Vintage:    'text-amber-400  border-amber-500/40  bg-amber-500/10',
  Editorial:  'text-pink-400   border-pink-500/40   bg-pink-500/10',
  Minimal:    'text-gray-400   border-gray-500/40   bg-gray-500/10',
};

function getStyleTagColors(styleTag) {
  return STYLE_TAG_COLORS[styleTag] ?? 'text-ink-muted border-border bg-surface-700';
}

// ── Placeholder visual ─────────────────────────────────────────────────────────

function TemplatePlaceholder({ template }) {
  const firstSize = template.sizes?.[0];
  const w = firstSize?.width  ?? 1080;
  const h = firstSize?.height ?? 1080;
  const ratio = `${w}/${h}`;
  const multi = template.photoCount > 1;

  return (
    <div
      className="relative w-full bg-surface-700 overflow-hidden"
      style={{ aspectRatio: ratio, maxHeight: 220 }}
    >
      {/* Subtle gradient backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-surface-700 via-surface-800 to-surface-950" />

      {multi ? (
        /* Grid-like placeholder for multi-photo templates */
        <div
          className="absolute inset-0 p-2 grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${Math.min(template.photoCount, 3)}, 1fr)`,
            gridTemplateRows:    template.photoCount > 3 ? '1fr 1fr' : '1fr',
          }}
        >
          {Array.from({ length: template.photoCount }).map((_, i) => (
            <div
              key={i}
              className="rounded bg-surface-600/60 flex items-center justify-center"
            >
              <svg
                className="w-4 h-4 text-ink-dim opacity-50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 18h16.5M3.75 6h16.5"
                />
              </svg>
            </div>
          ))}
        </div>
      ) : (
        /* Single-photo placeholder */
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-ink-dim opacity-40 group-hover:opacity-60 transition-opacity"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 18h16.5M3.75 6h16.5"
            />
          </svg>
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-surface-950/80 via-transparent to-transparent pointer-events-none" />

      {/* Template name overlay */}
      <div className="absolute bottom-0 left-0 right-0 px-3 py-2">
        <p className="text-ink text-xs font-semibold leading-snug line-clamp-1 drop-shadow">
          {template.name}
        </p>
      </div>
    </div>
  );
}

// ── Template card ──────────────────────────────────────────────────────────────

function PhotoTemplateCard({ template, onSelect }) {
  const [hovered, setHovered] = useState(false);

  const photoLabel = template.photoCount === 1
    ? '1 photo'
    : `${template.photoCount} photos`;

  const styleTagCls = getStyleTagColors(template.styleTag);

  return (
    <button
      onClick={() => onSelect(template)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group rounded-2xl bg-surface-800 border border-border overflow-hidden cursor-pointer
        hover:border-accent/50 transition-all text-left w-full focus:outline-none
        focus-visible:ring-2 focus-visible:ring-accent"
    >
      {/* Placeholder preview */}
      <TemplatePlaceholder template={template} />

      {/* Card body */}
      <div className="p-4 space-y-2.5">

        {/* Name + styleTag row */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-ink font-bold text-sm leading-snug group-hover:text-accent transition-colors">
            {template.name}
          </h3>
          <span
            className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${styleTagCls}`}
          >
            {template.styleTag}
          </span>
        </div>

        {/* Photo count */}
        <p className="text-ink-dim text-xs">{photoLabel}</p>

        {/* Platform badges */}
        {template.platforms?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {template.platforms.map((p) => (
              <span
                key={p}
                className="text-[10px] text-ink-muted border border-border rounded-full px-2 py-0.5
                  bg-surface-950/40"
              >
                {PLATFORM_LABELS[p] ?? p}
              </span>
            ))}
          </div>
        )}

        {/* "Use Template" CTA — fades in on hover */}
        <div
          className={`pt-0.5 transition-opacity duration-200 ${hovered ? 'opacity-100' : 'opacity-0'}`}
          aria-hidden={!hovered}
        >
          <span className="inline-flex items-center gap-1 text-accent text-xs font-semibold">
            Use Template
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-surface-800 border border-border overflow-hidden animate-pulse">
      <div className="w-full bg-surface-700" style={{ aspectRatio: '1/1', maxHeight: 220 }} />
      <div className="p-4 space-y-3">
        <div className="h-3.5 bg-surface-700 rounded-md w-3/4" />
        <div className="h-2.5 bg-surface-700 rounded-md w-1/4" />
        <div className="flex gap-1.5">
          <div className="h-4 bg-surface-700 rounded-full w-12" />
          <div className="h-4 bg-surface-700 rounded-full w-14" />
        </div>
      </div>
    </div>
  );
}

// ── Main gallery ───────────────────────────────────────────────────────────────

export default function PhotoTemplateGallery({ onSelect }) {
  const [templates, setTemplates] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTemplates() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/photo-templates');
        if (!res.ok) throw new Error(`Server returned ${res.status} ${res.statusText}`);
        const data = await res.json();
        if (!cancelled) setTemplates(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) setError(err.message ?? 'Failed to load templates.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchTemplates();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="space-y-6">
      {/* Section header */}
      <div className="space-y-1">
        <h2 className="text-ink text-xl font-bold tracking-tight">Photo Templates</h2>
        <p className="text-ink-muted text-sm leading-relaxed">
          Social-ready styled templates. Upload your photos, get a JPG + looping MP4 in seconds.
        </p>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <svg
            className="w-10 h-10 text-ink-dim"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <p className="text-ink-muted text-sm">Could not load photo templates.</p>
          <p className="text-ink-dim text-xs font-mono">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              fetch('/api/photo-templates')
                .then((r) => {
                  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
                  return r.json();
                })
                .then((data) => setTemplates(Array.isArray(data) ? data : []))
                .catch((e) => setError(e.message ?? 'Failed to load templates.'))
                .finally(() => setLoading(false));
            }}
            className="mt-1 text-accent text-xs hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && templates.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <svg
            className="w-10 h-10 text-ink-dim"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 18h16.5M3.75 6h16.5"
            />
          </svg>
          <p className="text-ink-muted text-sm">No photo templates available yet.</p>
          <p className="text-ink-dim text-xs">Check back soon — more are on the way.</p>
        </div>
      )}

      {/* Template grid */}
      {!loading && !error && templates.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
          {templates.map((template) => (
            <PhotoTemplateCard
              key={template.id}
              template={template}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  );
}
