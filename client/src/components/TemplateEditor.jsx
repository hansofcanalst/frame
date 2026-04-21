import { useState, useRef, useCallback } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

const ASPECT_PRESETS = {
  '9:16': { width: 1080, height: 1920, label: '9:16 — Vertical (Stories / Shorts)' },
  '1:1':  { width: 1080, height: 1080, label: '1:1 — Square' },
  '16:9': { width: 1920, height: 1080, label: '16:9 — Horizontal (YouTube)' },
};

const FPS_OPTIONS = [24, 30, 60];

const SLOT_TYPES = [
  { value: 'video',  label: 'Video' },
  { value: 'photo',  label: 'Photo' },
  { value: 'either', label: 'Either' },
];

const TREATMENTS = ['throwback', 'modern', 'none'];

const TRANSITIONS = [
  { value: 'hard-cut', label: 'Hard Cut' },
  { value: 'fade',     label: 'Fade' },
  { value: 'flash',    label: 'Flash White' },
  { value: 'zoom_in',  label: 'Zoom In' },
  { value: 'slide',    label: 'Slide Left' },
];

const CAPTION_MODES = [
  { value: 'none',         label: 'None' },
  { value: 'manual',       label: 'Manual' },
  { value: 'word-by-word', label: 'Auto (Whisper)' },
];

const FONTS = ['Anton', 'Impact', 'Oswald', 'Bebas Neue'];

const EFFECT_TYPES = [
  { value: 'colorGrade', label: 'Color Grade' },
  { value: 'grain',      label: 'Grain' },
  { value: 'vignette',   label: 'Vignette' },
  { value: 'speed',      label: 'Speed' },
  { value: 'blur',       label: 'Blur' },
  { value: 'custom',     label: 'Custom FFmpeg' },
];

const EFFECT_DEFAULTS = {
  colorGrade: { type: 'colorGrade', brightness: 0,   contrast: 1,   saturation: 1 },
  grain:      { type: 'grain',      strength: 15 },
  vignette:   { type: 'vignette',   intensity: 0.3 },
  speed:      { type: 'speed',      multiplier: 1 },
  blur:       { type: 'blur',       radius: 5 },
  custom:     { type: 'custom',     filter: '' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);

function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function parseDurationHint(hint) {
  const m = String(hint ?? '').match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : [2, 4];
}

function detectAspectRatio(w, h) {
  if (w === 1080 && h === 1080) return '1:1';
  if (w >= h) return '16:9';
  return '9:16';
}

function effectToFilter(effect) {
  switch (effect.type) {
    case 'colorGrade': {
      const b = Number(effect.brightness ?? 0).toFixed(2);
      const c = Number(effect.contrast    ?? 1).toFixed(2);
      const s = Number(effect.saturation  ?? 1).toFixed(2);
      return `eq=brightness=${b}:contrast=${c}:saturation=${s}`;
    }
    case 'grain':
      return `noise=alls=${effect.strength ?? 15}:allf=t`;
    case 'vignette':
      return `vignette=PI*${Number(effect.intensity ?? 0.3).toFixed(2)}`;
    case 'speed': {
      const pts = (1 / Number(effect.multiplier ?? 1)).toFixed(4);
      return `setpts=${pts}*PTS`;
    }
    case 'blur':
      return `gblur=sigma=${effect.radius ?? 5}`;
    case 'custom':
      return effect.filter || '';
    default:
      return '';
  }
}

// Convert a saved template JSON → editor form state
function templateToForm(t = {}) {
  return {
    name:        t.name        ?? '',
    description: t.description ?? '',
    tags:        t.tags        ?? [],
    previewThumbnail: t.previewThumbnail ?? null,
    previewVideo:     t.previewVideo     ?? null,
    format: {
      aspectRatio: detectAspectRatio(t.format?.width ?? 1080, t.format?.height ?? 1920),
      fps:         t.format?.fps ?? 30,
    },
    clipSlots: (t.clipSlots ?? []).map(s => {
      const [min, max] = parseDurationHint(s.durationHint);
      return {
        _uid:             uid(),
        id:               s.id ?? `clip_${uid()}`,
        label:            s.label            ?? '',
        type:             s.type             ?? 'video',
        minDuration:      min,
        maxDuration:      max,
        treatmentOptions: s.treatmentOptions ?? ['none'],
        defaultTreatment: s.defaultTreatment ?? 'none',
        effects:          (s.effects ?? []).map(e => ({ ...e, _uid: uid() })),
      };
    }),
    transitions:        t.transitions        ?? 'hard-cut',
    transitionDuration: t.transitionDuration ?? 0.5,
    captionMode:        t.captionMode        ?? 'none',
    captionSettings: {
      font:        t.captionSettings?.font        ?? 'Anton',
      fontSize:    t.captionSettings?.fontSize    ?? 72,
      strokeWidth: t.captionSettings?.strokeWidth ?? 3,
      strokeColor: t.captionSettings?.strokeColor ?? '#000000',
      position:    t.captionSettings?.position    ?? 85,
    },
    captionStyles: (
      t.captionStyles?.length
        ? t.captionStyles
        : [{ id: 'color_0', color: '#FFFFFF', strokeColor: '#000000' }]
    ).map(cs => ({ ...cs, _uid: uid() })),
    audioEnabled:  t.audioSlot !== undefined && t.audioSlot !== null,
    audioOptional: t.audioSlot?.optional ?? true,
    audioLabel:    t.audioSlot?.label    ?? 'Background music or voiceover',
    audioBeatSync: t.audioSlot?.beatSync ?? false,
  };
}

// Convert editor form state → template JSON (ready to POST/PUT)
function formToTemplate(form, existingId) {
  const { width, height } = ASPECT_PRESETS[form.format.aspectRatio] ?? ASPECT_PRESETS['9:16'];
  const id = existingId || slugify(form.name);

  const clipSlots = form.clipSlots.map((s, i) => ({
    id:               s.id || `clip_${i + 1}`,
    label:            s.label,
    type:             s.type,
    durationHint:     `${s.minDuration}-${s.maxDuration}s`,
    treatmentOptions: s.treatmentOptions,
    defaultTreatment: s.defaultTreatment,
    // strip internal _uid from each effect before saving
    effects:          s.effects.map(({ _uid, ...rest }) => rest),
  }));

  const result = {
    id,
    name:             form.name.trim(),
    description:      form.description.trim(),
    tags:             form.tags,
    previewThumbnail: form.previewThumbnail || null,
    previewVideo:     form.previewVideo     || null,
    format:           { width, height, fps: form.format.fps },
    clipSlots,
    transitions:      form.transitions,
    captionMode:      form.captionMode,
    captionSettings:  form.captionSettings,
    captionStyles:    form.captionStyles.map(({ _uid, ...rest }) => rest),
  };

  if (form.transitions !== 'hard-cut') {
    result.transitionDuration = form.transitionDuration;
  }

  if (form.audioEnabled) {
    result.audioSlot = {
      optional:  form.audioOptional,
      label:     form.audioLabel,
      beatSync:  form.audioBeatSync,
    };
  }

  return result;
}

// ── Primitive UI helpers ──────────────────────────────────────────────────────

function SectionCard({ title, children }) {
  return (
    <div className="bg-surface-800 border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-surface-900/60">
        <h2 className="text-ink font-semibold text-sm tracking-wide">{title}</h2>
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </div>
  );
}

function FieldLabel({ children, hint }) {
  return (
    <p className="text-ink-muted text-xs font-medium mb-1.5">
      {children}
      {hint && <span className="text-ink-dim font-normal ml-2">({hint})</span>}
    </p>
  );
}

function TextInput({ className = '', ...props }) {
  return (
    <input
      className={`w-full bg-surface-900 border border-border rounded-lg px-3 py-2 text-sm text-ink
        placeholder-ink-dim focus:outline-none focus:border-accent transition-colors ${className}`}
      {...props}
    />
  );
}

function SelectInput({ className = '', children, ...props }) {
  return (
    <select
      className={`w-full bg-surface-900 border border-border rounded-lg px-3 py-2 text-sm text-ink
        focus:outline-none focus:border-accent transition-colors appearance-none cursor-pointer ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

function Slider({ label, min, max, step = 1, value, onChange, unit = '', valueDisplay }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-ink-muted text-xs">{label}</span>
        <span className="text-accent text-xs font-mono tabular-nums">
          {valueDisplay ?? `${value}${unit}`}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-accent h-1.5 rounded cursor-pointer"
      />
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
      <button
        type="button" role="switch" aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent
          transition-colors duration-200 focus:outline-none
          ${checked ? 'bg-accent' : 'bg-surface-700'}`}
      >
        <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow
          transform transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
      {label && <span className="text-ink-muted text-sm">{label}</span>}
    </label>
  );
}

// ── Tag input ─────────────────────────────────────────────────────────────────

function TagInput({ tags, onChange }) {
  const [input, setInput] = useState('');
  const commit = () => {
    const t = input.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput('');
  };
  return (
    <div className="flex flex-wrap gap-1.5 p-2 bg-surface-900 border border-border rounded-lg min-h-[2.5rem]">
      {tags.map(tag => (
        <span key={tag} className="flex items-center gap-1 bg-surface-700 text-ink-dim text-xs px-2 py-0.5 rounded-md">
          {tag}
          <button type="button" onClick={() => onChange(tags.filter(t => t !== tag))}
            className="hover:text-red-400 ml-0.5 leading-none">×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
        onBlur={commit}
        placeholder={tags.length === 0 ? 'Type a tag and press Enter…' : ''}
        className="flex-1 min-w-[140px] bg-transparent text-xs text-ink placeholder-ink-dim focus:outline-none"
      />
    </div>
  );
}

// ── Thumbnail drop zone ───────────────────────────────────────────────────────

function ThumbnailZone({ preview, onFile }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handle = (file) => {
    if (!file || !/\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)) return;
    onFile(file);
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
      className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-xl
        cursor-pointer transition-all overflow-hidden select-none
        ${dragging ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50'}
        ${preview ? 'h-44' : 'h-28'}`}
    >
      {preview ? (
        <>
          <img src={preview} alt="thumbnail" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity
            flex items-center justify-center">
            <span className="text-white text-xs font-medium">Change thumbnail</span>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 text-ink-dim pointer-events-none">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5
                 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0
                 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0
                 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
          </svg>
          <span className="text-xs">Drop a preview image or click to browse</span>
          <span className="text-xs text-ink-dim">JPG, PNG, WebP</span>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={e => handle(e.target.files[0])} />
    </div>
  );
}

// ── Effect row ────────────────────────────────────────────────────────────────

function EffectRow({ effect, onChange, onDelete }) {
  const filter = effectToFilter(effect);
  const update  = (key, val) => onChange({ ...effect, [key]: val });

  return (
    <div className="bg-surface-950 border border-border rounded-lg p-3 space-y-3">
      {/* Type selector + delete */}
      <div className="flex items-center gap-2">
        <SelectInput
          value={effect.type}
          onChange={e => onChange({ ...EFFECT_DEFAULTS[e.target.value], _uid: effect._uid })}
          className="flex-1 py-1.5 text-xs"
        >
          {EFFECT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </SelectInput>
        <button type="button" onClick={onDelete}
          className="p-1.5 text-ink-dim hover:text-red-400 transition-colors rounded">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Per-type params */}
      {effect.type === 'colorGrade' && (
        <div className="space-y-2.5">
          <Slider label="Brightness" min={-1} max={1} step={0.01} value={effect.brightness ?? 0}
            onChange={v => update('brightness', v)} />
          <Slider label="Contrast" min={0} max={2} step={0.01} value={effect.contrast ?? 1}
            onChange={v => update('contrast', v)} />
          <Slider label="Saturation" min={0} max={2} step={0.01} value={effect.saturation ?? 1}
            onChange={v => update('saturation', v)} />
        </div>
      )}

      {effect.type === 'grain' && (
        <Slider label="Strength" min={0} max={100} value={effect.strength ?? 15}
          onChange={v => update('strength', v)} />
      )}

      {effect.type === 'vignette' && (
        <Slider label="Intensity" min={0} max={1} step={0.01} value={effect.intensity ?? 0.3}
          onChange={v => update('intensity', v)} />
      )}

      {effect.type === 'speed' && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-ink-muted text-xs">Speed multiplier</span>
            <span className="text-accent text-xs font-mono">{effect.multiplier ?? 1}×</span>
          </div>
          <input type="number" min={0.25} max={4} step={0.25}
            value={effect.multiplier ?? 1}
            onChange={e => update('multiplier', parseFloat(e.target.value) || 1)}
            className="w-full bg-surface-900 border border-border rounded px-2 py-1.5 text-xs text-ink
              focus:outline-none focus:border-accent" />
        </div>
      )}

      {effect.type === 'blur' && (
        <Slider label="Radius" min={0} max={20} step={0.5} value={effect.radius ?? 5}
          onChange={v => update('radius', v)} />
      )}

      {effect.type === 'custom' && (
        <div className="space-y-1.5">
          <textarea
            rows={2}
            value={effect.filter ?? ''}
            onChange={e => update('filter', e.target.value)}
            placeholder="e.g. colorbalance=rs=0.1:gs=0.05:bs=-0.1"
            className="w-full bg-surface-900 border border-border rounded px-2 py-1.5 text-xs text-ink
              font-mono placeholder-ink-dim focus:outline-none focus:border-accent resize-none"
          />
          <p className="text-amber-400/80 text-xs">
            ⚠ Advanced — invalid filters will cause render errors
          </p>
        </div>
      )}

      {/* Live FFmpeg filter preview */}
      {filter && (
        <div className="rounded bg-black/50 px-2.5 py-1.5 font-mono text-xs text-accent/90 break-all leading-relaxed">
          {filter}
        </div>
      )}
    </div>
  );
}

// ── Clip slot card ────────────────────────────────────────────────────────────

function SlotCard({ slot, index, total, onChange, onDuplicate, onDelete, onMoveUp, onMoveDown, dragHandlers }) {
  const [showEffects, setShowEffects] = useState(false);
  const update = (key, val) => onChange({ ...slot, [key]: val });

  const addEffect = () => {
    const e = { ...EFFECT_DEFAULTS.colorGrade, _uid: uid() };
    onChange({ ...slot, effects: [...slot.effects, e] });
  };

  const toggleTreatment = (t) => {
    const cur  = slot.treatmentOptions;
    const next = cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t];
    if (next.length === 0) return; // must keep at least one
    const patch = { ...slot, treatmentOptions: next };
    if (!next.includes(slot.defaultTreatment)) patch.defaultTreatment = next[0];
    onChange(patch);
  };

  return (
    <div
      draggable
      {...dragHandlers}
      className="bg-surface-900 border border-border rounded-xl overflow-hidden cursor-default"
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-950/60 border-b border-border">
        <span className="cursor-grab hover:text-ink text-ink-dim active:cursor-grabbing shrink-0"
          title="Drag to reorder">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
          </svg>
        </span>
        <span className="text-xs font-mono text-ink-dim w-5 shrink-0">#{index + 1}</span>
        <span className="flex-1 text-sm font-medium text-ink truncate min-w-0">
          {slot.label || <span className="text-ink-dim italic">Unnamed slot</span>}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={onMoveUp} disabled={index === 0}
            className="p-1 text-ink-dim hover:text-ink disabled:opacity-25 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
            </svg>
          </button>
          <button type="button" onClick={onMoveDown} disabled={index === total - 1}
            className="p-1 text-ink-dim hover:text-ink disabled:opacity-25 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          <button type="button" onClick={onDuplicate} title="Duplicate"
            className="p-1 text-ink-dim hover:text-accent transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125
                   1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161
                   -7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0
                   1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375
                   3.375 0 0 0-3.375-3.375H9.75" />
            </svg>
          </button>
          <button type="button" onClick={onDelete} title="Delete"
            className="p-1 text-ink-dim hover:text-red-400 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16
                   19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108
                   0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18
                   -.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667
                   0 0 0-7.5 0" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Label</FieldLabel>
            <TextInput value={slot.label}
              onChange={e => update('label', e.target.value)}
              placeholder="e.g. Intro clip" />
          </div>
          <div>
            <FieldLabel>Clip type</FieldLabel>
            <SelectInput value={slot.type}
              onChange={e => update('type', e.target.value)}>
              {SLOT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </SelectInput>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel hint="seconds">Min duration</FieldLabel>
            <TextInput type="number" min={0.5} max={30} step={0.5}
              value={slot.minDuration}
              onChange={e => update('minDuration', parseFloat(e.target.value) || 1)} />
          </div>
          <div>
            <FieldLabel hint="seconds">Max duration</FieldLabel>
            <TextInput type="number" min={0.5} max={30} step={0.5}
              value={slot.maxDuration}
              onChange={e => update('maxDuration', parseFloat(e.target.value) || 4)} />
          </div>
        </div>

        <div>
          <FieldLabel>Available treatments</FieldLabel>
          <div className="flex flex-wrap items-center gap-4 mt-1">
            {TREATMENTS.map(t => (
              <label key={t} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox"
                  checked={slot.treatmentOptions.includes(t)}
                  onChange={() => toggleTreatment(t)}
                  className="accent-accent w-3.5 h-3.5 cursor-pointer" />
                <span className="text-ink-muted text-xs capitalize">{t}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>Default treatment</FieldLabel>
          <SelectInput value={slot.defaultTreatment}
            onChange={e => update('defaultTreatment', e.target.value)}>
            {slot.treatmentOptions.map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </SelectInput>
        </div>

        {/* Effects accordion */}
        <div className="border-t border-border/50 pt-3">
          <button type="button" onClick={() => setShowEffects(v => !v)}
            className="flex items-center gap-2 text-xs text-ink-muted hover:text-ink transition-colors w-full text-left">
            <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${showEffects ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
            <span>Effects stack</span>
            <span className="text-accent font-mono ml-1">({slot.effects.length})</span>
          </button>

          {showEffects && (
            <div className="mt-3 space-y-2">
              {slot.effects.length === 0 && (
                <p className="text-ink-dim text-xs italic py-2 text-center">No effects. Add one below.</p>
              )}
              {slot.effects.map((eff, i) => (
                <EffectRow
                  key={eff._uid}
                  effect={eff}
                  onChange={u => {
                    const next = slot.effects.map((e, j) => j === i ? u : e);
                    onChange({ ...slot, effects: next });
                  }}
                  onDelete={() => {
                    onChange({ ...slot, effects: slot.effects.filter((_, j) => j !== i) });
                  }}
                />
              ))}
              <button type="button" onClick={addEffect}
                className="w-full py-2 border border-dashed border-border rounded-lg
                  text-xs text-ink-dim hover:text-accent hover:border-accent transition-colors">
                + Add effect
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Caption color row ─────────────────────────────────────────────────────────

function ColorStyleRow({ style, index, onChange, onDelete, canDelete }) {
  return (
    <div className="flex items-center gap-3 p-2.5 bg-surface-950 border border-border rounded-lg">
      <span className="text-ink-dim text-xs font-mono w-5 shrink-0 text-right">{index + 1}</span>
      <div className="flex items-center gap-3 flex-1 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-ink-dim text-xs">Fill</span>
          <input type="color" value={style.color}
            onChange={e => onChange({ ...style, color: e.target.value })}
            className="w-8 h-7 rounded cursor-pointer border border-border bg-transparent p-0.5" />
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-ink-dim text-xs">Stroke</span>
          <input type="color" value={style.strokeColor ?? '#000000'}
            onChange={e => onChange({ ...style, strokeColor: e.target.value })}
            className="w-8 h-7 rounded cursor-pointer border border-border bg-transparent p-0.5" />
        </label>
        <TextInput value={style.id}
          onChange={e => onChange({ ...style, id: e.target.value })}
          placeholder="id (e.g. green)" className="flex-1 min-w-[100px] py-1 text-xs" />
      </div>
      <button type="button" onClick={onDelete} disabled={!canDelete}
        className="text-ink-dim hover:text-red-400 disabled:opacity-25 transition-colors p-1 shrink-0">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── Main TemplateEditor ───────────────────────────────────────────────────────

export default function TemplateEditor({ templateData, onBack, onSaved }) {
  const isEditing = Boolean(templateData?.id);

  const [form, setForm]           = useState(() => templateToForm(templateData ?? {}));
  const [thumbnail, setThumbnail] = useState(null);     // File (new upload)
  const [thumbPreview, setThumbPreview] = useState(templateData?.previewThumbnail ?? null);
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Drag-to-reorder clip slots
  const dragIdx    = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  const setField = useCallback((key, val) =>
    setForm(f => ({ ...f, [key]: val })), []);

  // ── Slot management ──────────────────────────────────────────────────────

  const addSlot = () => {
    const n = form.clipSlots.length + 1;
    setField('clipSlots', [...form.clipSlots, {
      _uid: uid(), id: `clip_${n}`, label: `Clip ${n}`,
      type: 'video', minDuration: 2, maxDuration: 4,
      treatmentOptions: ['none'], defaultTreatment: 'none',
      effects: [],
    }]);
  };

  const updateSlot = (idx, updated) =>
    setField('clipSlots', form.clipSlots.map((s, i) => i === idx ? updated : s));

  const duplicateSlot = (idx) => {
    const s    = form.clipSlots[idx];
    const copy = { ...s, _uid: uid(), id: `clip_${uid()}`,
                   effects: s.effects.map(e => ({ ...e, _uid: uid() })) };
    const next = [...form.clipSlots];
    next.splice(idx + 1, 0, copy);
    setField('clipSlots', next);
  };

  const deleteSlot  = (idx) =>
    setField('clipSlots', form.clipSlots.filter((_, i) => i !== idx));

  const moveSlot = (idx, dir) => {
    const next = [...form.clipSlots];
    const t    = idx + dir;
    if (t < 0 || t >= next.length) return;
    [next[idx], next[t]] = [next[t], next[idx]];
    setField('clipSlots', next);
  };

  const dragHandlersFor = (idx) => ({
    onDragStart: (e) => { dragIdx.current = idx; e.dataTransfer.effectAllowed = 'move'; },
    onDragOver:  (e) => { e.preventDefault(); setDragOver(idx); },
    onDragLeave: ()  => setDragOver(null),
    onDrop:      (e) => {
      e.preventDefault();
      const from = dragIdx.current;
      if (from === null || from === idx) { setDragOver(null); return; }
      const next = [...form.clipSlots];
      const [moved] = next.splice(from, 1);
      next.splice(idx, 0, moved);
      setField('clipSlots', next);
      dragIdx.current = null;
      setDragOver(null);
    },
    onDragEnd: () => { dragIdx.current = null; setDragOver(null); },
  });

  // ── Caption style management ─────────────────────────────────────────────

  const addCaptionStyle = () =>
    setField('captionStyles', [
      ...form.captionStyles,
      { _uid: uid(), id: `color_${form.captionStyles.length}`, color: '#FFFFFF', strokeColor: '#000000' },
    ]);

  // ── Thumbnail ────────────────────────────────────────────────────────────

  const handleThumbnail = (file) => {
    setThumbnail(file);
    setThumbPreview(URL.createObjectURL(file));
  };

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.name.trim())         { setSaveError('Template name is required.'); return; }
    if (form.clipSlots.length < 1) { setSaveError('Add at least one clip slot.'); return; }
    setSaving(true);
    setSaveError('');
    try {
      const json = formToTemplate(form, isEditing ? templateData.id : null);
      const fd   = new FormData();
      fd.append('template', JSON.stringify(json));
      if (thumbnail) fd.append('thumbnail', thumbnail);

      const url    = isEditing ? `/api/templates/${templateData.id}` : '/api/templates';
      const method = isEditing ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, body: fd });
      const body   = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Save failed');
      onSaved(body.template);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      const res  = await fetch(`/api/templates/${templateData.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Delete failed');
      onSaved(null); // null = deleted, go back to gallery
    } catch (err) {
      setSaveError(err.message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto pb-20 space-y-6">

      {/* Page title */}
      <div className="flex items-center gap-3 pt-4">
        <button type="button" onClick={onBack}
          className="p-1.5 -ml-1.5 text-ink-dim hover:text-ink transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-ink">
            {isEditing ? 'Edit Template' : 'New Template'}
          </h1>
          {isEditing && (
            <p className="text-xs text-ink-dim font-mono mt-0.5">id: {templateData.id}</p>
          )}
        </div>
      </div>

      {/* ── 1. Template Info ── */}
      <SectionCard title="Template Info">
        <div>
          <FieldLabel>Template name *</FieldLabel>
          <TextInput
            value={form.name}
            onChange={e => setField('name', e.target.value)}
            placeholder="e.g. Hall of Game"
          />
          {!isEditing && form.name.trim() && (
            <p className="text-ink-dim text-xs mt-1 font-mono">
              id: {slugify(form.name)}
            </p>
          )}
        </div>

        <div>
          <FieldLabel>Description</FieldLabel>
          <textarea
            rows={2}
            value={form.description}
            onChange={e => setField('description', e.target.value)}
            placeholder="Short description shown on the gallery card"
            className="w-full bg-surface-900 border border-border rounded-lg px-3 py-2 text-sm text-ink
              placeholder-ink-dim focus:outline-none focus:border-accent resize-none"
          />
        </div>

        <div>
          <FieldLabel>Tags</FieldLabel>
          <TagInput tags={form.tags} onChange={v => setField('tags', v)} />
        </div>

        <div>
          <FieldLabel>Preview thumbnail</FieldLabel>
          <ThumbnailZone preview={thumbPreview} onFile={handleThumbnail} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>Aspect ratio</FieldLabel>
            <SelectInput
              value={form.format.aspectRatio}
              onChange={e => setField('format', { ...form.format, aspectRatio: e.target.value })}
            >
              {Object.entries(ASPECT_PRESETS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </SelectInput>
            <p className="text-xs text-ink-dim font-mono mt-1">
              {(() => {
                const { width, height } = ASPECT_PRESETS[form.format.aspectRatio] ?? ASPECT_PRESETS['9:16'];
                return `${width}×${height}px`;
              })()}
            </p>
          </div>
          <div>
            <FieldLabel>Frame rate</FieldLabel>
            <SelectInput
              value={form.format.fps}
              onChange={e => setField('format', { ...form.format, fps: parseInt(e.target.value) })}
            >
              {FPS_OPTIONS.map(f => <option key={f} value={f}>{f} fps</option>)}
            </SelectInput>
          </div>
        </div>
      </SectionCard>

      {/* ── 2. Clip Slots ── */}
      <SectionCard title={`Clip Slots  (${form.clipSlots.length})`}>
        {form.clipSlots.length === 0 && (
          <p className="text-ink-dim text-sm text-center py-4 italic">
            No clip slots yet — add one below.
          </p>
        )}

        <div className="space-y-3">
          {form.clipSlots.map((slot, idx) => (
            <div
              key={slot._uid}
              className={`rounded-xl transition-all duration-150
                ${dragOver === idx ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface-800' : ''}`}
            >
              <SlotCard
                slot={slot}
                index={idx}
                total={form.clipSlots.length}
                onChange={u => updateSlot(idx, u)}
                onDuplicate={() => duplicateSlot(idx)}
                onDelete={() => deleteSlot(idx)}
                onMoveUp={() => moveSlot(idx, -1)}
                onMoveDown={() => moveSlot(idx, 1)}
                dragHandlers={dragHandlersFor(idx)}
              />
            </div>
          ))}
        </div>

        <button type="button" onClick={addSlot}
          className="w-full py-3 border border-dashed border-border rounded-xl
            text-sm text-ink-dim hover:text-accent hover:border-accent transition-colors">
          + Add clip slot
        </button>
      </SectionCard>

      {/* ── 3. Transitions ── */}
      <SectionCard title="Transitions">
        <div>
          <FieldLabel>Style between clips</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {TRANSITIONS.map(t => (
              <button key={t.value} type="button"
                onClick={() => setField('transitions', t.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                  ${form.transitions === t.value
                    ? 'bg-accent text-white shadow'
                    : 'bg-surface-900 text-ink-muted border border-border hover:border-accent/50'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {form.transitions !== 'hard-cut' && (
          <Slider
            label="Transition duration"
            min={0.1} max={2} step={0.1}
            value={form.transitionDuration}
            onChange={v => setField('transitionDuration', v)}
            unit="s"
          />
        )}
      </SectionCard>

      {/* ── 4. Caption Settings ── */}
      <SectionCard title="Caption Settings">
        <div>
          <FieldLabel>Default caption mode</FieldLabel>
          <div className="flex gap-2 flex-wrap">
            {CAPTION_MODES.map(m => (
              <button key={m.value} type="button"
                onClick={() => setField('captionMode', m.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                  ${form.captionMode === m.value
                    ? 'bg-accent text-white shadow'
                    : 'bg-surface-900 text-ink-muted border border-border hover:border-accent/50'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>Font</FieldLabel>
            <SelectInput
              value={form.captionSettings.font}
              onChange={e => setField('captionSettings', { ...form.captionSettings, font: e.target.value })}
            >
              {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </SelectInput>
          </div>
          <div>
            <Slider label="Font size" min={40} max={120} unit="px"
              value={form.captionSettings.fontSize}
              onChange={v => setField('captionSettings', { ...form.captionSettings, fontSize: v })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Slider label="Stroke width" min={0} max={10} unit="px"
              value={form.captionSettings.strokeWidth}
              onChange={v => setField('captionSettings', { ...form.captionSettings, strokeWidth: v })} />
          </div>
          <div>
            <FieldLabel>Stroke color</FieldLabel>
            <div className="flex items-center gap-2.5 mt-1">
              <input type="color"
                value={form.captionSettings.strokeColor}
                onChange={e => setField('captionSettings', { ...form.captionSettings, strokeColor: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent p-0.5" />
              <span className="text-ink-dim text-xs font-mono">{form.captionSettings.strokeColor}</span>
            </div>
          </div>
        </div>

        <Slider
          label="Vertical position"
          min={10} max={90}
          value={form.captionSettings.position}
          onChange={v => setField('captionSettings', { ...form.captionSettings, position: v })}
          valueDisplay={`${form.captionSettings.position}% from top`}
        />

        <div>
          <div className="flex items-center justify-between mb-2">
            <FieldLabel>Caption color slots</FieldLabel>
            <button type="button" onClick={addCaptionStyle}
              className="text-xs text-accent hover:text-accent/80 transition-colors">
              + Add color
            </button>
          </div>
          <div className="space-y-2">
            {form.captionStyles.map((cs, idx) => (
              <ColorStyleRow
                key={cs._uid}
                style={cs}
                index={idx}
                canDelete={form.captionStyles.length > 1}
                onChange={u => setField('captionStyles', form.captionStyles.map((s, i) => i === idx ? u : s))}
                onDelete={() => {
                  if (form.captionStyles.length <= 1) return;
                  setField('captionStyles', form.captionStyles.filter((_, i) => i !== idx));
                }}
              />
            ))}
          </div>
          <p className="text-ink-dim text-xs mt-2">
            Colors cycle across words / lines: first color → second → first…
          </p>
        </div>
      </SectionCard>

      {/* ── 5. Audio Settings ── */}
      <SectionCard title="Audio Settings">
        <Toggle
          checked={form.audioEnabled}
          onChange={v => setField('audioEnabled', v)}
          label="Audio upload slot enabled"
        />

        {form.audioEnabled && (
          <div className="space-y-4 pt-1">
            <div>
              <FieldLabel>Upload zone label</FieldLabel>
              <TextInput
                value={form.audioLabel}
                onChange={e => setField('audioLabel', e.target.value)}
                placeholder="e.g. Background music or voiceover"
              />
            </div>
            <Toggle
              checked={!form.audioOptional}
              onChange={v => setField('audioOptional', !v)}
              label="Require audio (mark as mandatory)"
            />
            <Toggle
              checked={form.audioBeatSync}
              onChange={v => setField('audioBeatSync', v)}
              label="Beat-sync cuts enabled by default"
            />
          </div>
        )}
      </SectionCard>

      {/* ── Error banner ── */}
      {saveError && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl
          bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874
                 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <span>{saveError}</span>
        </div>
      )}

      {/* ── Save / Delete actions ── */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={handleSave} disabled={saving}
          className="btn-primary flex-1">
          {saving ? (
            <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
              {isEditing ? 'Updating…' : 'Saving…'}</>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057
                     1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
              </svg>
              {isEditing ? 'Update Template' : 'Save Template'}
            </>
          )}
        </button>

        {isEditing && !confirmDelete && (
          <button type="button" onClick={handleDelete} disabled={deleting}
            className="px-4 py-2 rounded-lg text-sm font-medium border
              bg-transparent text-red-400 border-red-500/40 hover:bg-red-500/10 transition-all">
            Delete Template
          </button>
        )}

        {isEditing && confirmDelete && (
          <>
            <button type="button" onClick={handleDelete} disabled={deleting}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white
                hover:bg-red-600 transition-all border border-red-500">
              {deleting ? 'Deleting…' : '⚠ Confirm delete'}
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting}
              className="px-3 py-2 rounded-lg text-sm text-ink-muted hover:text-ink transition-colors">
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
