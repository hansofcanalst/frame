import { useState, useRef } from 'react';
import ClipTrimmer      from './ClipTrimmer.jsx';
import EffectsPicker    from './EffectsPicker.jsx';
import TransitionPicker from './TransitionPicker.jsx';
import { GLOBAL_EFFECTS_DATA } from '../data/effectsData.js';
import { useFfmpegTrim } from '../hooks/useFfmpegTrim.js';

// ── Photo Wall upload slot (images only, no trimming) ────────────────────────

function PhotoSlot({ label, optional, file, onFile, onRemove }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const previewUrl = file ? URL.createObjectURL(file) : null;

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = Array.from(e.dataTransfer.files).find(f => /\.(jpg|jpeg|png)$/i.test(f.name));
    if (f) onFile(f);
  };

  if (file) {
    return (
      <div className="relative rounded-xl overflow-hidden border-2 border-accent/40 aspect-square group">
        <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <button
            onClick={onRemove}
            className="px-3 py-1.5 rounded-lg bg-red-500/80 text-white text-xs font-medium"
          >
            Remove
          </button>
        </div>
        <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-black/60 text-white text-xs font-mono truncate">
          {label}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`relative border-2 border-dashed rounded-xl aspect-square cursor-pointer
        flex flex-col items-center justify-center gap-2 transition-all
        ${dragging ? 'border-accent bg-accent/10' : 'border-border bg-surface-800 hover:border-accent/60'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
      />
      <svg className="w-6 h-6 text-ink-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
      <div className="text-center px-2">
        <p className="text-ink-muted text-xs font-medium">{label}</p>
        {optional && <p className="text-ink-dim text-[10px]">optional</p>}
      </div>
    </div>
  );
}

// ── SSE stream helper ────────────────────────────────────────────────────────

async function streamTemplateRender(formData, handlers) {
  const res = await fetch('/api/template-render', {
    method: 'POST',
    body:   formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Server error' }));
    throw new Error(err.error || 'Render failed');
  }

  const reader = res.body.getReader();
  const dec    = new TextDecoder();
  let   buf    = '';

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
        } catch { /* ignore malformed */ }
      }
    }
  }
}

// ── Clip drop zone (shown when no file is selected for a slot) ───────────────

function ClipDropZone({ slot, onFile }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`relative border-2 border-dashed rounded-xl p-5 cursor-pointer transition-all flex flex-col items-center gap-2
        ${dragging
          ? 'border-accent bg-accent/10'
          : 'border-border bg-surface-800 hover:border-accent/60'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
      />
      <svg className="w-6 h-6 text-ink-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
      <p className="text-ink-muted text-xs text-center">
        <span className="font-medium text-ink">{slot.label}</span>
        <br />
        <span className="text-ink-dim">{slot.durationHint}</span>
      </p>
    </div>
  );
}

// ── Memory Reel: draggable thumbnail strip item ───────────────────────────────

function MRPhotoThumb({ file, index, onRemove }) {
  const url = file ? URL.createObjectURL(file) : null;
  return (
    <div className="relative shrink-0 w-24 h-24 rounded-xl overflow-hidden border-2 border-accent/30 group">
      {url && <img src={url} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <button
          onClick={() => onRemove(index)}
          className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center"
        >
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] font-mono text-center py-0.5">
        {index + 1}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

/**
 * TemplateBuilder
 * Props: { template: object, onBack: () => void }
 */
export default function TemplateBuilder({ template, onBack }) {
  const { trimClip } = useFfmpegTrim();

  // Detect special templates — each uses a completely different UI and pipeline
  const isPhotoWall  = template.id === 'photo-wall';
  const isMemoryReel = template.id === 'memory-reel';

  // Standard templates have an array clipSlots; dynamic templates use "dynamic"
  const hasSlots = Array.isArray(template.clipSlots);

  // Per-slot state: { file: File | null, trim: { trimStart, trimEnd, thumbnailUrl } | null }
  const [slots, setSlots] = useState(() =>
    hasSlots ? template.clipSlots.map(() => ({ file: null, trim: null })) : []
  );

  // Treatments: one per slot
  const [treatments, setTreatments] = useState(() =>
    hasSlots ? template.clipSlots.map(() => 'none') : []
  );

  // Per-slot clip effects (array of effect ID arrays)
  const [clipEffectsPerSlot, setClipEffectsPerSlot] = useState(() =>
    hasSlots ? template.clipSlots.map(() => []) : []
  );

  // ── Memory Reel state ────────────────────────────────────────────────────────
  const [mrPhotos,         setMrPhotos]         = useState([]);   // File[]
  const [mrTitleText,      setMrTitleText]      = useState('');
  const [mrTargetDuration, setMrTargetDuration] = useState(null); // seconds or null
  const mrDropRef = useRef(null);
  const mrInputRef = useRef(null);

  // Transition style (one ID applied to all gaps)
  const [selectedTransition, setSelectedTransition] = useState('hard_cut');

  // Global effects
  const [globalEffects, setGlobalEffects] = useState([]);

  // Caption
  const [captionMode,        setCaptionMode]        = useState('none');
  const [manualCaptionsText, setManualCaptionsText] = useState('');

  // Audio
  const [audioFile,    setAudioFile]    = useState(null);
  const audioInputRef = useRef(null);

  // Render state
  const [renderStage, setRenderStage] = useState('idle'); // idle | rendering | done | error
  const [statusMsg,   setStatusMsg]   = useState('');
  const [renderError, setRenderError] = useState('');
  const [result,      setResult]      = useState(null);

  // ── Slot handlers ──────────────────────────────────────────────────────────

  const handleSlotFile = (i, file) => {
    setSlots(prev => {
      const next = [...prev];
      next[i] = { file, trim: null }; // reset trim when file changes
      return next;
    });
  };

  const handleSlotTrim = (i, trimData) => {
    // trimData is { trimStart, trimEnd, thumbnailUrl } OR null (unconfirmed)
    setSlots(prev => {
      const next = [...prev];
      next[i] = { ...next[i], trim: trimData };
      return next;
    });
  };

  const handleSlotRemove = (i) => {
    setSlots(prev => {
      const next = [...prev];
      next[i] = { file: null, trim: null };
      return next;
    });
  };

  const handleTreatment = (i, value) => {
    setTreatments(prev => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  };

  const handleSlotEffects = (i, effectIds) => {
    setClipEffectsPerSlot(prev => {
      const next = [...prev];
      next[i] = effectIds;
      return next;
    });
  };

  // ── Caption helpers ────────────────────────────────────────────────────────

  const parseManualCaptions = () =>
    manualCaptionsText
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(line => {
        const parts    = line.split(/\s+/);
        const word     = parts.slice(0, parts.length - 1).join(' ') || parts[0];
        const startTime = parseFloat(parts[parts.length - 1]);
        return { word, startTime: isNaN(startTime) ? 0 : startTime };
      });

  // ── Memory Reel helpers ────────────────────────────────────────────────────

  const addMrPhotos = (files) => {
    const imgs = Array.from(files).filter(f => /\.(jpe?g|png)$/i.test(f.name));
    setMrPhotos(prev => {
      const combined = [...prev, ...imgs];
      return combined.slice(0, template.maxPhotos ?? 30);
    });
  };

  const removeMrPhoto = (idx) =>
    setMrPhotos(prev => prev.filter((_, i) => i !== idx));

  const mrEstDuration = mrTargetDuration
    ? mrTargetDuration
    : mrPhotos.length * 5.5 + (mrTitleText.trim() ? 3 : 0);

  // ── Render readiness ───────────────────────────────────────────────────────

  // Photo Wall: at least 3 photos uploaded (trim not required)
  // Memory Reel: at least 4 photos uploaded
  // Standard templates: every slot needs a file AND a confirmed trim
  const photoWallCount  = isPhotoWall  ? slots.filter(s => s.file).length : 0;
  const allClipsReady   = isPhotoWall
    ? photoWallCount >= 3
    : isMemoryReel
      ? mrPhotos.length >= 4
      : slots.every(s => s.file && s.trim);
  const isRendering     = renderStage === 'rendering';

  const handleRender = async () => {
    if (!allClipsReady) return;

    setRenderStage('rendering');
    setRenderError('');
    setResult(null);

    try {
      const fd = new FormData();
      fd.append('templateId', template.id);

      if (isPhotoWall) {
        // ── Photo Wall: send uploaded photos directly (no trimming) ────────────
        setStatusMsg('Uploading photos…');
        for (const { file } of slots) {
          if (file) fd.append('clips', file);   // skip empty optional slots
        }
        if (audioFile) fd.append('audio', audioFile);

      } else if (isMemoryReel) {
        // ── Memory Reel: multi-photo upload ────────────────────────────────────
        setStatusMsg('Uploading photos…');
        for (const photo of mrPhotos) {
          fd.append('clips', photo);
        }
        if (mrTitleText.trim())      fd.append('titleText', mrTitleText.trim());
        if (mrTargetDuration)        fd.append('targetDuration', String(mrTargetDuration));
        if (audioFile)               fd.append('audio', audioFile);

      } else {
        // ── Standard template: trim clips then upload ─────────────────────────
        setStatusMsg('Trimming clips…');

        const filesToUpload = [];
        const trimRanges    = [];
        let   needsServerTrim = false;

        for (const { file, trim } of slots) {
          const { trimStart, trimEnd } = trim;
          const trimmed = await trimClip(file, trimStart, trimEnd);
          if (trimmed) {
            filesToUpload.push(trimmed);
            trimRanges.push(null);
          } else {
            needsServerTrim = true;
            filesToUpload.push(file);
            trimRanges.push({ trimStart, trimEnd });
          }
        }

        setStatusMsg('Uploading…');

        fd.append('treatments',  JSON.stringify(treatments));
        fd.append('captionMode', captionMode);

        if (captionMode === 'manual') {
          fd.append('captions', JSON.stringify(parseManualCaptions()));
        }

        for (const f of filesToUpload) fd.append('clips', f);

        if (needsServerTrim) {
          fd.append('trimRanges', JSON.stringify(trimRanges));
        }

        // Effects & transitions
        const hasClipEffects = clipEffectsPerSlot.some(arr => arr.length > 0);
        if (hasClipEffects) {
          fd.append('clipEffects', JSON.stringify(clipEffectsPerSlot));
        }
        fd.append('transitions', JSON.stringify([selectedTransition]));
        if (globalEffects.length > 0) {
          fd.append('globalEffects', JSON.stringify(globalEffects));
        }

        if (audioFile) fd.append('audio', audioFile);
      }

      // Stream the render response
      await streamTemplateRender(fd, {
        status:   ({ message }) => setStatusMsg(message),
        complete: (data)        => { setResult(data); setRenderStage('done'); },
        error:    ({ message }) => { setRenderError(message); setRenderStage('error'); },
      });
    } catch (err) {
      setRenderError(err.message);
      setRenderStage('error');
    }
  };

  const handleReset = () => {
    if (hasSlots) {
      setSlots(template.clipSlots.map(() => ({ file: null, trim: null })));
      setTreatments(template.clipSlots.map(() => 'none'));
      setClipEffectsPerSlot(template.clipSlots.map(() => []));
    }
    setSelectedTransition('hard_cut');
    setGlobalEffects([]);
    setCaptionMode('none');
    setManualCaptionsText('');
    setAudioFile(null);
    // Memory Reel
    setMrPhotos([]);
    setMrTitleText('');
    setMrTargetDuration(null);
    // Status
    setRenderStage('idle');
    setStatusMsg('');
    setRenderError('');
    setResult(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-3xl mx-auto space-y-8 pb-10">

      {/* Header */}
      <div className="flex items-center gap-3 pt-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-ink-muted hover:text-ink transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Templates
        </button>
        <span className="text-ink-dim">/</span>
        <h2 className="text-ink font-semibold">{template.name}</h2>
      </div>

      {/* ── Done state ── */}
      {renderStage === 'done' && result && (
        <div className="bg-surface-800 border border-accent/40 rounded-2xl overflow-hidden animate-fade-up">
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p className="text-ink font-semibold">Render complete!</p>
            </div>
            <p className="text-ink-muted text-sm">
              {result.clipCount} clips · {result.duration?.toFixed(1)}s
            </p>
            <video src={result.outputUrl} controls className="w-full rounded-xl bg-black" style={{ maxHeight: 480 }} />
            <div className="flex flex-wrap gap-3">
              <a
                href={result.outputUrl}
                download={result.filename}
                className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download
              </a>
              <button
                onClick={handleReset}
                className="bg-surface-700 text-ink px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-600 transition-colors"
              >
                Make another
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rendering progress ── */}
      {isRendering && (
        <div className="bg-surface-800 border border-border rounded-2xl p-5 flex items-center gap-4 animate-fade-up">
          <div className="spinner shrink-0" style={{ width: 24, height: 24, borderWidth: 2 }} />
          <div>
            <p className="text-ink text-sm font-medium">Rendering…</p>
            <p className="text-ink-muted text-xs mt-0.5">{statusMsg}</p>
          </div>
        </div>
      )}

      {/* ── Error banner ── */}
      {renderStage === 'error' && renderError && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <span>{renderError}</span>
        </div>
      )}

      {/* ── Builder form ── */}
      {renderStage !== 'done' && !isRendering && (
        <>
          {/* ═══════════════════════════════════════════════════════════════════
              PHOTO WALL: custom photo-grid UI
              ═══════════════════════════════════════════════════════════════════ */}
          {isPhotoWall && (
            <div className="space-y-5">
              {/* Info banner */}
              <div className="px-4 py-3 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-300 text-sm">
                <p className="font-medium mb-0.5">Polaroid Photo Wall</p>
                <p className="text-xs text-violet-400/80">
                  The most recently added photo will appear in <strong>color</strong>. All others are shown in black &amp; white. Upload 3–8 photos.
                </p>
              </div>

              {/* Photo grid */}
              <div>
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="text-ink font-semibold text-sm tracking-wide uppercase">Photos</h3>
                  <span className="text-ink-dim text-xs font-mono">
                    {photoWallCount} / {template.clipSlots.length} uploaded
                    {photoWallCount >= 3 && <span className="ml-1.5 text-accent">✓ ready</span>}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {template.clipSlots.map((slot, i) => (
                    <PhotoSlot
                      key={slot.id}
                      label={slot.label}
                      optional={slot.optional ?? false}
                      file={slots[i].file}
                      onFile={(f) => handleSlotFile(i, f)}
                      onRemove={() => handleSlotRemove(i)}
                    />
                  ))}
                </div>
              </div>

              {/* Audio */}
              <div className="space-y-2">
                <h3 className="text-ink font-semibold text-sm tracking-wide uppercase">
                  Audio <span className="text-ink-dim font-normal normal-case text-xs">(optional)</span>
                </h3>
                {audioFile ? (
                  <div className="flex items-center gap-3 bg-surface-800 border border-accent/40 rounded-xl p-3">
                    <svg className="w-5 h-5 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                    </svg>
                    <span className="text-ink text-sm flex-1 truncate">{audioFile.name}</span>
                    <button onClick={() => setAudioFile(null)} className="text-ink-muted hover:text-red-400 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => audioInputRef.current?.click()}
                    className="flex items-center gap-2 text-ink-muted hover:text-ink text-sm
                      border border-dashed border-border hover:border-accent/60 rounded-xl px-4 py-3
                      transition-all w-full"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    {template.audioSlot?.label ?? 'Upload background music'}
                  </button>
                )}
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/mp3,audio/mp4,audio/x-m4a,audio/aac,audio/wav"
                  className="hidden"
                  onChange={(e) => e.target.files[0] && setAudioFile(e.target.files[0])}
                />
              </div>

              {/* Render button */}
              <div className="pt-2">
                <button
                  onClick={handleRender}
                  disabled={!allClipsReady}
                  className={`bg-accent text-white px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
                    allClipsReady
                      ? 'hover:bg-accent/90 shadow-lg shadow-accent/20'
                      : 'opacity-40 cursor-not-allowed'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                    </svg>
                    {allClipsReady
                      ? `Render Photo Wall (${photoWallCount} photo${photoWallCount !== 1 ? 's' : ''})`
                      : `Upload ${3 - photoWallCount} more photo${3 - photoWallCount !== 1 ? 's' : ''} to continue`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              MEMORY REEL: multi-photo drag-and-drop UI
              ═══════════════════════════════════════════════════════════════════ */}
          {isMemoryReel && (
            <div className="space-y-5">
              {/* Info banner */}
              <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-sm">
                <p className="font-medium mb-0.5">Polaroid Memory Reel</p>
                <p className="text-xs text-amber-300/80">
                  Each photo gets its own Polaroid moment on a dark scattered background.
                  Upload 4–{template.maxPhotos ?? 30} photos. Order determines playback sequence.
                </p>
              </div>

              {/* Drop zone */}
              <div>
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="text-ink font-semibold text-sm tracking-wide uppercase">Photos</h3>
                  <span className="text-ink-dim text-xs font-mono">
                    {mrPhotos.length} / {template.maxPhotos ?? 30} uploaded
                    {mrPhotos.length >= 4
                      ? <span className="ml-1.5 text-amber-400">✓ ready · ~{mrEstDuration.toFixed(0)}s video</span>
                      : <span className="ml-1.5 text-ink-dim">need {4 - mrPhotos.length} more</span>}
                  </span>
                </div>

                {/* Multi-upload drop area */}
                <div
                  ref={mrDropRef}
                  onClick={() => mrInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); mrDropRef.current?.classList.add('border-amber-400', 'bg-amber-500/10'); }}
                  onDragLeave={() => mrDropRef.current?.classList.remove('border-amber-400', 'bg-amber-500/10')}
                  onDrop={(e) => {
                    e.preventDefault();
                    mrDropRef.current?.classList.remove('border-amber-400', 'bg-amber-500/10');
                    addMrPhotos(e.dataTransfer.files);
                  }}
                  className="border-2 border-dashed border-border rounded-xl p-8 cursor-pointer
                    flex flex-col items-center gap-3 transition-all hover:border-amber-400/60"
                >
                  <svg className="w-8 h-8 text-ink-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  <div className="text-center">
                    <p className="text-ink text-sm font-medium">Drop photos here or click to browse</p>
                    <p className="text-ink-dim text-xs mt-1">JPG or PNG · up to {template.maxPhotos ?? 30} photos</p>
                  </div>
                </div>
                <input
                  ref={mrInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png"
                  multiple
                  className="hidden"
                  onChange={(e) => addMrPhotos(e.target.files)}
                />

                {/* Scrollable thumbnail strip */}
                {mrPhotos.length > 0 && (
                  <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                    {mrPhotos.map((f, i) => (
                      <MRPhotoThumb key={i} file={f} index={i} onRemove={removeMrPhoto} />
                    ))}
                  </div>
                )}
              </div>

              {/* Optional title text */}
              <div className="space-y-2">
                <h3 className="text-ink font-semibold text-sm tracking-wide uppercase">
                  Title <span className="text-ink-dim font-normal normal-case text-xs">(optional — adds a 3s title card)</span>
                </h3>
                <input
                  type="text"
                  value={mrTitleText}
                  onChange={(e) => setMrTitleText(e.target.value)}
                  placeholder="e.g. Summer 2025, Class Trip, REU2025"
                  maxLength={40}
                  className="w-full bg-surface-800 border border-border rounded-xl px-4 py-2.5 text-ink text-sm
                    focus:outline-none focus:border-amber-400/60 transition-colors placeholder:text-ink-dim"
                />
              </div>

              {/* Optional target duration slider */}
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-ink font-semibold text-sm tracking-wide uppercase">
                    Target Duration <span className="text-ink-dim font-normal normal-case text-xs">(optional)</span>
                  </h3>
                  {mrTargetDuration
                    ? <span className="text-amber-400 text-xs font-mono">{mrTargetDuration}s</span>
                    : <span className="text-ink-dim text-xs">auto (~{mrEstDuration.toFixed(0)}s)</span>}
                </div>
                <input
                  type="range"
                  min={10} max={120} step={5}
                  value={mrTargetDuration ?? Math.round(mrEstDuration)}
                  onChange={(e) => setMrTargetDuration(Number(e.target.value))}
                  className="w-full accent-amber-400"
                />
                <div className="flex justify-between text-ink-dim text-[10px]">
                  <span>10s</span>
                  <button
                    onClick={() => setMrTargetDuration(null)}
                    className="text-ink-dim hover:text-amber-400 underline text-[10px]"
                  >
                    Reset to auto
                  </button>
                  <span>120s</span>
                </div>
              </div>

              {/* Audio */}
              <div className="space-y-2">
                <h3 className="text-ink font-semibold text-sm tracking-wide uppercase">
                  Audio <span className="text-ink-dim font-normal normal-case text-xs">(optional)</span>
                </h3>
                {audioFile ? (
                  <div className="flex items-center gap-3 bg-surface-800 border border-amber-400/30 rounded-xl p-3">
                    <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                    </svg>
                    <span className="text-ink text-sm flex-1 truncate">{audioFile.name}</span>
                    <button onClick={() => setAudioFile(null)} className="text-ink-muted hover:text-red-400 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => audioInputRef.current?.click()}
                    className="flex items-center gap-2 text-ink-muted hover:text-ink text-sm
                      border border-dashed border-border hover:border-amber-400/50 rounded-xl px-4 py-3
                      transition-all w-full"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    {template.audioSlot?.label ?? 'Upload background music'}
                  </button>
                )}
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/mp3,audio/mp4,audio/x-m4a,audio/aac,audio/wav"
                  className="hidden"
                  onChange={(e) => e.target.files[0] && setAudioFile(e.target.files[0])}
                />
              </div>

              {/* Render button */}
              <div className="pt-2">
                <button
                  onClick={handleRender}
                  disabled={!allClipsReady}
                  className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
                    allClipsReady
                      ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20'
                      : 'bg-surface-700 text-ink-dim cursor-not-allowed opacity-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                    </svg>
                    {allClipsReady
                      ? `Render Memory Reel (${mrPhotos.length} photos · ~${mrEstDuration.toFixed(0)}s)`
                      : `Upload ${4 - mrPhotos.length} more photo${4 - mrPhotos.length !== 1 ? 's' : ''} to continue`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STANDARD TEMPLATES: original clip-slot UI
              ═══════════════════════════════════════════════════════════════════ */}
          {!isPhotoWall && !isMemoryReel && (
          <>
          {/* Clip slots */}
          <div className="space-y-4">
            <h3 className="text-ink font-semibold text-sm tracking-wide uppercase">Clip Slots</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {template.clipSlots.map((slot, i) => (
                <div key={slot.id} className="space-y-2">
                  {/* Slot number label */}
                  <p className="text-ink-dim text-xs font-mono">
                    {i + 1} — {slot.label}
                    <span className="ml-1 text-ink-dim/60">{slot.durationHint}</span>
                  </p>

                  {/* Drop zone OR trimmer */}
                  {slots[i].file ? (
                    <ClipTrimmer
                      file={slots[i].file}
                      durationHint={slot.durationHint}
                      onConfirm={(trimData) => handleSlotTrim(i, trimData)}
                      onRemove={() => handleSlotRemove(i)}
                    />
                  ) : (
                    <ClipDropZone
                      slot={slot}
                      onFile={(f) => handleSlotFile(i, f)}
                    />
                  )}

                  {/* Treatment selector — always visible below the slot */}
                  <div className="flex items-center gap-2">
                    <label className="text-ink-dim text-xs shrink-0">Look:</label>
                    <div className="flex gap-1 flex-wrap">
                      {(slot.treatmentOptions ?? ['none']).map((opt) => (
                        <button
                          key={opt}
                          onClick={() => handleTreatment(i, opt)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                            treatments[i] === opt
                              ? 'bg-accent text-white'
                              : 'bg-surface-700 text-ink-muted hover:text-ink'
                          }`}
                        >
                          {opt.charAt(0).toUpperCase() + opt.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Per-slot effects picker */}
                  <div className="pt-1">
                    <p className="text-ink-dim text-[10px] font-semibold uppercase tracking-widest mb-1.5">
                      Clip Effects
                    </p>
                    <EffectsPicker
                      selected={clipEffectsPerSlot[i]}
                      onChange={(ids) => handleSlotEffects(i, ids)}
                      compact
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Transitions ── */}
          {template.clipSlots.length > 1 && (
            <div className="space-y-3">
              <h3 className="text-ink font-semibold text-sm tracking-wide uppercase">
                Transitions
              </h3>
              <p className="text-ink-muted text-xs -mt-1">
                Applied between each clip
              </p>
              <TransitionPicker selected={selectedTransition} onChange={setSelectedTransition} />
            </div>
          )}

          {/* ── Global Effects ── */}
          <div className="space-y-3">
            <h3 className="text-ink font-semibold text-sm tracking-wide uppercase">
              Global Finish
            </h3>
            <div className="flex flex-wrap gap-2">
              {GLOBAL_EFFECTS_DATA.map(gfx => {
                const isOn = globalEffects.includes(gfx.id);
                return (
                  <button
                    key={gfx.id}
                    onClick={() =>
                      setGlobalEffects(prev =>
                        isOn ? prev.filter(x => x !== gfx.id) : [...prev, gfx.id]
                      )
                    }
                    title={gfx.description}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      isOn
                        ? 'bg-accent text-white border-accent'
                        : 'bg-surface-800 text-ink-muted border-border hover:border-accent/50 hover:text-ink'
                    }`}
                  >
                    {gfx.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Caption mode */}
          <div className="space-y-3">
            <h3 className="text-ink font-semibold text-sm tracking-wide uppercase">Captions</h3>
            <div className="flex flex-wrap gap-4">
              {['none', 'manual', 'auto'].map((m) => (
                <label key={m} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="captionMode"
                    value={m}
                    checked={captionMode === m}
                    onChange={() => setCaptionMode(m)}
                    className="accent-accent"
                  />
                  <span className="text-ink-muted text-sm">
                    {m === 'auto' ? 'Auto (Whisper)' : m === 'manual' ? 'I\'ll type my own' : 'No captions'}
                  </span>
                </label>
              ))}
            </div>

            {captionMode === 'manual' && (
              <div className="space-y-2">
                <p className="text-ink-dim text-xs">
                  One word per line followed by its start time in seconds.<br />
                  Example: <code className="text-accent">Amazing 0.5</code>
                </p>
                <textarea
                  value={manualCaptionsText}
                  onChange={(e) => setManualCaptionsText(e.target.value)}
                  placeholder={"Amazing 0.5\nplay 1.2\nright 2.0\nhere 2.8"}
                  rows={6}
                  className="w-full bg-surface-800 border border-border rounded-xl px-3 py-2 text-ink text-sm font-mono resize-y focus:outline-none focus:border-accent transition-colors"
                />
              </div>
            )}

            {captionMode === 'auto' && (
              <p className="text-ink-dim text-xs bg-surface-800 border border-border rounded-xl px-3 py-2">
                Requires <code className="text-accent">whisper-node</code> on the server.
                Run <code className="text-accent">npx whisper-node download</code> to install the model.
              </p>
            )}
          </div>

          {/* Audio (optional) */}
          <div className="space-y-3">
            <h3 className="text-ink font-semibold text-sm tracking-wide uppercase">
              Audio <span className="text-ink-dim font-normal normal-case text-xs">(optional)</span>
            </h3>
            {audioFile ? (
              <div className="flex items-center gap-3 bg-surface-800 border border-accent/40 rounded-xl p-3">
                <svg className="w-5 h-5 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                </svg>
                <span className="text-ink text-sm flex-1 truncate">{audioFile.name}</span>
                <button onClick={() => setAudioFile(null)} className="text-ink-muted hover:text-red-400 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                onClick={() => audioInputRef.current?.click()}
                className="flex items-center gap-2 text-ink-muted hover:text-ink text-sm border border-dashed border-border hover:border-accent/60 rounded-xl px-4 py-3 transition-all w-full"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                {template.audioSlot?.label ?? 'Upload audio'}
              </button>
            )}
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/mp3,audio/mp4,audio/x-m4a,audio/aac,audio/wav"
              className="hidden"
              onChange={(e) => e.target.files[0] && setAudioFile(e.target.files[0])}
            />
          </div>

          {/* Render button */}
          <div className="pt-2">
            <button
              onClick={handleRender}
              disabled={!allClipsReady || isRendering}
              className={`bg-accent text-white px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
                allClipsReady && !isRendering
                  ? 'hover:bg-accent/90 shadow-lg shadow-accent/20'
                  : 'opacity-40 cursor-not-allowed'
              }`}
            >
              <span className="flex items-center gap-2">
                {isRendering ? (
                  <>
                    <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    Rendering…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                    </svg>
                    {allClipsReady
                      ? 'Render Video'
                      : `Confirm trim for all ${template.clipSlots.length} clips to continue`}
                  </>
                )}
              </span>
            </button>

            {!allClipsReady && (
              <p className="text-ink-dim text-xs mt-2">
                {slots.filter(s => s.trim).length} / {template.clipSlots.length} clips trimmed &amp; confirmed
              </p>
            )}
          </div>
          </>
          )} {/* end !isPhotoWall */}
        </>
      )}
    </div>
  );
}
