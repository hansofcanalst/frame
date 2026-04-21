/**
 * photoTemplateRenderer.js
 *
 * Renders all 6 Photo Templates — both a static JPEG and a looping MP4.
 *
 * Image pipeline:  sharp + SVG compositing (no text, no extra deps)
 * Video pipeline:  FFmpeg (filter_complex per template)
 *
 * Exported:
 *   getAllPhotoTemplates()  → template[]
 *   getPhotoTemplate(id)   → template | undefined
 *   renderPhotoTemplate({ template, sizeId, photos, outputImagePath,
 *                         outputVideoPath, preview })
 */

import ffmpeg          from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import sharp           from 'sharp';
import fs              from 'node:fs';
import path            from 'node:path';
import os              from 'node:os';
import { fileURLToPath } from 'url';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PT_DIR    = path.resolve(__dirname, '..', 'photo-templates');

// ── Template registry ─────────────────────────────────────────────────────────

export function getAllPhotoTemplates() {
  return fs.readdirSync(PT_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(PT_DIR, f), 'utf8')));
}

export function getPhotoTemplate(id) {
  const fp = path.join(PT_DIR, `${id}.json`);
  if (!fs.existsSync(fp)) return undefined;
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ffpromise(cmd) {
  return new Promise((resolve, reject) => {
    cmd
      .on('error', (err, _o, stderr) => {
        console.error('[photo-template] FFmpeg error:', err.message);
        if (stderr) console.error('[photo-template] stderr:', stderr.slice(-1000));
        reject(err);
      })
      .on('end', resolve)
      .run();
  });
}

/** Build a Buffer from an SVG string (for sharp compositing). */
function svgBuf(svgString) {
  return Buffer.from(svgString);
}

/** Return { w, h } of a rotated rectangle's bounding box. */
function rotatedBounds(w, h, deg) {
  const r = Math.abs(deg) * Math.PI / 180;
  return {
    w: Math.ceil(w * Math.cos(r) + h * Math.sin(r)),
    h: Math.ceil(w * Math.sin(r) + h * Math.cos(r)),
  };
}

// ── Template 1: Polaroid Float ────────────────────────────────────────────────

async function renderPolaroidFloat(photos, W, H, tempDir, outImage, preview) {
  // ── Layer 1: blurred, darkened background ──────────────────────────────────
  const bgBuf = await sharp(photos[0])
    .resize(W, H, { fit: 'cover' })
    .blur(preview ? 12 : 22)
    .modulate({ brightness: 0.42, saturation: 0.7 })
    .flatten({ background: '#0d0d0d' })
    .png()
    .toBuffer();

  // ── Layer 2: Polaroid ──────────────────────────────────────────────────────
  // Photo area: ~66% of smaller dimension, centered
  const photoSide = Math.round(Math.min(W, H) * 0.62);
  const bSide     = Math.round(18 * (W / 1080));   // border top/left/right
  const bBot      = Math.round(64 * (W / 1080));   // wide Polaroid bottom

  const photoBuf = await sharp(photos[0])
    .resize(photoSide, photoSide, { fit: 'contain', background: 'white' })
    .flatten({ background: 'white' })
    .extend({ top: bSide, left: bSide, right: bSide, bottom: bBot,
              background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();

  const pW = photoSide + bSide * 2;
  const pH = photoSide + bSide + bBot;

  // Drop shadow (semi-transparent, blurred)
  const shadowBuf = await sharp({
    create: { width: pW, height: pH, channels: 4,
              background: { r: 0, g: 0, b: 0, alpha: 110 } },
  }).blur(preview ? 6 : 12).png().toBuffer();

  const px = Math.round((W - pW) / 2);
  const py = Math.round((H - pH) / 2);

  // ── Composite final image ──────────────────────────────────────────────────
  await sharp(bgBuf)
    .composite([
      { input: shadowBuf, top: Math.max(0, py + 12), left: Math.max(0, px + 10) },
      { input: photoBuf,  top: py,                   left: px },
    ])
    .jpeg({ quality: preview ? 80 : 95 })
    .toFile(outImage);

  // ── Store layers for video ─────────────────────────────────────────────────
  // Save background and a transparent-background Polaroid for the bob animation
  const bgPath    = path.join(tempDir, 'pf_bg.png');
  const polarPath = path.join(tempDir, 'pf_polar.png');

  await sharp(bgBuf).png().toFile(bgPath);

  // Transparent-BG Polaroid (RGBA) with shadow — slightly larger canvas for shadow room
  await sharp({
    create: { width: pW + 20, height: pH + 20, channels: 4,
              background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: shadowBuf, top: 12, left: 10 },
      { input: photoBuf,  top: 0,  left: 0  },
    ])
    .png()
    .toFile(polarPath);

  return { bgPath, polarPath, px, py, pW, pH };
}

async function videoPolaroidFloat(layers, W, H, dur, outVideo) {
  const { bgPath, polarPath, px, py } = layers;
  // Bob: Polaroid moves +8 px and back over `dur` seconds using sin
  const amp = Math.round(8 * (H / 1080));
  const filter = [
    `[0:v]format=yuv420p[bg]`,
    `[1:v]format=rgba[polar]`,
    `[bg][polar]overlay=x=${px}:y='${py}+${amp}*sin(2*PI*t/${dur})',format=yuv420p[vout]`,
  ].join(';');

  const loopT = String(dur + 1);
  await ffpromise(
    ffmpeg()
      .input(bgPath)    .inputOptions(['-loop', '1', '-r', '30', '-t', loopT])
      .input(polarPath) .inputOptions(['-loop', '1', '-r', '30', '-t', loopT])
      .outputOptions([
        '-filter_complex', filter,
        '-map', '[vout]',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-t', String(dur), '-r', '30', '-an',
        '-movflags', '+faststart',
      ])
      .output(outVideo)
  );
}

// ── Template 2: Neon Border ───────────────────────────────────────────────────

function neonBorderSVG(W, H, opacity = 1) {
  const NEON   = '#00FFD1';
  const br     = 6;   // inner border inset
  const gr     = 18;  // outer glow inset
  const bw     = 4;   // inner stroke-width
  const gw     = 12;  // outer glow stroke-width
  const arm    = Math.round(50 * (W / 1080)); // L-bracket arm length
  const margin = Math.round(22 * (W / 1080)); // corner margin from edge

  const corners = [
    // top-left
    `<path d="M${margin},${margin+arm} L${margin},${margin} L${margin+arm},${margin}" />`,
    // top-right
    `<path d="M${W-margin},${margin+arm} L${W-margin},${margin} L${W-margin-arm},${margin}" />`,
    // bottom-left
    `<path d="M${margin},${H-margin-arm} L${margin},${H-margin} L${margin+arm},${H-margin}" />`,
    // bottom-right
    `<path d="M${W-margin},${H-margin-arm} L${W-margin},${H-margin} L${W-margin-arm},${H-margin}" />`,
  ].join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="7" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g opacity="${opacity}">
    <rect x="${gr}" y="${gr}" width="${W - gr * 2}" height="${H - gr * 2}"
          fill="none" stroke="${NEON}" stroke-width="${gw}" opacity="0.4" filter="url(#glow)"/>
    <rect x="${br}" y="${br}" width="${W - br * 2}" height="${H - br * 2}"
          fill="none" stroke="${NEON}" stroke-width="${bw}" filter="url(#glow)"/>
    <g stroke="${NEON}" stroke-width="3" fill="none" filter="url(#glow)">${corners}</g>
  </g>
</svg>`;
}

async function renderNeonBorder(photos, W, H, tempDir, outImage, preview) {
  const photoBuf = await sharp(photos[0])
    .resize(W, H, { fit: 'cover' })
    .toBuffer();

  const borderBuf = svgBuf(neonBorderSVG(W, H));

  await sharp(photoBuf)
    .composite([{ input: borderBuf, blend: 'over' }])
    .jpeg({ quality: preview ? 80 : 95 })
    .toFile(outImage);

  // Save base photo and border for video animation
  const photoPath  = path.join(tempDir, 'nb_photo.png');
  const borderPath = path.join(tempDir, 'nb_border.png');
  await sharp(photoBuf).png().toFile(photoPath);
  await sharp(svgBuf(neonBorderSVG(W, H))).png().toFile(borderPath);

  return { photoPath, borderPath };
}

async function videoNeonBorder(layers, W, H, dur, outVideo) {
  const { photoPath, borderPath } = layers;
  // Border opacity pulses: 0.6→1.0→0.6 using sin
  const filter = [
    `[0:v]format=yuv420p[photo]`,
    `[1:v]format=rgba,colorchannelmixer=aa='0.6+0.4*abs(sin(PI*t/${dur}))'[border_anim]`,
    `[photo]format=rgba[photo_rgba]`,
    `[photo_rgba][border_anim]overlay=0:0,format=yuv420p[vout]`,
  ].join(';');

  const loopT = String(dur + 1);
  await ffpromise(
    ffmpeg()
      .input(photoPath)  .inputOptions(['-loop', '1', '-r', '30', '-t', loopT])
      .input(borderPath) .inputOptions(['-loop', '1', '-r', '30', '-t', loopT])
      .outputOptions([
        '-filter_complex', filter,
        '-map', '[vout]',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-t', String(dur), '-r', '30', '-an',
        '-movflags', '+faststart',
      ])
      .output(outVideo)
  );
}

// ── Template 3: Film Strip ────────────────────────────────────────────────────

function sprocketHolesSVG(W, H, cellW, sprocketH, holesPerCell, numCells = 3) {
  const holeW  = Math.round(14 * (W / 1080));
  const holeH  = Math.round(20 * (H / 566));
  const holeR  = 3;
  const holes  = [];
  for (let c = 0; c < numCells; c++) {
    const cellX = c * cellW;
    for (let s = 0; s < holesPerCell; s++) {
      const spacing = cellW / (holesPerCell + 1);
      const hx = Math.round(cellX + spacing * (s + 1) - holeW / 2);
      // top row
      const tyTop = Math.round(sprocketH / 2 - holeH / 2);
      // bottom row
      const tyBot = Math.round(H - sprocketH / 2 - holeH / 2);
      holes.push(`<rect x="${hx}" y="${tyTop}" width="${holeW}" height="${holeH}" rx="${holeR}" />`);
      holes.push(`<rect x="${hx}" y="${tyBot}" width="${holeW}" height="${holeH}" rx="${holeR}" />`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="black"/>
  <g fill="#1a1a1a">${holes.join('')}</g>
</svg>`;
}

async function renderFilmStrip(photos, W, H, tempDir, outImage, preview) {
  const cellW      = Math.round(W / 3);
  const sprocketH  = Math.round(50 * (H / 566));
  const cellPadH   = sprocketH + Math.round(8 * (H / 566));
  const photoH     = H - cellPadH * 2;
  const photoW     = cellW - Math.round(12 * (W / 1080));
  const gap        = Math.round(6 * (W / 1080));

  const cells = [];
  for (let i = 0; i < 3; i++) {
    const buf = await sharp(photos[i % photos.length])
      .resize(photoW, photoH, { fit: 'cover' })
      .toBuffer();
    const x = Math.round(i * cellW + (cellW - photoW) / 2);
    const y = cellPadH;
    cells.push({ input: buf, left: x, top: y });
  }

  const sprocketBuf = svgBuf(sprocketHolesSVG(W, H, cellW, sprocketH, 3));

  // Dividers (thin white lines between cells)
  const divW = gap;
  const divSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect x="${cellW - divW/2}" y="${sprocketH}" width="${divW}" height="${H - sprocketH * 2}" fill="white" opacity="0.25"/>
    <rect x="${cellW * 2 - divW/2}" y="${sprocketH}" width="${divW}" height="${H - sprocketH * 2}" fill="white" opacity="0.25"/>
  </svg>`;

  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([
      ...cells,
      { input: sprocketBuf, top: 0, left: 0 },
      { input: svgBuf(divSVG), top: 0, left: 0 },
    ])
    .jpeg({ quality: preview ? 80 : 95 })
    .toFile(outImage);

  if (preview) return {};  // no video layer needed for previews

  // For video: also render a "4-cell-wide" version (photos: 0,1,2,0) for scrolling
  const wideW = cellW * 4;
  const wideCells = [];
  for (let i = 0; i < 4; i++) {
    const buf = await sharp(photos[i % photos.length])
      .resize(photoW, photoH, { fit: 'cover' })
      .toBuffer();
    const x = Math.round(i * cellW + (cellW - photoW) / 2);
    wideCells.push({ input: buf, left: x, top: cellPadH });
  }
  const wideSprocket = svgBuf(sprocketHolesSVG(wideW, H, cellW, sprocketH, 3, 4));
  const wideImgPath = path.join(tempDir, 'fs_wide.png');
  await sharp({ create: { width: wideW, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([
      ...wideCells,
      { input: wideSprocket, top: 0, left: 0 },
    ])
    .png()
    .toFile(wideImgPath);

  return { wideImgPath, cellW };
}

async function videoFilmStrip(layers, W, H, dur, outVideo) {
  const { wideImgPath, cellW } = layers;
  // Scroll left by one cell over dur seconds, then snap back (loop point)
  const filter =
    `[0:v]crop=${W}:${H}:x='${cellW}*min(t/${dur},0.97)':y=0,format=yuv420p[vout]`;

  await ffpromise(
    ffmpeg()
      .input(wideImgPath).inputOptions(['-loop', '1', '-r', '30', '-t', String(dur + 0.5)])
      .outputOptions([
        '-filter_complex', filter,
        '-map', '[vout]',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-t', String(dur), '-r', '30', '-an',
        '-movflags', '+faststart',
      ])
      .output(outVideo)
  );
}

// ── Template 4: Vintage Fade ──────────────────────────────────────────────────

async function renderVintageFade(photos, W, H, tempDir, outImage, preview) {
  const borderPx = Math.round(24 * (W / 1080));
  const innerW   = W - borderPx * 2;
  const innerH   = H - borderPx * 2;

  // Vintage grade: desaturate + warm recomb
  const gradedBuf = await sharp(photos[0])
    .resize(innerW, innerH, { fit: 'cover' })
    .modulate({ saturation: 0.65, brightness: 1.03 })
    .recomb([
      [1.08,  0.00, -0.02],   // warm up reds
      [0.01,  1.02,  0.01],   // slight green lift
      [-0.06, 0.00,  0.92],   // cool down blues
    ])
    .toBuffer();

  // White vignette overlay (SVG radial gradient from white edges inward, fading to transparent)
  const vignetteSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${innerW}" height="${innerH}">
    <defs>
      <radialGradient id="v" cx="50%" cy="50%" r="70%">
        <stop offset="55%" stop-color="white" stop-opacity="0"/>
        <stop offset="100%" stop-color="white" stop-opacity="0.28"/>
      </radialGradient>
    </defs>
    <rect width="${innerW}" height="${innerH}" fill="url(#v)"/>
  </svg>`;

  // Film grain overlay (SVG turbulence noise)
  const grainSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${innerW}" height="${innerH}">
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
    <rect width="${innerW}" height="${innerH}" filter="url(#grain)" opacity="0.09"/>
  </svg>`;

  await sharp(gradedBuf)
    .composite([
      { input: svgBuf(grainSVG),    top: 0, left: 0 },
      { input: svgBuf(vignetteSVG), top: 0, left: 0 },
    ])
    .extend({
      top: borderPx, bottom: borderPx, left: borderPx, right: borderPx,
      background: { r: 245, g: 240, b: 232 },  // #F5F0E8 cream
    })
    .flatten({ background: { r: 245, g: 240, b: 232 } })
    .jpeg({ quality: preview ? 80 : 95 })
    .toFile(outImage);

  if (!preview) {
    // Save full-quality PNG for video (cropped inner area for Ken Burns)
    const imgPath = path.join(tempDir, 'vf_source.png');
    await sharp(photos[0])
      .resize(W * 2, H * 2, { fit: 'cover' })
      .modulate({ saturation: 0.65, brightness: 1.03 })
      .recomb([
        [1.08,  0.00, -0.02],
        [0.01,  1.02,  0.01],
        [-0.06, 0.00,  0.92],
      ])
      .png()
      .toFile(imgPath);
    return { imgPath, W, H };
  }
  return {};
}

async function videoVintageFade(layers, W, H, dur, outVideo) {
  const { imgPath } = layers;
  const halfDur = dur;    // each half of the bounce
  const frames  = dur * 30;
  const zStep   = (0.04 / frames).toFixed(8);

  // Forward segment: zoom 1.0 → 1.04
  const fwdPath = path.join(path.dirname(imgPath), 'vf_fwd.mp4');
  const revPath = path.join(path.dirname(imgPath), 'vf_rev.mp4');

  const zoomFilter = (step) =>
    `[0:v]format=yuv420p,` +
    `zoompan=z='min(zoom+${step},1.04)':` +
    `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
    `d=${frames}:s=${W}x${H}:fps=30[vout]`;

  // Forward
  await ffpromise(
    ffmpeg()
      .input(imgPath).inputOptions(['-loop', '1', '-r', '30', '-t', String(halfDur + 1)])
      .outputOptions([
        '-filter_complex', zoomFilter(zStep),
        '-map', '[vout]',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
        '-pix_fmt', 'yuv420p', '-t', String(halfDur), '-r', '30', '-an',
      ])
      .output(fwdPath)
  );

  // Reverse (time-reverse the forward segment)
  await ffpromise(
    ffmpeg()
      .input(fwdPath)
      .outputOptions([
        '-vf', 'reverse',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
        '-pix_fmt', 'yuv420p', '-an',
      ])
      .output(revPath)
  );

  // Concat fwd + rev → seamless loop
  const listPath = path.join(path.dirname(imgPath), 'vf_concat.txt');
  fs.writeFileSync(listPath,
    `file '${fwdPath.replace(/\\/g, '/').replace(/'/g, "\\'")}'\n` +
    `file '${revPath.replace(/\\/g, '/').replace(/'/g, "\\'")}'`
  );

  await ffpromise(
    ffmpeg()
      .input(listPath).inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions([
        '-map', '0:v', '-c:v', 'copy', '-an',
        '-movflags', '+faststart',
      ])
      .output(outVideo)
  );
}

// ── Template 5: Split Duo ─────────────────────────────────────────────────────

async function renderSplitDuo(photos, W, H, tempDir, outImage, preview) {
  const isPortrait = H > W;

  let leftBuf, rightBuf, leftX, leftY, rightX, rightY, lW, lH, rW, rH;

  if (!isPortrait) {
    // Side by side — each photo is W/2 × H
    lW = Math.round(W / 2); lH = H;
    rW = W - lW;            rH = H;
    leftX = 0;  leftY = 0;
    rightX = lW; rightY = 0;
  } else {
    // Stacked vertically — each photo is W × H/2
    lW = W; lH = Math.round(H / 2);
    rW = W; rH = H - lH;
    leftX = 0; leftY = 0;
    rightX = 0; rightY = lH;
  }

  // Warm grade for left/top: boost reds, reduce blues
  leftBuf = await sharp(photos[0])
    .resize(lW, lH, { fit: 'cover' })
    .recomb([
      [1.10, 0.02, -0.04],
      [0.00, 1.00,  0.00],
      [-0.06, 0.00, 0.88],
    ])
    .toBuffer();

  // Cool grade for right/bottom: reduce reds, boost blues
  rightBuf = await sharp(photos[photos.length > 1 ? 1 : 0])
    .resize(rW, rH, { fit: 'cover' })
    .recomb([
      [0.88, 0.00, -0.02],
      [0.00, 1.00,  0.00],
      [0.02, 0.00, 1.12],
    ])
    .toBuffer();

  // Divider (6px white line)
  const divPx = Math.round(6 * (W / 1080));
  const divSVG = isPortrait
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${divPx}"><rect width="${W}" height="${divPx}" fill="white"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${divPx}" height="${H}"><rect width="${divPx}" height="${H}" fill="white"/></svg>`;

  const divTop  = isPortrait ? lH - Math.round(divPx / 2) : 0;
  const divLeft = isPortrait ? 0 : lW - Math.round(divPx / 2);

  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([
      { input: leftBuf,        top: leftY,  left: leftX  },
      { input: rightBuf,       top: rightY, left: rightX },
      { input: svgBuf(divSVG), top: divTop, left: divLeft },
    ])
    .jpeg({ quality: preview ? 80 : 95 })
    .toFile(outImage);

  if (!preview) {
    // Save wider source images for pan animation
    const panExtra = Math.round(6 * (W / 1080));
    const leftSrc  = path.join(tempDir, 'sd_left.png');
    const rightSrc = path.join(tempDir, 'sd_right.png');
    await sharp(photos[0])
      .resize(lW + panExtra * 2, lH, { fit: 'cover' })
      .recomb([[1.10,0.02,-0.04],[0.00,1.00,0.00],[-0.06,0.00,0.88]])
      .png().toFile(leftSrc);
    await sharp(photos[photos.length > 1 ? 1 : 0])
      .resize(rW + panExtra * 2, rH, { fit: 'cover' })
      .recomb([[0.88,0.00,-0.02],[0.00,1.00,0.00],[0.02,0.00,1.12]])
      .png().toFile(rightSrc);
    return { leftSrc, rightSrc, lW, lH, rW, rH, isPortrait, divPx, divTop, divLeft };
  }
  return {};
}

async function videoSplitDuo(layers, W, H, dur, outVideo) {
  const { leftSrc, rightSrc, lW, lH, rW, rH, isPortrait, divPx, divTop, divLeft } = layers;
  const panPx = Math.round(6 * (W / 1080));
  const loopT = String(dur + 1);

  let filter;
  if (!isPortrait) {
    // Left pans left, right pans right (each starting from center)
    // Left: crop lW:H from wider image, x goes 0→panPx
    // Right: crop rW:H from wider image, x goes panPx→0
    filter = [
      `[0:v]crop=${lW}:${lH}:x='${panPx}*t/${dur}':y=0,format=yuv420p[left]`,
      `[1:v]crop=${rW}:${rH}:x='${panPx}-${panPx}*t/${dur}':y=0,format=yuv420p[right]`,
      `[left][right]hstack=inputs=2[stacked]`,
      `[stacked]drawbox=x=${divLeft}:y=0:w=${divPx}:h=${H}:color=white:t=fill[vout]`,
    ].join(';');
  } else {
    filter = [
      `[0:v]crop=${lW}:${lH}:x='${panPx}*t/${dur}':y=0,format=yuv420p[top]`,
      `[1:v]crop=${rW}:${rH}:x='${panPx}-${panPx}*t/${dur}':y=0,format=yuv420p[bottom]`,
      `[top][bottom]vstack=inputs=2[stacked]`,
      `[stacked]drawbox=x=0:y=${divTop}:w=${W}:h=${divPx}:color=white:t=fill[vout]`,
    ].join(';');
  }

  await ffpromise(
    ffmpeg()
      .input(leftSrc)  .inputOptions(['-loop', '1', '-r', '30', '-t', loopT])
      .input(rightSrc) .inputOptions(['-loop', '1', '-r', '30', '-t', loopT])
      .outputOptions([
        '-filter_complex', filter,
        '-map', '[vout]',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-t', String(dur), '-r', '30', '-an',
        '-movflags', '+faststart',
      ])
      .output(outVideo)
  );
}

// ── Template 6: Magazine Cover ────────────────────────────────────────────────

function magazineSVG(W, H) {
  const ruleY1 = Math.round(H * 0.08);
  const ruleY2 = Math.round(H * 0.88);
  const tickH  = 8;
  const tickSpacing = 40;

  const ticks1 = [];
  const ticks2 = [];
  for (let x = 0; x < W; x += tickSpacing) {
    ticks1.push(`<line x1="${x}" y1="${ruleY1 - tickH/2}" x2="${x}" y2="${ruleY1 + tickH/2}" stroke="white" stroke-width="1" opacity="0.7"/>`);
    ticks2.push(`<line x1="${x}" y1="${ruleY2 - tickH/2}" x2="${x}" y2="${ruleY2 + tickH/2}" stroke="white" stroke-width="1" opacity="0.7"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="black" stop-opacity="0"/>
        <stop offset="60%"  stop-color="black" stop-opacity="0"/>
        <stop offset="100%" stop-color="black" stop-opacity="0.72"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#grad)"/>
    <line x1="0" y1="${ruleY1}" x2="${W}" y2="${ruleY1}" stroke="white" stroke-width="2" opacity="0.9"/>
    <line x1="0" y1="${ruleY2}" x2="${W}" y2="${ruleY2}" stroke="white" stroke-width="2" opacity="0.9"/>
    ${ticks1.join('')}
    ${ticks2.join('')}
  </svg>`;
}

async function renderMagazineCover(photos, W, H, tempDir, outImage, preview) {
  const photoBuf = await sharp(photos[0])
    .resize(W, H, { fit: 'cover' })
    .toBuffer();

  await sharp(photoBuf)
    .composite([{ input: svgBuf(magazineSVG(W, H)), top: 0, left: 0 }])
    .jpeg({ quality: preview ? 80 : 95 })
    .toFile(outImage);

  if (!preview) {
    // Save larger source for zoompan (oversized so zoom has room)
    const srcPath = path.join(tempDir, 'mc_source.png');
    await sharp(photos[0])
      .resize(Math.round(W * 1.1), Math.round(H * 1.1), { fit: 'cover' })
      .png()
      .toFile(srcPath);
    return { srcPath };
  }
  return {};
}

async function videoMagazineCover(layers, W, H, dur, outVideo) {
  const { srcPath } = layers;
  const frames  = dur * 30;
  const zStep   = (0.06 / frames).toFixed(8);

  const fwdPath = path.join(path.dirname(srcPath), 'mc_fwd.mp4');
  const revPath = path.join(path.dirname(srcPath), 'mc_rev.mp4');

  // Magazine SVG overlay as a buffer for video compositing
  const magSvgPath = path.join(path.dirname(srcPath), 'mc_overlay.png');
  await sharp(svgBuf(magazineSVG(W, H))).png().toFile(magSvgPath);

  const zoomFilter =
    `[0:v]format=yuv420p,` +
    `zoompan=z='min(zoom+${zStep},1.06)':` +
    `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
    `d=${frames}:s=${W}x${H}:fps=30[zoomed];` +
    `[1:v]format=rgba[overlay];` +
    `[zoomed]format=rgba[zoomed_rgba];` +
    `[zoomed_rgba][overlay]overlay=0:0,format=yuv420p[vout]`;

  await ffpromise(
    ffmpeg()
      .input(srcPath)    .inputOptions(['-loop', '1', '-r', '30', '-t', String(dur + 1)])
      .input(magSvgPath) .inputOptions(['-loop', '1', '-r', '30', '-t', String(dur + 1)])
      .outputOptions([
        '-filter_complex', zoomFilter,
        '-map', '[vout]',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
        '-pix_fmt', 'yuv420p', '-t', String(dur), '-r', '30', '-an',
      ])
      .output(fwdPath)
  );

  // Time-reverse for seamless bounce loop
  await ffpromise(
    ffmpeg()
      .input(fwdPath)
      .outputOptions(['-vf', 'reverse', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-an'])
      .output(revPath)
  );

  const listPath = path.join(path.dirname(srcPath), 'mc_concat.txt');
  fs.writeFileSync(listPath,
    `file '${fwdPath.replace(/\\/g, '/').replace(/'/g, "\\'")}'` + '\n' +
    `file '${revPath.replace(/\\/g, '/').replace(/'/g, "\\'")}'`
  );
  await ffpromise(
    ffmpeg()
      .input(listPath).inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-map', '0:v', '-c:v', 'copy', '-an', '-movflags', '+faststart'])
      .output(outVideo)
  );
}

// ── Dispatch table ────────────────────────────────────────────────────────────

const IMAGE_RENDERERS = {
  'polaroid-float':  renderPolaroidFloat,
  'neon-border':     renderNeonBorder,
  'film-strip':      renderFilmStrip,
  'vintage-fade':    renderVintageFade,
  'split-duo':       renderSplitDuo,
  'magazine-cover':  renderMagazineCover,
};

const VIDEO_RENDERERS = {
  'polaroid-float':  videoPolaroidFloat,
  'neon-border':     videoNeonBorder,
  'film-strip':      videoFilmStrip,
  'vintage-fade':    videoVintageFade,
  'split-duo':       videoSplitDuo,
  'magazine-cover':  videoMagazineCover,
};

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Render a photo template — image only (preview) or image + video (full render).
 *
 * @param {{
 *   template:         object,
 *   sizeId:           string,
 *   photos:           string[],   absolute paths to uploaded photos
 *   outputImagePath:  string,
 *   outputVideoPath?: string,
 *   preview?:         boolean,
 * }} opts
 */
export async function renderPhotoTemplate({
  template, sizeId, photos,
  outputImagePath, outputVideoPath,
  preview = false,
}) {
  const size = template.sizes.find(s => s.id === sizeId);
  if (!size) throw new Error(`Unknown sizeId "${sizeId}" for template "${template.id}"`);

  const { width: W, height: H } = size;

  const imageRender = IMAGE_RENDERERS[template.id];
  const videoRender = VIDEO_RENDERERS[template.id];
  if (!imageRender) throw new Error(`No renderer for template "${template.id}"`);

  const tempDir = path.join(os.tmpdir(), `pt_${template.id}_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // Scale down for preview (fast path: target 540px wide)
    const scale = preview ? Math.min(1, 540 / W) : 1;
    const rW    = Math.round(W * scale);
    const rH    = Math.round(H * scale);

    // Render image — returns layer metadata for video
    const layers = await imageRender(photos, rW, rH, tempDir, outputImagePath, preview);

    // Render video (full quality only, not preview)
    if (!preview && outputVideoPath && videoRender && layers && Object.keys(layers).length > 0) {
      await videoRender(layers, W, H, template.animationDuration, outputVideoPath);
    }
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
