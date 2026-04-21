import { useState, useRef, useEffect, useCallback } from 'react';

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseDurationHint(hint) {
  if (!hint) return { min: null, max: null };
  const m = String(hint).match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  return m ? { min: parseFloat(m[1]), max: parseFloat(m[2]) } : { min: null, max: null };
}

function fmtS(s) {
  return Number(s).toFixed(1) + 's';
}

// ── ClipTrimmer ───────────────────────────────────────────────────────────────

/**
 * Inline clip trimmer shown inside each template slot after a video is uploaded.
 *
 * Props:
 *   file         {File}     — the uploaded video file
 *   durationHint {string}   — e.g. "2-4s"  (parsed for the soft warning)
 *   onConfirm    {Function} — called with { trimStart, trimEnd, thumbnailUrl } on confirm,
 *                             or null when the user clicks "Edit trim" (signals unconfirmed)
 *   onRemove     {Function} — called when the user wants to swap / remove the file
 */
export default function ClipTrimmer({ file, durationHint, onConfirm, onRemove }) {
  const [objectUrl,  setObjectUrl]  = useState(null);
  const [duration,   setDuration]   = useState(0);
  const [trimStart,  setTrimStart]  = useState(0);
  const [trimEnd,    setTrimEnd]    = useState(0);
  const [playhead,   setPlayhead]   = useState(0); // 0-1 fraction of total duration
  const [confirmed,  setConfirmed]  = useState(false);
  const [thumbnail,  setThumbnail]  = useState(null);

  // Refs — used inside document event handlers to avoid stale closures
  const videoRef      = useRef(null);
  const barRef        = useRef(null);
  const draggingRef   = useRef(null);   // 'left' | 'right' | null
  const loopingRef    = useRef(false);
  const trimStartRef  = useRef(0);
  const trimEndRef    = useRef(0);
  const durationRef   = useRef(0);

  // Keep refs in sync with state
  useEffect(() => { trimStartRef.current = trimStart; }, [trimStart]);
  useEffect(() => { trimEndRef.current   = trimEnd;   }, [trimEnd]);
  useEffect(() => { durationRef.current  = duration;  }, [duration]);

  const { min: hintMin, max: hintMax } = parseDurationHint(durationHint);

  // ── Object URL ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    // Reset all state when file changes
    setDuration(0);
    setTrimStart(0);
    setTrimEnd(0);
    setPlayhead(0);
    setConfirmed(false);
    setThumbnail(null);
    loopingRef.current = false;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ── Video event handlers ────────────────────────────────────────────────────

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    const dur    = v.duration;
    const initEnd = hintMax ? Math.min(hintMax, dur) : dur;
    setDuration(dur);
    setTrimEnd(initEnd);
    trimEndRef.current = initEnd;
    durationRef.current = dur;
    v.currentTime = 0;
  };

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || !durationRef.current) return;
    setPlayhead(v.currentTime / durationRef.current);
    // Enforce loop within trim window
    if (loopingRef.current && v.currentTime >= trimEndRef.current) {
      v.currentTime = trimStartRef.current;
      v.play().catch(() => {});
    }
  }, []);

  // ── Loop playback ───────────────────────────────────────────────────────────

  const startLoop = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    loopingRef.current = true;
    v.currentTime = trimStartRef.current;
    v.play().catch(() => {});
  }, []);

  // ── Drag logic ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const getClientX = (e) => (e.touches ? e.touches[0].clientX : e.clientX);

    const onMove = (e) => {
      if (!draggingRef.current || !barRef.current) return;
      const { left, width } = barRef.current.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (getClientX(e) - left) / width));
      const pos  = frac * durationRef.current;

      if (draggingRef.current === 'left') {
        const newStart = Math.max(0, Math.min(pos, trimEndRef.current - 0.5));
        trimStartRef.current = newStart;
        setTrimStart(newStart);
        // Seek video so user sees the frame at the new start
        if (videoRef.current) videoRef.current.currentTime = newStart;
      } else {
        const newEnd = Math.min(durationRef.current, Math.max(pos, trimStartRef.current + 0.5));
        trimEndRef.current = newEnd;
        setTrimEnd(newEnd);
      }
    };

    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = null;
      startLoop();
    };

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
  }, [startLoop]);

  const handleLeftDown = (e) => {
    e.preventDefault();
    loopingRef.current = false;
    videoRef.current?.pause();
    draggingRef.current = 'left';
  };

  const handleRightDown = (e) => {
    e.preventDefault();
    loopingRef.current = false;
    videoRef.current?.pause();
    draggingRef.current = 'right';
  };

  // ── Confirm ─────────────────────────────────────────────────────────────────

  const handleConfirm = async () => {
    const v = videoRef.current;
    let thumb = null;

    if (v && v.videoWidth > 0) {
      try {
        // Seek to trimStart and capture that frame as thumbnail
        await new Promise((res, rej) => {
          const timeout = setTimeout(rej, 3000);
          const onSeeked = () => {
            clearTimeout(timeout);
            v.removeEventListener('seeked', onSeeked);
            res();
          };
          v.addEventListener('seeked', onSeeked);
          v.currentTime = trimStartRef.current;
        });
        const canvas = document.createElement('canvas');
        canvas.width  = v.videoWidth;
        canvas.height = v.videoHeight;
        canvas.getContext('2d').drawImage(v, 0, 0);
        thumb = canvas.toDataURL('image/jpeg', 0.75);
      } catch { /* best-effort — thumbnail is cosmetic */ }
    }

    setThumbnail(thumb);
    setConfirmed(true);
    loopingRef.current = false;
    videoRef.current?.pause();
    onConfirm({ trimStart: trimStartRef.current, trimEnd: trimEndRef.current, thumbnailUrl: thumb });
  };

  const handleEditTrim = () => {
    setConfirmed(false);
    onConfirm(null); // parent marks this slot as unconfirmed
    // Small delay so the video element remounts before we start loop
    requestAnimationFrame(startLoop);
  };

  // ── Derived values for render ────────────────────────────────────────────────

  const selStart  = duration > 0 ? (trimStart / duration) * 100 : 0;
  const selWidth  = duration > 0 ? ((trimEnd - trimStart) / duration) * 100 : 100;
  const selDur    = trimEnd - trimStart;
  const outOfHint = (hintMin && selDur < hintMin) || (hintMax && selDur > hintMax);

  // ── Confirmed compact view ───────────────────────────────────────────────────

  if (confirmed) {
    return (
      <div className="flex items-center gap-3 bg-surface-800 border border-accent/40 rounded-xl p-3">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt="clip thumbnail"
            className="w-14 h-10 object-cover rounded-lg shrink-0"
          />
        ) : (
          <div className="w-14 h-10 rounded-lg bg-surface-700 shrink-0 flex items-center justify-center">
            <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              <path d="M14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
            </svg>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-ink text-xs font-medium truncate">{file.name}</p>
          <p className="text-ink-muted text-xs mt-0.5">
            {fmtS(trimStart)} → {fmtS(trimEnd)}
            <span className="ml-2 px-1 py-0.5 rounded bg-accent/20 text-accent font-semibold text-xs">
              {fmtS(selDur)}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleEditTrim}
            className="text-accent text-xs font-medium hover:underline"
          >
            Edit trim
          </button>
          <button
            onClick={onRemove}
            className="text-ink-dim hover:text-red-400 transition-colors"
            title="Remove clip"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // ── Trimmer view ─────────────────────────────────────────────────────────────

  return (
    <div className="bg-surface-800 border border-accent/30 rounded-xl overflow-hidden">

      {/* Video preview */}
      <div className="relative bg-black" style={{ aspectRatio: '16/9' }}>
        {objectUrl && (
          <video
            ref={videoRef}
            src={objectUrl}
            className="w-full h-full object-contain"
            muted
            playsInline
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
          />
        )}
        {/* Remove / swap file button */}
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/80 transition-colors z-10"
          title="Remove clip"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Trim controls */}
      <div className="p-3 space-y-2.5">

        {/* Trim bar */}
        <div
          ref={barRef}
          className="relative rounded-lg bg-surface-700 select-none"
          style={{ height: 36 }}
        >
          {/* Selection fill */}
          <div
            className="absolute top-0 h-full rounded-md bg-accent/25 border border-accent/50 pointer-events-none"
            style={{ left: `${selStart}%`, width: `${Math.max(0, selWidth)}%` }}
          />

          {/* Playhead */}
          {duration > 0 && (
            <div
              className="absolute top-0 h-full pointer-events-none z-10"
              style={{ left: `${playhead * 100}%`, width: 2, background: 'rgba(255,255,255,0.75)' }}
            />
          )}

          {/* Left drag handle */}
          <div
            onMouseDown={handleLeftDown}
            onTouchStart={handleLeftDown}
            className="absolute top-0 h-full rounded-l-md bg-accent z-20 flex items-center justify-center"
            style={{ left: `${selStart}%`, width: 12, cursor: 'ew-resize' }}
          >
            <div style={{ width: 2, height: 16, background: 'rgba(255,255,255,0.6)', borderRadius: 9999 }} />
          </div>

          {/* Right drag handle */}
          <div
            onMouseDown={handleRightDown}
            onTouchStart={handleRightDown}
            className="absolute top-0 h-full rounded-r-md bg-accent z-20 flex items-center justify-center"
            style={{
              left:   `${selStart + selWidth}%`,
              width:  12,
              cursor: 'ew-resize',
              transform: 'translateX(-12px)',
            }}
          >
            <div style={{ width: 2, height: 16, background: 'rgba(255,255,255,0.6)', borderRadius: 9999 }} />
          </div>
        </div>

        {/* Time labels */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-ink-muted">{fmtS(trimStart)}</span>
            <span className="text-ink-dim">→</span>
            <span className="text-ink-muted">{fmtS(trimEnd)}</span>
            <span className="px-1.5 py-0.5 rounded bg-accent/20 text-accent font-semibold">
              {fmtS(selDur)}
            </span>
          </div>
          {outOfHint && duration > 0 && (
            <span className="text-amber-400 text-xs">Best at {durationHint}</span>
          )}
        </div>

        {/* Confirm */}
        <button
          onClick={handleConfirm}
          disabled={selDur < 0.5 || duration === 0}
          className={`w-full py-2 rounded-lg text-sm font-semibold transition-all ${
            selDur >= 0.5 && duration > 0
              ? 'bg-accent text-white hover:bg-accent/90'
              : 'bg-surface-700 text-ink-dim cursor-not-allowed'
          }`}
        >
          {duration === 0 ? 'Loading…' : 'Confirm trim'}
        </button>

      </div>
    </div>
  );
}
