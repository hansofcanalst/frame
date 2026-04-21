/**
 * effectsLibrary.js
 * Central registry of all clip effects, transitions, and global effects.
 *
 * Design rules:
 *  - Only eq, hue, noise, vignette, gblur, boxblur, setpts, drawgrid, fade
 *    are guaranteed in @ffmpeg-installer/ffmpeg. colorbalance and curves are NOT used.
 *  - Transition xfade types marked safe:true are broadly available.
 *    safe:false ones may fall back to 'fade' if the build lacks them.
 *  - All filter strings must work as part of a `-vf` chain.
 */

// ── Clip effects ──────────────────────────────────────────────────────────────

export const CLIP_EFFECTS = {

  // ── Color & Mood ──────────────────────────────────────────────────────────

  cinematic: {
    id: 'cinematic', label: 'Cinematic', category: 'color',
    description: 'High contrast, slightly desaturated film look',
    filter: 'eq=contrast=1.2:saturation=0.85:brightness=-0.05',
  },
  golden_hour: {
    id: 'golden_hour', label: 'Golden Hour', category: 'color',
    description: 'Warm, glowing sunset tones',
    filter: 'eq=brightness=0.05:contrast=1.1:saturation=1.25,hue=h=8',
  },
  moody: {
    id: 'moody', label: 'Moody', category: 'color',
    description: 'Dark, dramatic, low saturation with vignette',
    filter: 'eq=brightness=-0.1:contrast=1.3:saturation=0.6,vignette=angle=PI/4',
  },
  vibrant: {
    id: 'vibrant', label: 'Vibrant', category: 'color',
    description: 'Punchy, oversaturated pop',
    filter: 'eq=saturation=1.8:contrast=1.1',
  },
  bw: {
    id: 'bw', label: 'Black & White', category: 'color',
    description: 'Desaturated with boosted contrast',
    filter: 'hue=s=0,eq=contrast=1.2',
  },
  vintage: {
    id: 'vintage', label: 'Vintage', category: 'color',
    description: 'Faded warm tones with grain',
    filter: 'eq=contrast=1.1:saturation=0.7:brightness=0.02,hue=h=15,noise=alls=12:allf=t',
  },
  cool_blue: {
    id: 'cool_blue', label: 'Cool Blue', category: 'color',
    description: 'Cold, slightly blue-shifted grade',
    filter: 'eq=saturation=1.1,hue=h=-15',
  },
  matte: {
    id: 'matte', label: 'Matte', category: 'color',
    description: 'Lifted blacks, soft low-contrast look',
    filter: 'eq=contrast=0.85:brightness=0.05:saturation=0.8',
  },

  // ── Motion & Energy ───────────────────────────────────────────────────────

  slow_mo: {
    id: 'slow_mo', label: 'Slow Mo', category: 'motion',
    description: 'Half speed — doubles clip duration',
    filter: 'setpts=2.0*PTS',
    note: 'Changes clip duration. Audio handled separately.',
  },
  fast_mo: {
    id: 'fast_mo', label: 'Fast Forward', category: 'motion',
    description: 'Double speed — halves clip duration',
    filter: 'setpts=0.5*PTS',
    note: 'Changes clip duration. Audio handled separately.',
  },
  zoom_in: {
    id: 'zoom_in', label: 'Zoom In', category: 'motion',
    description: '10% digital push-in crop',
    // scale up 10%, crop back to original — works on any input size
    filter: 'scale=trunc(iw*1.1/2)*2:trunc(ih*1.1/2)*2,crop=iw/1.1:ih/1.1:(iw-iw/1.1)/2:(ih-ih/1.1)/2',
  },

  // ── Overlays & Texture ────────────────────────────────────────────────────

  grain: {
    id: 'grain', label: 'Film Grain', category: 'overlay',
    description: 'Adds analog film grain texture',
    filter: 'noise=alls=15:allf=t',
  },
  vignette: {
    id: 'vignette', label: 'Vignette', category: 'overlay',
    description: 'Darkened edges focus the frame',
    filter: 'vignette=angle=PI/4',
  },
  light_leak: {
    id: 'light_leak', label: 'Light Leak', category: 'overlay',
    description: 'Warm overexposed analog leak',
    filter: 'eq=brightness=0.12:saturation=1.2,hue=h=20,noise=alls=5:allf=t',
  },
  glitch_rgb: {
    id: 'glitch_rgb', label: 'RGB Glitch', category: 'overlay',
    description: 'Digital glitch with colour noise',
    filter: 'hue=h=4:s=1.4,noise=alls=10:allf=t,eq=contrast=1.15',
  },
  scanlines: {
    id: 'scanlines', label: 'Scanlines', category: 'overlay',
    description: 'Horizontal CRT scanline overlay',
    filter: 'drawgrid=width=0:height=2:thickness=1:color=black@0.35',
  },
  blur_soft: {
    id: 'blur_soft', label: 'Soft Focus', category: 'overlay',
    description: 'Gentle Gaussian blur for dreamy feel',
    filter: 'gblur=sigma=2',
  },
};

// ── Transitions ───────────────────────────────────────────────────────────────

export const TRANSITIONS = {
  hard_cut: {
    id: 'hard_cut', label: 'Hard Cut',
    xfadeType: null, duration: 0,
    safe: true,
    description: 'Instant cut — no transition',
    cssAnim: 'anim-hard-cut',
  },
  smooth_fade: {
    id: 'smooth_fade', label: 'Smooth Fade',
    xfadeType: 'fade', duration: 0.4,
    safe: true,
    description: 'Classic cross-dissolve',
    cssAnim: 'anim-fade',
  },
  flash: {
    id: 'flash', label: 'Flash',
    xfadeType: 'fadewhite', duration: 0.2,
    safe: true,
    description: 'Quick white flash — TikTok staple',
    cssAnim: 'anim-flash',
  },
  zoom_in: {
    id: 'zoom_in', label: 'Zoom In',
    xfadeType: 'zoomin', duration: 0.3,
    safe: true,
    description: 'Zooms into the next clip',
    cssAnim: 'anim-zoom',
  },
  swipe_left: {
    id: 'swipe_left', label: 'Swipe Left',
    xfadeType: 'slideleft', duration: 0.3,
    safe: true,
    description: 'Slide to the left',
    cssAnim: 'anim-swipe-left',
  },
  swipe_right: {
    id: 'swipe_right', label: 'Swipe Right',
    xfadeType: 'slideright', duration: 0.3,
    safe: true,
    description: 'Slide to the right',
    cssAnim: 'anim-swipe-right',
  },
  swipe_up: {
    id: 'swipe_up', label: 'Swipe Up',
    xfadeType: 'slideup', duration: 0.3,
    safe: true,
    description: 'Slide upwards',
    cssAnim: 'anim-swipe-up',
  },
  glitch: {
    id: 'glitch', label: 'Glitch',
    xfadeType: 'pixelize', duration: 0.2,
    safe: false,
    description: 'Pixelated digital glitch',
    cssAnim: 'anim-glitch',
  },
  spin: {
    id: 'spin', label: 'Spin',
    xfadeType: 'radial', duration: 0.4,
    safe: false,
    description: 'Radial wipe spin',
    cssAnim: 'anim-spin',
  },
  burn: {
    id: 'burn', label: 'Burn',
    xfadeType: 'burning', duration: 0.4,
    safe: false,
    description: 'Fire-burn wipe',
    cssAnim: 'anim-burn',
  },
  blur_wipe: {
    id: 'blur_wipe', label: 'Blur Wipe',
    xfadeType: 'hblur', duration: 0.35,
    safe: false,
    description: 'Horizontal blur transition',
    cssAnim: 'anim-blur',
  },
  squeeze: {
    id: 'squeeze', label: 'Squeeze',
    xfadeType: 'squeezeh', duration: 0.3,
    safe: false,
    description: 'Horizontal squeeze wipe',
    cssAnim: 'anim-squeeze',
  },
};

// ── Global effects (applied to the full rendered output) ──────────────────────

export const GLOBAL_EFFECTS = {
  intro_fade: {
    id: 'intro_fade', label: 'Fade In',
    description: 'Fade from black over the first 0.5 s',
    // Produces: fade=t=in:st=0:d=0.5
    buildFilter: (_duration) => 'fade=t=in:st=0:d=0.5',
  },
  outro_fade: {
    id: 'outro_fade', label: 'Fade to Black',
    description: 'Fade to black over the last 0.8 s',
    // Produces: fade=t=out:st=D-0.8:d=0.8
    buildFilter: (duration) => `fade=t=out:st=${Math.max(0, duration - 0.8).toFixed(3)}:d=0.8`,
  },
  color_pop: {
    id: 'color_pop', label: 'Color Pop',
    description: 'Globally punchy saturation boost',
    buildFilter: (_duration) => 'eq=saturation=1.7:contrast=1.15',
  },
};

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getClipEffect(id)    { return CLIP_EFFECTS[id]    ?? null; }
export function getTransition(id)    { return TRANSITIONS[id]     ?? null; }
export function getGlobalEffect(id)  { return GLOBAL_EFFECTS[id]  ?? null; }

export function getAllClipEffects()  { return Object.values(CLIP_EFFECTS); }
export function getAllTransitions()  { return Object.values(TRANSITIONS);  }
export function getAllGlobalEffects(){ return Object.values(GLOBAL_EFFECTS); }
