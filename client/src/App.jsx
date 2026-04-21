import { useState, useCallback, useRef } from 'react';
import Upload from './components/Upload.jsx';
import Gallery from './components/Gallery.jsx';
import Progress from './components/Progress.jsx';
import CollageMode from './components/CollageMode.jsx';
import TemplateMode from './components/TemplateMode.jsx';
import PhotoTemplateGallery from './components/PhotoTemplateGallery.jsx';
import PhotoTemplateBuilder from './components/PhotoTemplateBuilder.jsx';

// ── SSE stream reader ──────────────────────────────────────────────────────
async function streamGenerate(fileId, handlers) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Server error' }));
    throw new Error(err.error || 'Generation failed');
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          handlers[data.type]?.(data);
        } catch { /* ignore */ }
      }
    }
  }
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [mode, setMode] = useState('single');              // 'single' | 'collage' | 'templates' | 'photo-templates'
  const [activePhotoTemplate, setActivePhotoTemplate] = useState(null); // selected template object
  const [uploadedFile, setUploadedFile] = useState(null); // { fileId, previewUrl, isVideo, name }
  const [stage, setStage] = useState('idle');              // idle | uploading | analyzing | processing | done | error
  const [error, setError] = useState('');
  const [plannedEdits, setPlannedEdits] = useState([]);
  const [completedEdits, setCompletedEdits] = useState([]);
  const fileIdRef = useRef(null);

  // ── Upload ──
  const handleUpload = useCallback(async (file) => {
    setStage('uploading');
    setError('');
    setPlannedEdits([]);
    setCompletedEdits([]);
    setUploadedFile(null);

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Upload failed');
      }
      const { fileId, previewUrl, isVideo } = await res.json();
      fileIdRef.current = fileId;
      setUploadedFile({ fileId, previewUrl, isVideo, name: file.name });
      setStage('idle');
    } catch (err) {
      setError(err.message);
      setStage('error');
    }
  }, []);

  // ── Generate ──
  const handleGenerate = useCallback(async () => {
    if (!fileIdRef.current) return;
    setStage('analyzing');
    setError('');
    setPlannedEdits([]);
    setCompletedEdits([]);

    try {
      await streamGenerate(fileIdRef.current, {
        status:        () => {},
        edits_planned: ({ edits }) => {
          setPlannedEdits(edits);
          setStage('processing');
        },
        edit_start:    () => {},
        edit_done:     ({ name, description, outputUrl, thumbUrl }) => {
          setCompletedEdits(prev => [...prev, { name, description, outputUrl, thumbUrl }]);
        },
        edit_error:    ({ name, error: msg }) => {
          console.warn(`Edit "${name}" failed:`, msg);
          // Still advance the counter
          setCompletedEdits(prev => [...prev, { name, description: `Processing failed: ${msg}`, outputUrl: null, thumbUrl: null }]);
        },
        complete:      () => setStage('done'),
        error:         ({ message }) => { setError(message); setStage('error'); },
      });
    } catch (err) {
      setError(err.message);
      setStage('error');
    }
  }, []);

  const handleReset = () => {
    setUploadedFile(null);
    setStage('idle');
    setError('');
    setPlannedEdits([]);
    setCompletedEdits([]);
    fileIdRef.current = null;
    setActivePhotoTemplate(null);
  };

  const isGenerating = stage === 'analyzing' || stage === 'processing';
  const showGallery   = completedEdits.length > 0 || (isGenerating && plannedEdits.length > 0);
  const successEdits  = completedEdits.filter(e => e.outputUrl);

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </div>
          <span className="font-mono font-semibold text-ink tracking-wider text-sm">FRAME</span>
          <span className="text-ink-dim text-xs font-mono hidden sm:inline">/ AI Edit Generator</span>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 p-1 bg-surface-800 border border-border rounded-lg">
          {[
            { key: 'single',          label: 'Single Edit' },
            { key: 'collage',         label: 'Collage' },
            { key: 'templates',       label: 'Templates' },
            { key: 'photo-templates', label: 'Photo Templates' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setMode(key); handleReset(); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150
                ${mode === key
                  ? 'bg-accent text-white shadow'
                  : 'text-ink-muted hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {uploadedFile && mode === 'single' && (
          <button onClick={handleReset} className="btn-ghost text-xs py-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            New upload
          </button>
        )}
      </header>

      {/* Main */}
      <main className="flex-1 px-4 sm:px-6 py-10 max-w-6xl mx-auto w-full space-y-10">

        {/* ── Photo Templates mode ── */}
        {mode === 'photo-templates' && (
          activePhotoTemplate
            ? <PhotoTemplateBuilder
                template={activePhotoTemplate}
                onBack={() => setActivePhotoTemplate(null)}
              />
            : <PhotoTemplateGallery onSelect={(t) => setActivePhotoTemplate(t)} />
        )}

        {/* ── Templates mode ── */}
        {mode === 'templates' && (
          <TemplateMode />
        )}

        {/* ── Collage mode ── */}
        {mode === 'collage' && (
          <>
            <div className="text-center space-y-2 pt-4">
              <h1 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight">
                Photo Collage <span className="text-accent">to Video.</span>
              </h1>
              <p className="text-ink-muted text-base max-w-lg mx-auto">
                Upload 2–20 photos and optional music. Claude analyzes the mood,
                FFmpeg assembles a beat-synced vertical highlight reel.
              </p>
            </div>
            <CollageMode />
          </>
        )}

        {/* ── Single-edit mode ── */}
        {mode === 'single' && <>

        {/* Hero — only when idle */}
        {stage === 'idle' && !uploadedFile && (
          <div className="text-center space-y-2 pt-4">
            <h1 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight">
              Drop. Analyze. <span className="text-accent">Edit.</span>
            </h1>
            <p className="text-ink-muted text-base max-w-lg mx-auto">
              Upload a photo or short video clip. Claude analyzes it and generates 5 distinct
              creative edits — instantly ready to preview and download.
            </p>
          </div>
        )}

        {/* Upload zone */}
        {!uploadedFile && (
          <Upload onUpload={handleUpload} isUploading={stage === 'uploading'} />
        )}

        {/* Error banner */}
        {stage === 'error' && error && (
          <div className="w-full max-w-2xl mx-auto flex items-start gap-3 px-4 py-3 rounded-xl
            bg-red-500/10 border border-red-500/30 text-red-400 text-sm animate-fade-up">
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Uploaded preview + generate trigger */}
        {uploadedFile && stage !== 'error' && (
          <div className="w-full max-w-2xl mx-auto flex flex-col sm:flex-row items-center gap-5 animate-fade-up">
            {/* Preview */}
            <div className="relative w-full sm:w-48 h-32 rounded-xl overflow-hidden bg-surface-800 border border-border shrink-0">
              {uploadedFile.isVideo ? (
                <video
                  src={uploadedFile.previewUrl}
                  className="w-full h-full object-cover"
                  muted playsInline
                  poster={uploadedFile.previewUrl}
                />
              ) : (
                <img src={uploadedFile.previewUrl} alt="preview" className="w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              <span className="absolute bottom-2 left-2 text-xs font-mono text-white/70 truncate max-w-[90%]">
                {uploadedFile.name}
              </span>
            </div>

            {/* Controls */}
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-ink font-medium text-sm">Ready to generate</p>
                <p className="text-ink-muted text-xs mt-0.5">
                  Claude will analyze your {uploadedFile.isVideo ? 'video' : 'photo'} and produce 5 distinct creative edits.
                </p>
              </div>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="btn-primary w-full sm:w-auto"
              >
                {isGenerating ? (
                  <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Generating…</>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                    </svg>
                    Generate Edits
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Progress */}
        {isGenerating && (
          <Progress
            status={stage}
            plannedEdits={plannedEdits}
            completedEdits={completedEdits.length}
            totalEdits={plannedEdits.length}
          />
        )}

        {/* Gallery */}
        {showGallery && (
          <Gallery
            edits={successEdits}
            plannedEdits={plannedEdits}
            isProcessing={isGenerating}
          />
        )}

        {/* Done state */}
        {stage === 'done' && successEdits.length > 0 && (
          <div className="text-center pb-6 animate-fade-up">
            <p className="text-ink-muted text-sm">
              <span className="text-accent font-semibold">{successEdits.length} edits</span> generated.
              Hover a card to preview, click Download to save.
            </p>
          </div>
        )}

        </> /* end single-edit mode */}
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-4 text-center text-ink-dim text-xs font-mono">
        FRAME · Powered by Claude AI · {new Date().getFullYear()}
      </footer>
    </div>
  );
}
