import { useState, useRef, useCallback, useEffect } from 'react';
import EffectsPicker    from './EffectsPicker.jsx';
import TransitionPicker from './TransitionPicker.jsx';
import { GLOBAL_EFFECTS_DATA } from '../data/effectsData.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtTime(s) {
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function drawWaveform(canvas, peaks, trimStart, trimEnd, duration, playheadFrac) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  if (!W || !H || peaks.length === 0 || duration === 0) return;

  const selL = (trimStart / duration) * W;
  const selR = (trimEnd   / duration) * W;
  const barW = W / peaks.length;

  // Dark background
  ctx.fillStyle = '#12111a';
  ctx.fillRect(0, 0, W, H);

  // Bars
  for (let i = 0; i < peaks.length; i++) {
    const cx   = (i + 0.5) * barW;
    const barH = Math.max(2, peaks[i] * H * 0.85);
    const y    = (H - barH) / 2;
    const inSel = cx >= selL && cx <= selR;
    ctx.fillStyle = inSel ? 'rgba(139,92,246,0.88)' : 'rgba(139,92,246,0.22)';
    ctx.fillRect(Math.round(cx) - 1, Math.round(y), 2, Math.round(barH));
  }

  // Dim outer regions
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  if (selL > 0)   ctx.fillRect(0,    0, selL,   H);
  if (selR < W)   ctx.fillRect(selR, 0, W-selR, H);

  // Playhead
  if (playheadFrac > 0 && playheadFrac <= 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(Math.round(playheadFrac * W), 0, 2, H);
  }
}

// ── Audio Trim Panel ───────────────────────────────────────────────────────

function AudioTrimPanel({ file, initialTrim, onConfirm, onCancel }) {
  const [loading,        setLoading]        = useState(true);
  const [peaks,          setPeaks]          = useState([]);
  const [duration,       setDuration]       = useState(0);
  const [localStart,     setLocalStart]     = useState(initialTrim?.trimStart ?? 0);
  const [localEnd,       setLocalEnd]       = useState(0);   // set after decode
  const [isPlaying,      setIsPlaying]      = useState(false);
  const [playheadFrac,   setPlayheadFrac]   = useState(0);

  const canvasRef    = useRef(null);
  const containerRef = useRef(null);
  const draggingRef  = useRef(null); // 'left' | 'right' | null

  // Refs to avoid stale closures in event handlers
  const localStartRef = useRef(initialTrim?.trimStart ?? 0);
  const localEndRef   = useRef(0);
  const durationRef   = useRef(0);

  useEffect(() => { localStartRef.current = localStart; }, [localStart]);
  useEffect(() => { localEndRef.current   = localEnd;   }, [localEnd]);
  useEffect(() => { durationRef.current   = duration;   }, [duration]);

  // Web Audio refs
  const audioCtxRef     = useRef(null);
  const audioBufferRef  = useRef(null);
  const sourceNodeRef   = useRef(null);
  const playCtxStartRef = useRef(0);  // ctx.currentTime when play pressed
  const playAudioStartRef = useRef(0); // trimStart when play pressed
  const rafRef          = useRef(null);

  // ── Decode audio + generate peaks ──────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;

        const arrayBuf = await file.arrayBuffer();
        const buf      = await ctx.decodeAudioData(arrayBuf);
        if (cancelled) return;

        audioBufferRef.current = buf;
        const dur = buf.duration;
        durationRef.current = dur;
        setDuration(dur);

        const initEnd = initialTrim?.trimEnd ?? dur;
        localEndRef.current = initEnd;
        setLocalEnd(initEnd);

        // Sample 300 peak values across channel 0
        const data     = buf.getChannelData(0);
        const numPeaks = 300;
        const step     = Math.max(1, Math.floor(data.length / numPeaks));
        const arr = [];
        for (let i = 0; i < numPeaks; i++) {
          let max = 0;
          for (let j = 0; j < step; j++) {
            const v = Math.abs(data[i * step + j] ?? 0);
            if (v > max) max = v;
          }
          arr.push(max);
        }
        setPeaks(arr);
        setLoading(false);
      } catch (err) {
        console.error('[waveform] decode error:', err);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      try { sourceNodeRef.current?.stop(); } catch {}
      audioCtxRef.current?.close().catch(() => {});
    };
  }, [file]); // eslint-disable-line

  // ── Draw waveform on canvas ──────────────────────────────────────────────

  useEffect(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || peaks.length === 0) return;
    canvas.width  = container.clientWidth;
    canvas.height = 64;
    drawWaveform(canvas, peaks, localStart, localEnd, duration, playheadFrac);
  }, [peaks, localStart, localEnd, duration, playheadFrac]);

  // ── Drag handles ─────────────────────────────────────────────────────────

  useEffect(() => {
    const getX = (e) => e.touches ? e.touches[0].clientX : e.clientX;

    const onMove = (e) => {
      if (!draggingRef.current || !containerRef.current) return;
      const { left, width } = containerRef.current.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (getX(e) - left) / width));
      const pos  = frac * durationRef.current;

      if (draggingRef.current === 'left') {
        const ns = Math.max(0, Math.min(pos, localEndRef.current - 1));
        localStartRef.current = ns;
        setLocalStart(ns);
      } else {
        const ne = Math.min(durationRef.current, Math.max(pos, localStartRef.current + 1));
        localEndRef.current = ne;
        setLocalEnd(ne);
      }
    };

    const onUp = () => { draggingRef.current = null; };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend',  onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend',  onUp);
    };
  }, []);

  // ── Audio preview playback ───────────────────────────────────────────────

  const stopPlayback = useCallback(() => {
    try { sourceNodeRef.current?.stop(); } catch {}
    cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
  }, []);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) { stopPlayback(); return; }

    const ctx = audioCtxRef.current;
    const buf = audioBufferRef.current;
    if (!ctx || !buf) return;

    const src  = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);

    const start = localStartRef.current;
    const dur   = localEndRef.current - start;
    src.start(0, start, dur);
    sourceNodeRef.current    = src;
    playCtxStartRef.current  = ctx.currentTime;
    playAudioStartRef.current = start;

    src.onended = () => {
      setIsPlaying(false);
      setPlayheadFrac(localEndRef.current / durationRef.current);
      cancelAnimationFrame(rafRef.current);
    };
    setIsPlaying(true);

    const animate = () => {
      const elapsed   = ctx.currentTime - playCtxStartRef.current;
      const audioTime = playAudioStartRef.current + elapsed;
      setPlayheadFrac(Math.min(1, audioTime / durationRef.current));
      if (audioTime < localEndRef.current) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
  }, [isPlaying, stopPlayback]);

  // ── Derived values ───────────────────────────────────────────────────────

  const selPct    = duration > 0 ? (localStart / duration) * 100 : 0;
  const widthPct  = duration > 0 ? ((localEnd - localStart) / duration) * 100 : 100;
  const selDurSec = Math.round(localEnd - localStart);

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mt-2 flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-700 border border-border">
        <div className="spinner shrink-0" style={{ width: 16, height: 16, borderWidth: 2 }} />
        <span className="text-ink-muted text-sm">Analyzing waveform…</span>
      </div>
    );
  }

  return (
    <div className="mt-2 p-4 rounded-xl bg-surface-700 border border-border space-y-3 animate-fade-up">
      <p className="text-ink-dim text-xs font-semibold uppercase tracking-widest">Trim audio</p>

      {/* Waveform canvas + drag handles */}
      <div
        ref={containerRef}
        className="relative rounded-lg overflow-hidden select-none"
        style={{ height: 64 }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: 64 }}
        />

        {/* Left handle */}
        <div
          onMouseDown={(e) => { e.preventDefault(); draggingRef.current = 'left'; }}
          onTouchStart={(e) => { e.preventDefault(); draggingRef.current = 'left'; }}
          className="absolute top-0 bottom-0 flex items-center justify-center z-10"
          style={{ left: `${selPct}%`, width: 20, transform: 'translateX(-10px)', cursor: 'ew-resize' }}
        >
          <div className="w-3 h-12 bg-accent rounded-full shadow-lg flex items-center justify-center">
            <div style={{ width: 2, height: 20, background: 'rgba(255,255,255,0.6)', borderRadius: 9999 }} />
          </div>
        </div>

        {/* Right handle */}
        <div
          onMouseDown={(e) => { e.preventDefault(); draggingRef.current = 'right'; }}
          onTouchStart={(e) => { e.preventDefault(); draggingRef.current = 'right'; }}
          className="absolute top-0 bottom-0 flex items-center justify-center z-10"
          style={{ left: `${selPct + widthPct}%`, width: 20, transform: 'translateX(-10px)', cursor: 'ew-resize' }}
        >
          <div className="w-3 h-12 bg-accent rounded-full shadow-lg flex items-center justify-center">
            <div style={{ width: 2, height: 20, background: 'rgba(255,255,255,0.6)', borderRadius: 9999 }} />
          </div>
        </div>
      </div>

      {/* Time labels + preview button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <span className="text-ink-muted">{fmtTime(localStart)}</span>
          <span className="text-ink-dim">→</span>
          <span className="text-ink-muted">{fmtTime(localEnd)}</span>
          <span className="mx-1 text-ink-dim">·</span>
          <span className="px-1.5 py-0.5 rounded bg-accent/20 text-accent font-semibold">
            {selDurSec}s
          </span>
        </div>

        <button
          onClick={handlePlayPause}
          className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors
            px-2.5 py-1.5 rounded-lg bg-surface-600 hover:bg-surface-500"
        >
          {isPlaying ? (
            <>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              Pause
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Preview
            </>
          )}
        </button>
      </div>

      {/* Confirm / Cancel */}
      <div className="flex gap-2 pt-0.5">
        <button
          onClick={() => { stopPlayback(); onConfirm({ trimStart: localStartRef.current, trimEnd: localEndRef.current }); }}
          className="flex-1 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90 transition-colors"
        >
          Confirm
        </button>
        <button
          onClick={() => { stopPlayback(); onCancel(); }}
          className="px-4 py-2 rounded-lg bg-surface-600 text-ink-muted text-sm hover:bg-surface-500 hover:text-ink transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Photo card ─────────────────────────────────────────────────────────────

function PhotoCard({ photo, index, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd, onRemove }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDrop={(e)     => { e.preventDefault(); onDrop(); }}
      onDragEnd={onDragEnd}
      className={`relative group aspect-square rounded-xl overflow-hidden cursor-grab active:cursor-grabbing border-2 transition-all duration-150
        ${isDragOver ? 'border-violet-400 scale-105' : 'border-border hover:border-border-light'}`}
    >
      <img src={photo.previewUrl} alt={photo.file.name} className="w-full h-full object-cover" />
      <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-black/70 text-white text-xs font-mono flex items-center justify-center">
        {index + 1}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-red-500/80 text-white text-xs
          opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
      >×</button>
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity
        flex items-center justify-center pointer-events-none">
        <svg className="w-5 h-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
        </svg>
      </div>
    </div>
  );
}

function MoodBadge({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-ink-dim text-xs font-mono">{label}</span>
      <span className="label-tag">{value}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function CollageMode() {
  const [photos,        setPhotos]        = useState([]);
  const [audioFile,     setAudioFile]     = useState(null);
  const [audioTrim,     setAudioTrim]     = useState(null);  // { trimStart, trimEnd } | null
  const [trimPanelOpen, setTrimPanelOpen] = useState(false);

  // Target duration
  const [targetEnabled,  setTargetEnabled]  = useState(false);
  const [targetDuration, setTargetDuration] = useState(30);

  // Effects & transitions
  const [clipEffects,        setClipEffects]        = useState([]);
  const [selectedTransition, setSelectedTransition] = useState('hard_cut');
  const [globalEffects,      setGlobalEffects]      = useState([]);
  const [effectsOpen,        setEffectsOpen]        = useState(false);

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [draggedIdx,     setDraggedIdx]     = useState(null);
  const [dragOverIdx,    setDragOverIdx]    = useState(null);
  const [stage,          setStage]          = useState('idle');
  const [statusMsg,      setStatusMsg]      = useState('');
  const [result,         setResult]         = useState(null);
  const [error,          setError]          = useState('');

  const photoInputRef = useRef(null);
  const audioInputRef = useRef(null);

  useEffect(() => {
    return () => photos.forEach(p => URL.revokeObjectURL(p.previewUrl));
  }, []); // eslint-disable-line

  // ── Photo management ──────────────────────────────────────────────────────

  const addPhotos = useCallback((files) => {
    const valid = Array.from(files).filter(f => /\.(jpg|jpeg|png)$/i.test(f.name));
    const entries = valid.map(file => ({
      id:         Math.random().toString(36).slice(2),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setPhotos(prev => [...prev, ...entries].slice(0, 20));
  }, []);

  const removePhoto = useCallback((id) => {
    setPhotos(prev => {
      const p = prev.find(x => x.id === id);
      if (p) URL.revokeObjectURL(p.previewUrl);
      return prev.filter(x => x.id !== id);
    });
  }, []);

  const reorder = useCallback((from, to) => {
    if (from === to) return;
    setPhotos(prev => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  }, []);

  const onDropZone = useCallback((e) => {
    e.preventDefault();
    setIsDraggingFile(false);
    addPhotos(e.dataTransfer.files);
  }, [addPhotos]);

  // ── Audio file change ─────────────────────────────────────────────────────

  const handleAudioChange = (file) => {
    setAudioFile(file ?? null);
    setAudioTrim(null);
    setTrimPanelOpen(false);
  };

  // ── Generate ──────────────────────────────────────────────────────────────

  const generate = useCallback(async () => {
    if (photos.length < 2) return;
    setStage('generating');
    setError('');
    setResult(null);

    try {
      const fd = new FormData();
      photos.forEach(p => fd.append('photos', p.file));
      if (audioFile) {
        fd.append('audio', audioFile);
        if (audioTrim) {
          fd.append('audioTrimStart', audioTrim.trimStart.toFixed(3));
          fd.append('audioTrimEnd',   audioTrim.trimEnd.toFixed(3));
        }
      }
      if (targetEnabled && targetDuration > 0) {
        fd.append('targetDuration', String(targetDuration));
      }

      // Effects & transitions
      if (clipEffects.length > 0) {
        fd.append('clipEffects', JSON.stringify(clipEffects));
      }
      // Always send transition (server handles 'hard_cut' → concat path)
      fd.append('transitions', JSON.stringify([selectedTransition]));
      if (globalEffects.length > 0) {
        fd.append('globalEffects', JSON.stringify(globalEffects));
      }

      const res = await fetch('/api/collage', { method: 'POST', body: fd });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Server error');
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
              const d = JSON.parse(line.slice(6));
              if (d.type === 'status')   setStatusMsg(d.message);
              if (d.type === 'analyzed') setStatusMsg(`Mood: ${d.mood} · ${d.colorGrade} grade · ${d.transition} transitions`);
              if (d.type === 'complete') { setResult(d); setStage('done'); }
              if (d.type === 'error')    { setError(d.message); setStage('error'); }
            } catch {}
          }
        }
      }
    } catch (err) {
      setError(err.message);
      setStage('error');
    }
  }, [photos, audioFile, audioTrim, targetEnabled, targetDuration, clipEffects, selectedTransition, globalEffects]);

  const reset = () => {
    photos.forEach(p => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    setAudioFile(null);
    setAudioTrim(null);
    setTrimPanelOpen(false);
    setTargetEnabled(false);
    setTargetDuration(30);
    setClipEffects([]);
    setSelectedTransition('hard_cut');
    setGlobalEffects([]);
    setEffectsOpen(false);
    setStage('idle');
    setResult(null);
    setError('');
    setStatusMsg('');
  };

  // ── Done state ────────────────────────────────────────────────────────────

  if (stage === 'done' && result) {
    const { outputUrl, filename, metadata } = result;
    return (
      <div className="w-full max-w-lg mx-auto space-y-6 animate-fade-up">
        <div className="card overflow-hidden">
          <video src={outputUrl} className="w-full aspect-[9/16] object-cover bg-black"
            controls autoPlay loop playsInline />
        </div>
        {metadata && (
          <div className="flex justify-center gap-6 flex-wrap">
            <MoodBadge label="MOOD"     value={metadata.mood} />
            <MoodBadge label="GRADE"    value={metadata.colorGrade} />
            <MoodBadge label="PHOTOS"   value={`${metadata.photoCount} clips`} />
            <MoodBadge label="DURATION" value={`${metadata.duration}s`} />
          </div>
        )}
        <div className="flex gap-3 justify-center">
          <a href={outputUrl} download={filename ?? 'collage.mp4'} className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download MP4
          </a>
          <button onClick={reset} className="btn-ghost">Make Another</button>
        </div>
      </div>
    );
  }

  // ── Generating state ──────────────────────────────────────────────────────

  if (stage === 'generating') {
    return (
      <div className="w-full max-w-md mx-auto flex flex-col items-center gap-6 py-10 animate-fade-up">
        <div className="w-14 h-14 rounded-2xl bg-accent-muted flex items-center justify-center">
          <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
        </div>
        <div className="text-center space-y-1">
          <p className="text-ink font-semibold">Building your collage…</p>
          <p className="text-ink-muted text-sm max-w-xs">{statusMsg || 'Analyzing photos with Claude…'}</p>
        </div>
        <div className="w-full h-1 bg-surface-700 rounded-full overflow-hidden">
          <div className="h-full shimmer-bar w-full" />
        </div>
        <p className="text-ink-dim text-xs font-mono">This takes 20–60 seconds</p>
      </div>
    );
  }

  // ── Idle / upload state ───────────────────────────────────────────────────

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">

      {/* Error banner */}
      {stage === 'error' && error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm animate-fade-up">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          {error}
        </div>
      )}

      {/* Photo drop zone */}
      <div
        className={`flex flex-col items-center justify-center gap-4 px-8 py-10 border-2 border-dashed rounded-2xl
          cursor-pointer transition-all duration-200
          ${isDraggingFile ? 'drop-zone-active border-violet-400' : 'border-border hover:border-violet-500/50 hover:bg-surface-700/30'}`}
        onClick={() => photoInputRef.current?.click()}
        onDrop={onDropZone}
        onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
        onDragLeave={() => setIsDraggingFile(false)}
      >
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-200
          ${isDraggingFile ? 'bg-accent-muted' : 'bg-surface-700'}`}>
          <svg className={`w-6 h-6 ${isDraggingFile ? 'text-violet-400' : 'text-ink-muted'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-ink font-semibold">
            {photos.length === 0 ? 'Drop photos here' : 'Add more photos'}
          </p>
          <p className="text-ink-muted text-sm mt-0.5">JPG or PNG · up to 20 photos · drag to reorder</p>
        </div>
        <input ref={photoInputRef} type="file" accept=".jpg,.jpeg,.png" multiple className="hidden"
          onChange={e => addPhotos(e.target.files)} />
      </div>

      {/* Thumbnail grid */}
      {photos.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-ink-muted text-xs font-mono">{photos.length} / 20 photos · drag to reorder</p>
            <button onClick={() => setPhotos([])} className="text-ink-dim text-xs hover:text-red-400 transition-colors">Clear all</button>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
            {photos.map((photo, i) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                index={i}
                isDragOver={dragOverIdx === i}
                onDragStart={() => setDraggedIdx(i)}
                onDragOver={() => setDragOverIdx(i)}
                onDrop={() => { reorder(draggedIdx, i); setDragOverIdx(null); }}
                onDragEnd={() => { setDraggedIdx(null); setDragOverIdx(null); }}
                onRemove={() => removePhoto(photo.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Music row + trim panel ── */}
      <div>
        <div className={`flex items-center gap-4 px-4 py-3 rounded-xl border transition-all duration-200
          ${audioFile ? 'border-violet-500/40 bg-accent-muted' : 'border-border bg-surface-800'}`}>
          <div className="w-8 h-8 rounded-lg bg-surface-700 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            {audioFile ? (
              <div>
                <p className="text-ink text-sm font-medium truncate">{audioFile.name}</p>
                <p className="text-violet-400 text-xs font-mono">
                  {audioTrim
                    ? `${fmtTime(audioTrim.trimStart)} – ${fmtTime(audioTrim.trimEnd)} · beat-synced`
                    : 'Beat-synced cuts enabled'}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-ink text-sm font-medium">Add music <span className="text-ink-dim font-normal">(optional)</span></p>
                <p className="text-ink-muted text-xs">MP3 or M4A — cuts will sync to the beat</p>
              </div>
            )}
          </div>

          {audioFile ? (
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => setTrimPanelOpen(o => !o)}
                className={`text-xs font-medium transition-colors ${
                  trimPanelOpen ? 'text-accent' : 'text-ink-dim hover:text-ink'
                }`}
              >
                {trimPanelOpen ? 'Close' : 'Trim'}
              </button>
              <button
                onClick={() => handleAudioChange(null)}
                className="text-ink-dim hover:text-red-400 transition-colors text-xs"
              >
                Remove
              </button>
            </div>
          ) : (
            <button onClick={() => audioInputRef.current?.click()}
              className="btn-ghost text-xs py-1.5 shrink-0">Browse</button>
          )}

          <input ref={audioInputRef} type="file" accept=".mp3,.m4a,.aac,.wav" className="hidden"
            onChange={e => handleAudioChange(e.target.files[0] ?? null)} />
        </div>

        {/* Inline trim panel */}
        {audioFile && trimPanelOpen && (
          <AudioTrimPanel
            key={audioFile.name} /* remount if file changes */
            file={audioFile}
            initialTrim={audioTrim}
            onConfirm={(trim) => { setAudioTrim(trim); setTrimPanelOpen(false); }}
            onCancel={() => setTrimPanelOpen(false)}
          />
        )}
      </div>

      {/* ── Target duration ── */}
      <div className="px-4 py-3 rounded-xl border border-border bg-surface-800 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-ink text-sm font-medium">Set target duration
              <span className="ml-1.5 text-ink-dim font-normal text-xs">(optional)</span>
            </p>
            <p className="text-ink-muted text-xs mt-0.5">Override Claude's timing to hit a specific length</p>
          </div>
          {/* Toggle switch */}
          <button
            onClick={() => setTargetEnabled(v => !v)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              targetEnabled ? 'bg-accent' : 'bg-surface-600'
            }`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              targetEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        {targetEnabled && (
          <div className="space-y-2 pt-1 animate-fade-up">
            <div className="flex items-baseline gap-2">
              <span className="text-ink text-3xl font-bold font-mono tabular-nums">{targetDuration}</span>
              <span className="text-ink-muted text-sm">seconds</span>
            </div>
            <input
              type="range"
              min={5} max={60} step={1}
              value={targetDuration}
              onChange={e => setTargetDuration(Number(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-ink-dim text-xs font-mono">
              <span>5s</span>
              <span>30s</span>
              <span>60s</span>
            </div>
            {photos.length >= 2 && (
              <p className="text-ink-dim text-xs">
                ~{(targetDuration / photos.length).toFixed(1)}s per photo across {photos.length} photos
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Effects & Style ── */}
      <div className="rounded-xl border border-border bg-surface-800 overflow-hidden">
        {/* Collapsible header */}
        <button
          onClick={() => setEffectsOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-700/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
            </svg>
            <span className="text-ink text-sm font-medium">Effects &amp; Style</span>
            {(clipEffects.length > 0 || selectedTransition !== 'hard_cut' || globalEffects.length > 0) && (
              <span className="px-1.5 py-0.5 rounded-full bg-accent/20 text-accent text-xs font-mono">
                {[
                  clipEffects.length > 0 && `${clipEffects.length} fx`,
                  selectedTransition !== 'hard_cut' && selectedTransition,
                  globalEffects.length > 0 && `${globalEffects.length} global`,
                ].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          <svg
            className={`w-4 h-4 text-ink-dim transition-transform duration-200 ${effectsOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {effectsOpen && (
          <div className="px-4 pb-4 space-y-5 border-t border-border animate-fade-up">

            {/* Clip effects */}
            <div className="pt-4 space-y-2">
              <p className="text-ink-dim text-xs font-semibold uppercase tracking-widest">
                Apply to all photos
              </p>
              <EffectsPicker selected={clipEffects} onChange={setClipEffects} />
            </div>

            {/* Transition style */}
            <div className="space-y-2">
              <p className="text-ink-dim text-xs font-semibold uppercase tracking-widest">
                Transition style
              </p>
              <TransitionPicker selected={selectedTransition} onChange={setSelectedTransition} />
            </div>

            {/* Global effects */}
            <div className="space-y-2">
              <p className="text-ink-dim text-xs font-semibold uppercase tracking-widest">
                Global finish
              </p>
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        isOn
                          ? 'bg-accent text-white border-accent'
                          : 'bg-surface-700 text-ink-muted border-border hover:border-accent/50 hover:text-ink'
                      }`}
                    >
                      {gfx.label}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Generate button */}
      <button
        onClick={generate}
        disabled={photos.length < 2}
        className="btn-primary w-full justify-center py-3 text-base"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
        </svg>
        {photos.length < 2
          ? `Add ${2 - photos.length} more photo${photos.length === 1 ? '' : 's'} to start`
          : `Generate Collage from ${photos.length} photos`}
      </button>
    </div>
  );
}
