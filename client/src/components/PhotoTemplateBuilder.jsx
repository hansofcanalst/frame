import { useState, useEffect, useRef } from 'react';

// ─── Photo Upload Slot ────────────────────────────────────────────────────────

function PhotoSlot({ index, file, onFile }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const thumbnailUrl = file ? URL.createObjectURL(file) : null;

  function handleFiles(files) {
    const f = files[0];
    if (!f) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(f.type)) return;
    onFile(f);
  }

  function onInputChange(e) {
    handleFiles(e.target.files);
    e.target.value = '';
  }

  function onDragOver(e) {
    e.preventDefault();
    setDragging(true);
  }

  function onDragLeave() {
    setDragging(false);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  function onReplace() {
    onFile(null);
    setTimeout(() => inputRef.current?.click(), 0);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">
        Photo {index + 1}
      </p>

      {file ? (
        <div className="flex items-center gap-3">
          <img
            src={thumbnailUrl}
            alt={`Photo ${index + 1} thumbnail`}
            className="w-24 h-24 object-cover rounded-lg border border-border"
          />
          <button
            onClick={onReplace}
            className="text-xs text-ink-muted hover:text-ink underline"
          >
            Replace
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={onInputChange}
          />
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={[
            'w-full h-28 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors select-none',
            dragging
              ? 'border-accent bg-accent/10'
              : 'border-border bg-surface-800 hover:border-accent/60 hover:bg-surface-700',
          ].join(' ')}
        >
          <svg
            className="w-6 h-6 text-ink-dim mb-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span className="text-xs text-ink-dim">
            {dragging ? 'Drop here' : 'Click or drag to upload'}
          </span>
          <span className="text-[10px] text-ink-dim mt-0.5">
            JPG · PNG · WEBP
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={onInputChange}
          />
        </div>
      )}
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ size = 5 }) {
  return (
    <svg
      className={`w-${size} h-${size} animate-spin text-accent`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PhotoTemplateBuilder({ template, onBack }) {
  const [photos, setPhotos] = useState(Array(template.photoCount).fill(null));
  const [selectedSizeId, setSelectedSizeId] = useState(template.sizes[0].id);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [renderStage, setRenderStage] = useState('idle'); // idle | rendering | done | error
  const [renderError, setRenderError] = useState('');
  const [result, setResult] = useState(null); // { imageUrl, videoUrl }
  const [showVideo, setShowVideo] = useState(false);

  const allReady = photos.every((p) => p !== null);

  const selectedSize =
    template.sizes.find((s) => s.id === selectedSizeId) ?? template.sizes[0];

  // ── Auto-fetch preview whenever all photos are ready or size changes ─────

  useEffect(() => {
    if (!allReady) {
      setPreviewUrl(null);
      return;
    }

    let cancelled = false;

    async function fetchPreview() {
      setPreviewLoading(true);
      setPreviewUrl(null);

      try {
        const fd = new FormData();
        fd.append('templateId', template.id);
        fd.append('sizeId', selectedSizeId);
        photos.forEach((photo) => fd.append('photos', photo));

        const res = await fetch('/api/photo-templates/preview', {
          method: 'POST',
          body: fd,
        });

        if (!res.ok) throw new Error(`Preview failed: ${res.statusText}`);
        const data = await res.json();

        if (!cancelled) setPreviewUrl(data.previewUrl);
      } catch (err) {
        if (!cancelled) console.error('Preview error:', err);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }

    fetchPreview();
    return () => { cancelled = true; };
  }, [photos, selectedSizeId, allReady, template.id]);

  // ── Render ────────────────────────────────────────────────────────────────

  async function handleRender() {
    if (!allReady || renderStage === 'rendering') return;

    setRenderStage('rendering');
    setRenderError('');
    setResult(null);
    setShowVideo(false);

    try {
      const fd = new FormData();
      fd.append('templateId', template.id);
      fd.append('sizeId', selectedSizeId);
      photos.forEach((photo) => fd.append('photos', photo));

      const res = await fetch('/api/photo-templates/render', {
        method: 'POST',
        body: fd,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Render failed: ${res.statusText}`);
      }

      const data = await res.json();
      setResult({ imageUrl: data.imageUrl, videoUrl: data.videoUrl });
      setRenderStage('done');
    } catch (err) {
      setRenderError(err.message);
      setRenderStage('error');
    }
  }

  // ── Photo slot handler ────────────────────────────────────────────────────

  function handlePhoto(index, file) {
    setPhotos((prev) => {
      const next = [...prev];
      next[index] = file;
      return next;
    });
    // Reset render state when photos change
    setRenderStage('idle');
    setResult(null);
    setShowVideo(false);
    setRenderError('');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="space-y-1">
        <button
          onClick={onBack}
          className="text-sm text-ink-muted hover:text-ink transition-colors"
        >
          ← Templates
        </button>
        <h1 className="text-xl font-semibold text-ink">{template.name}</h1>
        {template.description && (
          <p className="text-sm text-ink-muted">{template.description}</p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2 py-0.5 rounded-full bg-surface-700 text-ink-muted border border-border">
            {template.styleTag}
          </span>
          {template.platforms.map((p) => (
            <span
              key={p}
              className="text-xs px-2 py-0.5 rounded-full bg-surface-700 text-ink-muted border border-border"
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── Panel 1: Upload zone ─────────────────────────────────────── */}
        <aside className="lg:w-64 shrink-0 space-y-4">
          <div className="rounded-2xl bg-surface-800 border border-border p-4 space-y-4">
            <h2 className="text-sm font-semibold text-ink">
              Upload Photos
              <span className="ml-2 text-xs font-normal text-ink-dim">
                ({template.photoCount} required)
              </span>
            </h2>

            {photos.map((file, i) => (
              <PhotoSlot
                key={i}
                index={i}
                file={file}
                onFile={(f) => handlePhoto(i, f)}
              />
            ))}
          </div>
        </aside>

        {/* ── Panel 2: Preview ─────────────────────────────────────────── */}
        <main className="flex-1 space-y-3">
          {/* Size toggles */}
          <div className="flex flex-wrap gap-2">
            {template.sizes.map((size) => (
              <button
                key={size.id}
                onClick={() => {
                  setSelectedSizeId(size.id);
                  setShowVideo(false);
                }}
                className={[
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  selectedSizeId === size.id
                    ? 'bg-accent text-white'
                    : 'bg-surface-700 text-ink-muted hover:text-ink',
                ].join(' ')}
              >
                {size.label}
              </button>
            ))}
          </div>

          {/* Preview area */}
          <div className="rounded-2xl bg-surface-800 border border-border overflow-hidden">
            <div
              className="relative flex items-center justify-center bg-surface-950"
              style={{ minHeight: '360px' }}
            >
              {/* No photos yet */}
              {!allReady && !previewLoading && (
                <div className="flex flex-col items-center gap-2 text-ink-dim p-8 text-center">
                  <svg
                    className="w-12 h-12 opacity-30"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <p className="text-sm">
                    Upload {template.photoCount === 1 ? 'a photo' : `${template.photoCount} photos`} to see preview
                  </p>
                </div>
              )}

              {/* Loading spinner */}
              {previewLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-surface-950/80 z-10">
                  <Spinner size={8} />
                </div>
              )}

              {/* Video playback */}
              {showVideo && result?.videoUrl && (
                <video
                  key={result.videoUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="max-w-full max-h-[480px] object-contain"
                >
                  <source src={result.videoUrl} type="video/mp4" />
                </video>
              )}

              {/* Static preview image */}
              {!showVideo && previewUrl && !previewLoading && (
                <img
                  src={previewUrl}
                  alt="Template preview"
                  className="max-w-full max-h-[480px] object-contain"
                />
              )}
            </div>

            {/* Play animation button + platform info */}
            <div className="px-4 py-3 border-t border-border flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-ink-muted">
                {selectedSize.width} × {selectedSize.height} · {selectedSize.label} ready
              </p>

              {result?.videoUrl && (
                <button
                  onClick={() => setShowVideo((v) => !v)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-surface-700 text-ink-muted hover:text-ink transition-colors"
                >
                  {showVideo ? '⏹ Stop Animation' : '▶ Play Animation'}
                </button>
              )}
            </div>
          </div>
        </main>

        {/* ── Panel 3: Download ─────────────────────────────────────────── */}
        <aside className="lg:w-56 shrink-0 space-y-4">
          <div className="rounded-2xl bg-surface-800 border border-border p-4 space-y-4">
            <h2 className="text-sm font-semibold text-ink">Export</h2>

            {/* Render error banner */}
            {renderStage === 'error' && renderError && (
              <div className="rounded-lg bg-red-900/40 border border-red-700/60 p-3 text-xs text-red-300">
                {renderError}
              </div>
            )}

            {/* Render button */}
            <button
              onClick={handleRender}
              disabled={!allReady || renderStage === 'rendering'}
              className={[
                'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors',
                allReady && renderStage !== 'rendering'
                  ? 'bg-accent text-white hover:opacity-90'
                  : 'bg-surface-700 text-ink-dim opacity-50 cursor-not-allowed',
              ].join(' ')}
            >
              {renderStage === 'rendering' ? (
                <>
                  <Spinner size={4} />
                  Rendering…
                </>
              ) : (
                'Render & Download'
              )}
            </button>

            {/* Download buttons */}
            {renderStage === 'done' && result && (
              <div className="space-y-2">
                <a
                  href={result.imageUrl}
                  download
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-surface-700 text-ink hover:bg-surface-600 transition-colors"
                >
                  ⬇ Download Image (JPG)
                </a>
                {result.videoUrl && (
                  <a
                    href={result.videoUrl}
                    download
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-surface-700 text-ink hover:bg-surface-600 transition-colors"
                  >
                    ⬇ Download Video (MP4)
                  </a>
                )}
              </div>
            )}

            {/* Helper text when not ready */}
            {!allReady && (
              <p className="text-xs text-ink-dim text-center">
                Upload{' '}
                {photos.filter((p) => p === null).length === template.photoCount
                  ? 'all photos'
                  : `${photos.filter((p) => p === null).length} more photo${
                      photos.filter((p) => p === null).length !== 1 ? 's' : ''
                    }`}{' '}
                to enable render
              </p>
            )}
          </div>

          {/* Template meta */}
          <div className="rounded-2xl bg-surface-800 border border-border p-4 space-y-2">
            <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
              Template Info
            </h2>
            <dl className="space-y-1 text-xs">
              <div className="flex justify-between">
                <dt className="text-ink-dim">Photos</dt>
                <dd className="text-ink">{template.photoCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-dim">Duration</dt>
                <dd className="text-ink">{template.animationDuration}s</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-dim">Loop</dt>
                <dd className="text-ink">{template.animationLoop ? 'Yes' : 'No'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-dim">Sizes</dt>
                <dd className="text-ink">{template.sizes.length}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
