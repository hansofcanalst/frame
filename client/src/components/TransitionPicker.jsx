/**
 * TransitionPicker.jsx
 * Single-select horizontal card row for choosing a transition style.
 *
 * Props:
 *   selected  — string            currently selected transition ID (default 'hard_cut')
 *   onChange  — (id: string) => void
 */

import { TRANSITIONS_DATA } from '../data/effectsData.js';

// Small visual metaphor for each transition type
const TRANSITION_PREVIEW = {
  hard_cut:    HardCutPreview,
  smooth_fade: FadePreview,
  flash:       FlashPreview,
  zoom_in:     ZoomPreview,
  swipe_left:  SwipePreview,
  swipe_right: SwipePreview,
  swipe_up:    SwipeUpPreview,
  glitch:      GlitchPreview,
  spin:        SpinPreview,
  burn:        BurnPreview,
  blur_wipe:   BlurPreview,
  squeeze:     SqueezePreview,
};

// ── Tiny SVG previews ─────────────────────────────────────────────────────────

function HardCutPreview() {
  return (
    <svg viewBox="0 0 40 30" className="w-full h-full">
      <rect x="0" y="0" width="20" height="30" fill="#7c3aed" />
      <rect x="20" y="0" width="20" height="30" fill="#a78bfa" />
      <line x1="20" y1="0" x2="20" y2="30" stroke="white" strokeWidth="1.5" />
    </svg>
  );
}

function FadePreview() {
  return (
    <svg viewBox="0 0 40 30" className="w-full h-full">
      <defs>
        <linearGradient id="fade-grad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="50%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#c4b5fd" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="40" height="30" fill="url(#fade-grad)" />
    </svg>
  );
}

function FlashPreview() {
  return (
    <svg viewBox="0 0 40 30" className="w-full h-full">
      <rect x="0" y="0" width="40" height="30" fill="#7c3aed" />
      <rect x="15" y="0" width="10" height="30" fill="white" opacity="0.9" />
    </svg>
  );
}

function ZoomPreview() {
  return (
    <svg viewBox="0 0 40 30" className="w-full h-full">
      <rect x="0" y="0" width="40" height="30" fill="#6d28d9" />
      <rect x="8" y="5" width="24" height="20" rx="1" fill="#a78bfa" />
      <rect x="14" y="9" width="12" height="12" rx="1" fill="#c4b5fd" />
    </svg>
  );
}

function SwipePreview({ dir = 'left' }) {
  return (
    <svg viewBox="0 0 40 30" className="w-full h-full">
      <rect x="0" y="0" width="40" height="30" fill="#a78bfa" />
      <rect x="0" y="0" width="22" height="30" fill="#7c3aed" />
      <polygon points="22,0 28,15 22,30" fill="#a78bfa" />
    </svg>
  );
}

function SwipeUpPreview() {
  return (
    <svg viewBox="0 0 40 30" className="w-full h-full">
      <rect x="0" y="0" width="40" height="30" fill="#a78bfa" />
      <rect x="0" y="0" width="40" height="16" fill="#7c3aed" />
      <polygon points="0,16 20,22 40,16" fill="#a78bfa" />
    </svg>
  );
}

function GlitchPreview() {
  return (
    <svg viewBox="0 0 40 30" className="w-full h-full">
      <rect x="0" y="0" width="40" height="30" fill="#7c3aed" />
      <rect x="0" y="4" width="40" height="4" fill="#f472b6" opacity="0.6" transform="translate(4,0)" />
      <rect x="0" y="12" width="40" height="3" fill="#34d399" opacity="0.6" transform="translate(-3,0)" />
      <rect x="0" y="20" width="40" height="4" fill="#60a5fa" opacity="0.6" transform="translate(2,0)" />
    </svg>
  );
}

function SpinPreview() {
  return (
    <svg viewBox="0 0 40 30" className="w-full h-full">
      <rect x="0" y="0" width="40" height="30" fill="#a78bfa" />
      <path d="M20,15 L40,0 L40,30 Z" fill="#7c3aed" />
      <path d="M20,15 L0,30 L0,0 Z" fill="#6d28d9" />
    </svg>
  );
}

function BurnPreview() {
  return (
    <svg viewBox="0 0 40 30" className="w-full h-full">
      <defs>
        <linearGradient id="burn-grad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="45%" stopColor="#f97316" />
          <stop offset="55%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="40" height="30" fill="url(#burn-grad)" />
    </svg>
  );
}

function BlurPreview() {
  return (
    <svg viewBox="0 0 40 30" className="w-full h-full">
      <defs>
        <linearGradient id="blur-grad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="40%" stopColor="#7c3aed" stopOpacity="0.4" />
          <stop offset="60%" stopColor="#a78bfa" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="40" height="30" fill="url(#blur-grad)" />
    </svg>
  );
}

function SqueezePreview() {
  return (
    <svg viewBox="0 0 40 30" className="w-full h-full">
      <rect x="0" y="0" width="40" height="30" fill="#a78bfa" />
      <rect x="14" y="0" width="12" height="30" fill="#7c3aed" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TransitionPicker({ selected = 'hard_cut', onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1"
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(139,92,246,0.3) transparent' }}>
      {TRANSITIONS_DATA.map((t) => {
        const isSelected = selected === t.id;
        const PreviewComp = TRANSITION_PREVIEW[t.id] ?? (() => (
          <div className="w-full h-full bg-surface-600 rounded" />
        ));

        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            title={t.description}
            className={`flex flex-col items-center gap-1.5 min-w-[60px] px-2 py-2
              rounded-xl border transition-all shrink-0 select-none
              ${isSelected
                ? 'border-accent bg-accent/10 text-accent shadow-sm shadow-accent/20'
                : 'border-border bg-surface-800 text-ink-muted hover:border-accent/40 hover:text-ink'
              }`}
          >
            {/* Visual preview box */}
            <div className={`w-10 h-7 rounded-md overflow-hidden border transition-colors
              ${isSelected ? 'border-accent/60' : 'border-border/50'}`}>
              <PreviewComp />
            </div>

            <span className={`text-[10px] font-medium leading-tight text-center ${
              isSelected ? 'text-accent' : 'text-ink-dim'
            }`}>
              {t.label}
            </span>

            {/* "not safe" warning dot (experimental transitions) */}
            {!t.safe && (
              <span className="w-1 h-1 rounded-full bg-amber-400 -mt-0.5" title="Experimental — may fall back to Fade" />
            )}
          </button>
        );
      })}
    </div>
  );
}
