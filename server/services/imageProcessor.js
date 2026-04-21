/**
 * imageProcessor.js
 * Sharp-backed still-image edit functions, mirroring the videoProcessor API.
 * Each named export takes (inputPath, outputPath, options?) → Promise<void>
 */
import sharp from 'sharp';
import path from 'path';

// ── SVG overlay helpers ─────────────────────────────────────────────────────

function vignetteSVG(w, h) {
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="vg" cx="50%" cy="50%" r="70%">
        <stop offset="30%" stop-color="black" stop-opacity="0"/>
        <stop offset="100%" stop-color="black" stop-opacity="0.78"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#vg)"/>
  </svg>`;
}

function textSVG(w, h, text, position = 'bottom', fontSize = null, color = 'white') {
  const safe = String(text).replace(/[<>&"]/g,
    c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;' }[c]));
  const fs = fontSize ?? Math.max(18, Math.floor(h / 28));
  const approxW = Math.min(safe.length * fs * 0.58, w * 0.88);
  const boxW = approxW + 28;
  const boxX = (w - boxW) / 2;
  const yMap = {
    top:    { boxY: fs * 0.6,      textY: fs * 1.5 },
    center: { boxY: (h - fs * 1.6) / 2, textY: (h + fs * 0.5) / 2 },
    bottom: { boxY: h - fs * 2.4,  textY: h - fs * 1.0 },
  };
  const { boxY, textY } = yMap[position] ?? yMap.bottom;
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${Math.max(0, boxX)}" y="${boxY}" width="${boxW}" height="${fs * 1.65}"
      fill="black" fill-opacity="0.55" rx="5"/>
    <text x="${w / 2}" y="${textY}"
      font-family="Arial, Helvetica, sans-serif" font-size="${fs}"
      fill="${color}" fill-opacity="0.92" text-anchor="middle">${safe}</text>
  </svg>`;
}

function grainSVG(w, h, intensity) {
  const freq = (0.6 + intensity * 0.3).toFixed(3);
  const opacity = (intensity * 0.32).toFixed(3);
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${freq}"
      numOctaves="4" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/>
    </filter>
    <rect width="${w}" height="${h}" filter="url(#n)" opacity="${opacity}"/>
  </svg>`;
}

// ── Crop helper ─────────────────────────────────────────────────────────────

function cropRegion(w, h, ratio) {
  switch (ratio) {
    case '2.35:1':
    case '21:9': {
      const nh = Math.floor((w / 2.35) / 2) * 2;
      const top = Math.floor((h - nh) / 2);
      return top >= 0 ? { left: 0, top, width: w, height: nh } : null;
    }
    case '1:1': {
      const s = Math.min(w, h);
      return { left: Math.floor((w - s) / 2), top: Math.floor((h - s) / 2), width: s, height: s };
    }
    case '9:16': {
      const nw = Math.floor((h * 9 / 16) / 2) * 2;
      const left = Math.floor((w - nw) / 2);
      return left >= 0 ? { left, top: 0, width: nw, height: h } : null;
    }
    default: return null;
  }
}

// ── Internal base pipeline ──────────────────────────────────────────────────

async function save(pipeline, outputPath) {
  await pipeline.jpeg({ quality: 88, mozjpeg: true }).toFile(outputPath);
}

async function getDims(img) {
  const meta = await img.metadata();
  return { width: meta.width, height: meta.height };
}

// ── 1. Color Grade ──────────────────────────────────────────────────────────
/**
 * @param {{ brightness?: number, contrast?: number, saturation?: number }} opts
 */
export async function colorGrade(inputPath, outputPath, {
  brightness = 0,
  contrast = 1,
  saturation = 1,
} = {}) {
  let img = sharp(inputPath).rotate();
  const mod = {};
  if (brightness !== 0) mod.brightness = 1 + brightness;
  if (saturation !== 1) mod.saturation = saturation;
  if (Object.keys(mod).length) img = img.modulate(mod);
  if (contrast !== 1) img = img.linear(contrast, Math.round(128 * (1 - contrast)));
  await save(img, outputPath);
}

// ── 2. Black & White ────────────────────────────────────────────────────────
export async function blackAndWhite(inputPath, outputPath) {
  await save(sharp(inputPath).rotate().grayscale(), outputPath);
}

// ── 3. Warm Tone ────────────────────────────────────────────────────────────
export async function warmTone(inputPath, outputPath) {
  let img = sharp(inputPath).rotate()
    .recomb([[1.18, 0, 0], [0, 1.05, 0], [0, 0, 0.88]])
    .modulate({ saturation: 1.12 });
  await save(img, outputPath);
}

// ── 4. Cool Tone ────────────────────────────────────────────────────────────
export async function coolTone(inputPath, outputPath) {
  let img = sharp(inputPath).rotate()
    .recomb([[0.88, 0, 0], [0, 1.02, 0], [0, 0, 1.18]])
    .modulate({ saturation: 1.08 });
  await save(img, outputPath);
}

// ── 5. Vignette ─────────────────────────────────────────────────────────────
export async function applyVignette(inputPath, outputPath) {
  let img = sharp(inputPath).rotate();
  const { width, height } = await getDims(img);
  img = img.composite([{ input: Buffer.from(vignetteSVG(width, height)), blend: 'over' }]);
  await save(img, outputPath);
}

// ── 6. Cinematic Crop ───────────────────────────────────────────────────────
export async function cinematicCrop(inputPath, outputPath) {
  let img = sharp(inputPath).rotate();
  const { width, height } = await getDims(img);
  const region = cropRegion(width, height, '2.35:1');
  if (region) img = img.extract(region);
  await save(img, outputPath);
}

// ── 7. Film Grain ───────────────────────────────────────────────────────────
/**
 * @param {{ strength?: number }} opts  strength: 0–100 (default 20)
 */
export async function filmGrain(inputPath, outputPath, { strength = 20 } = {}) {
  const intensity = Math.min(1, strength / 100);
  let img = sharp(inputPath).rotate();
  const { width, height } = await getDims(img);
  try {
    img = img.composite([{ input: Buffer.from(grainSVG(width, height, intensity)), blend: 'screen' }]);
  } catch { /* SVG compositing not available, skip grain */ }
  await save(img, outputPath);
}

// ── 8. Speed Ramp (no-op for images) ───────────────────────────────────────
/**
 * Speed ramping has no meaning for stills — falls back to a warm color grade.
 */
export async function speedRamp(inputPath, outputPath) {
  return warmTone(inputPath, outputPath);
}

// ── 9. Text Overlay ─────────────────────────────────────────────────────────
/**
 * @param {{
 *   text?: string,
 *   fontsize?: number,
 *   color?: string,
 *   position?: 'top'|'center'|'bottom'
 * }} opts
 */
export async function textOverlay(inputPath, outputPath, {
  text = 'FRAME',
  fontsize = null,
  color = 'white',
  position = 'bottom',
} = {}) {
  let img = sharp(inputPath).rotate();
  const { width, height } = await getDims(img);
  try {
    img = img.composite([{ input: Buffer.from(textSVG(width, height, text, position, fontsize, color)), blend: 'over' }]);
  } catch { /* skip */ }
  await save(img, outputPath);
}

// ── Backward-compat: full ops-schema processor (used by /api/generate) ──────

export async function processImageEdit(inputPath, outputPath, ops) {
  const metadata = await sharp(inputPath).metadata();
  const { width, height } = metadata;

  let img = sharp(inputPath).rotate();
  let fw = width, fh = height;

  // Crop
  if (ops.crop_ratio) {
    const crop = cropRegion(width, height, ops.crop_ratio);
    if (crop) { img = img.extract(crop); fw = crop.width; fh = crop.height; }
  }

  // Modulate
  const mod = {};
  if (ops.brightness !== 0) mod.brightness = 1 + ops.brightness;
  if (ops.saturation !== 1) mod.saturation = ops.saturation;
  if (ops.hue        !== 0) mod.hue = ops.hue;
  if (Object.keys(mod).length) img = img.modulate(mod);

  if (ops.grayscale)  img = img.grayscale();
  if (ops.contrast !== 1) img = img.linear(ops.contrast, Math.round(128 * (1 - ops.contrast)));
  if (ops.gamma    !== 1) img = img.gamma(ops.gamma);

  // Warm / cool via recomb
  if (!ops.grayscale && ops.warm !== 0) {
    const w = ops.warm;
    if (w > 0) {
      img = img.recomb([[1 + w*0.15, 0, 0], [0, 1 + w*0.05, 0], [0, 0, Math.max(0.1, 1 - w*0.2)]]);
    } else {
      const c = -w;
      img = img.recomb([[Math.max(0.1, 1 - c*0.15), 0, 0], [0, 1 - c*0.02, 0], [0, 0, 1 + c*0.2]]);
    }
  }

  if (ops.blur > 0) img = img.blur(ops.blur + 0.3);

  if (ops.vignette) {
    try { img = img.composite([{ input: Buffer.from(vignetteSVG(fw, fh)), blend: 'over' }]); } catch {}
  }
  if (ops.grain > 0.05) {
    try { img = img.composite([{ input: Buffer.from(grainSVG(fw, fh, ops.grain)), blend: 'screen' }]); } catch {}
  }
  if (ops.text_overlay) {
    try { img = img.composite([{ input: Buffer.from(textSVG(fw, fh, ops.text_overlay)), blend: 'over' }]); } catch {}
  }

  await save(img, outputPath);
}
