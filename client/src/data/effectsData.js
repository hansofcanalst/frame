/**
 * effectsData.js
 * Frontend-only UI metadata that mirrors the IDs in server/effects/effectsLibrary.js.
 * No FFmpeg filter strings here — just the display data the pickers need.
 */

// ── Clip effects ──────────────────────────────────────────────────────────────

export const CLIP_EFFECTS_DATA = [
  // Color & Mood
  { id: 'cinematic',   label: 'Cinematic',   category: 'color',   description: 'High contrast, slightly desaturated film look' },
  { id: 'golden_hour', label: 'Golden Hour', category: 'color',   description: 'Warm, glowing sunset tones' },
  { id: 'moody',       label: 'Moody',       category: 'color',   description: 'Dark, dramatic with vignette' },
  { id: 'vibrant',     label: 'Vibrant',     category: 'color',   description: 'Punchy, oversaturated pop' },
  { id: 'bw',          label: 'B&W',         category: 'color',   description: 'Desaturated with boosted contrast' },
  { id: 'vintage',     label: 'Vintage',     category: 'color',   description: 'Faded warm tones with grain' },
  { id: 'cool_blue',   label: 'Cool Blue',   category: 'color',   description: 'Cold, slightly blue-shifted grade' },
  { id: 'matte',       label: 'Matte',       category: 'color',   description: 'Lifted blacks, soft low-contrast' },

  // Motion & Energy
  { id: 'slow_mo',     label: 'Slow Mo',     category: 'motion',  description: 'Half speed — doubles clip duration' },
  { id: 'fast_mo',     label: 'Fast Fwd',    category: 'motion',  description: 'Double speed — halves clip duration' },
  { id: 'zoom_in',     label: 'Zoom In',     category: 'motion',  description: '10% digital push-in crop' },

  // Overlays & Texture
  { id: 'grain',       label: 'Film Grain',  category: 'overlay', description: 'Adds analog film grain texture' },
  { id: 'vignette',    label: 'Vignette',    category: 'overlay', description: 'Darkened edges focus the frame' },
  { id: 'light_leak',  label: 'Light Leak',  category: 'overlay', description: 'Warm overexposed analog leak' },
  { id: 'glitch_rgb',  label: 'RGB Glitch',  category: 'overlay', description: 'Digital glitch with colour noise' },
  { id: 'scanlines',   label: 'Scanlines',   category: 'overlay', description: 'Horizontal CRT scanline overlay' },
  { id: 'blur_soft',   label: 'Soft Focus',  category: 'overlay', description: 'Gentle Gaussian blur for dreamy feel' },
];

// ── Transitions ───────────────────────────────────────────────────────────────

export const TRANSITIONS_DATA = [
  { id: 'hard_cut',    label: 'Cut',     icon: '✂',  safe: true,  description: 'Instant cut — no transition' },
  { id: 'smooth_fade', label: 'Fade',    icon: '◈',  safe: true,  description: 'Classic cross-dissolve' },
  { id: 'flash',       label: 'Flash',   icon: '⚡', safe: true,  description: 'Quick white flash — TikTok staple' },
  { id: 'zoom_in',     label: 'Zoom',    icon: '⊕',  safe: true,  description: 'Zooms into the next clip' },
  { id: 'swipe_left',  label: 'Swipe ←', icon: '←',  safe: true,  description: 'Slide to the left' },
  { id: 'swipe_right', label: 'Swipe →', icon: '→',  safe: true,  description: 'Slide to the right' },
  { id: 'swipe_up',    label: 'Swipe ↑', icon: '↑',  safe: true,  description: 'Slide upwards' },
  { id: 'glitch',      label: 'Glitch',  icon: '▓',  safe: false, description: 'Pixelated digital glitch' },
  { id: 'spin',        label: 'Spin',    icon: '↻',  safe: false, description: 'Radial wipe spin' },
  { id: 'burn',        label: 'Burn',    icon: '◉',  safe: false, description: 'Fire-burn wipe' },
  { id: 'blur_wipe',   label: 'Blur',    icon: '≈',  safe: false, description: 'Horizontal blur transition' },
  { id: 'squeeze',     label: 'Squeeze', icon: '⊟',  safe: false, description: 'Horizontal squeeze wipe' },
];

// ── Global effects ────────────────────────────────────────────────────────────

export const GLOBAL_EFFECTS_DATA = [
  { id: 'intro_fade', label: 'Fade In',    description: 'Fade from black over the first 0.5 s' },
  { id: 'outro_fade', label: 'Fade Out',   description: 'Fade to black over the last 0.8 s' },
  { id: 'color_pop',  label: 'Color Pop',  description: 'Global saturation + contrast boost' },
];

// ── Category metadata ─────────────────────────────────────────────────────────

export const EFFECT_CATEGORIES = [
  { id: 'all',     label: 'All' },
  { id: 'color',   label: 'Color' },
  { id: 'motion',  label: 'Motion' },
  { id: 'overlay', label: 'Texture' },
];

export const CATEGORY_DOT_COLORS = {
  color:   'bg-violet-400',
  motion:  'bg-blue-400',
  overlay: 'bg-amber-400',
};
