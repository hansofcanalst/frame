/**
 * photoWallRenderer.js
 *
 * Dedicated renderer for the "Photo Wall" template.
 * Composites up to 8 Polaroid-style photos onto a 1920×1080 dark canvas
 * using a single FFmpeg complex filtergraph.
 *
 * Pipeline:
 *   1. sharp — resize + add Polaroid border + drop shadow for each photo
 *      → two PNGs per photo: color (hero) and B&W (settled)
 *   2. FFmpeg — rotate each PNG, chain overlay filters with time-based
 *      enable expressions so photos fly in sequentially and switch color→BW
 *      as each new photo arrives
 *   3. Mix in optional audio with 1.5 s fade-out
 */

import ffmpeg        from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import sharp         from 'sharp';
import fs            from 'node:fs';
import path          from 'node:path';
import os            from 'node:os';
import { fileURLToPath } from 'url';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const OUTPUTS_DIR = path.resolve(__dirname, '..', 'outputs');
fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

// ── Polaroid geometry ─────────────────────────────────────────────────────────

const PHOTO_FIT   = 490;   // photo resized to fit within this square (px)
const BORDER_SIDE = 18;    // white border — left, right, top  (px)
const BORDER_BOT  = 55;    // wide white bottom border (Polaroid look) (px)

const POLAROID_W  = PHOTO_FIT + BORDER_SIDE * 2;            // 526 px
const POLAROID_H  = PHOTO_FIT + BORDER_SIDE + BORDER_BOT;   // 563 px

// Extend 14 px for the drop shadow (6 px right + 8 px down, with 2 px spare)
const CANVAS_W    = POLAROID_W + 14;  // 540 px
const CANVAS_H    = POLAROID_H + 14;  // 577 px

// ── Layout presets (centerX, centerY, angleDeg) on 1920×1080 ─────────────────
// Photos are positioned in a scattered-but-intentional arrangement.
// Earlier photos (lower index) are further back in z-order.

const LAYOUT = [
  [ 490,  530,   -5],   // 1 – center-left, slight tilt
  [1420,  245,   12],   // 2 – upper-right
  [ 310,  810,    7],   // 3 – lower-left, overlaps #1 slightly
  [ 225,  295,  -15],   // 4 – upper-left
  [1240,  575,   -8],   // 5 – center-right, overlaps #2 slightly
  [1500,  845,   10],   // 6 – lower-right
  [ 740,  270,    5],   // 7 – upper-center
  [ 870,  790,  -12],   // 8 – lower-center
];

const PHOTO_DUR_S  = 2.5;   // seconds each photo has before the next one arrives
const FLY_DUR_S    = 0.30;  // fly-in animation duration (seconds)

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Bounding-box (width, height) of a W×H rectangle rotated by angleDeg.
 * FFmpeg's rotate filter with expand=1 will produce an image of this size.
 */
function rotatedBounds(w, h, angleDeg) {
  const r = Math.abs(angleDeg) * Math.PI / 180;
  return {
    w: Math.ceil(w * Math.cos(r) + h * Math.sin(r)),
    h: Math.ceil(w * Math.sin(r) + h * Math.cos(r)),
  };
}

// ── Sharp: build a Polaroid PNG (color or B&W) ────────────────────────────────

/**
 * Resize the image to fit PHOTO_FIT×PHOTO_FIT, add Polaroid white border,
 * composite a blurred drop shadow, and return a PNG Buffer.
 *
 * @param {string}  imagePath    absolute path to the source image
 * @param {boolean} isGrayscale  true → desaturate (settled look)
 */
async function createPolaroidPng(imagePath, isGrayscale) {
  // 1. Resize to fit within PHOTO_FIT × PHOTO_FIT (contain, white background)
  let chain = sharp(imagePath).resize(PHOTO_FIT, PHOTO_FIT, {
    fit: 'contain',
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  });

  // 2. Colour treatment
  if (isGrayscale) {
    chain = chain.grayscale();
  } else {
    chain = chain.modulate({ saturation: 1.1, brightness: 1.02 });
  }

  // 3. Add Polaroid border (white)
  const polaroidBuf = await chain
    .extend({
      top: BORDER_SIDE, bottom: BORDER_BOT,
      left: BORDER_SIDE, right: BORDER_SIDE,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();

  // 4. Shadow: semi-transparent blurred black rectangle the same size as the Polaroid
  const shadowBuf = await sharp({
    create: {
      width:      POLAROID_W,
      height:     POLAROID_H,
      channels:   4,
      background: { r: 0, g: 0, b: 0, alpha: 110 },
    },
  })
    .blur(7)
    .png()
    .toBuffer();

  // 5. Compose on a dark canvas: shadow offset (+6, +8) then Polaroid at (0, 0)
  return sharp({
    create: {
      width:      CANVAS_W,
      height:     CANVAS_H,
      channels:   3,
      background: { r: 17, g: 17, b: 17 },   // #111111
    },
  })
    .composite([
      { input: shadowBuf,   top: 8, left: 6 },   // shadow slightly down-right
      { input: polaroidBuf, top: 0, left: 0 },   // Polaroid on top
    ])
    .png()
    .toBuffer();
}

// ── FFmpeg compositor ─────────────────────────────────────────────────────────

/**
 * Build and run the FFmpeg filtergraph that composites all Polaroids.
 *
 * Input layout:
 *   [0]         — lavfi color background
 *   [2i+1]      — color PNG for photo i  (i = 0..N-1)
 *   [2i+2]      — B&W   PNG for photo i
 *   [2N+1]      — audio  (if present)
 *
 * Z-order chain (bottom → top):
 *   bg  →  bw_0  →  color_0  →  bw_1  →  color_1  →  …  →  color_(N-1)
 *
 * Each photo flies in from the right edge; after its hero period it becomes B&W
 * (color overlay disabled, B&W overlay underneath it shows through).
 */
function runPhotoWallFFmpeg({ N, colorPngs, bwPngs, layout, totalDuration, audioPath, outputPath }) {
  return new Promise((resolve, reject) => {
    const cmd     = ffmpeg();
    const loopSec = String(Math.ceil(totalDuration + 1));

    // ── Inputs ────────────────────────────────────────────────────────────────
    // Input 0 : dark background (lavfi)
    // Inputs 1..N   : colour Polaroids  (index = i + 1)
    // Inputs N+1..2N-1 : B&W Polaroids for photos 0..N-2 only
    //                    (index = N + 1 + i)  — last photo always stays colour
    // Input 2N  : audio (if present)

    cmd
      .input(`color=c=#111111:size=1920x1080:rate=30:duration=${(totalDuration + 0.5).toFixed(3)}`)
      .inputOptions(['-f', 'lavfi']);

    for (let i = 0; i < N; i++) {
      cmd.input(colorPngs[i]).inputOptions(['-loop', '1', '-t', loopSec]);
    }
    for (let i = 0; i < N - 1; i++) {          // skip last photo's B&W — never used
      cmd.input(bwPngs[i]).inputOptions(['-loop', '1', '-t', loopSec]);
    }

    const audioIdx = 2 * N;                     // 1 bg + N colour + (N-1) bw = 2N
    if (audioPath) cmd.input(audioPath);

    // ── Build filter_complex ──────────────────────────────────────────────────
    const parts = [];

    // Phase 1: Rotate each PNG.
    // Use pre-computed pixel dimensions from rotatedBounds() for out_w/out_h
    // so we avoid expression-quoting issues across FFmpeg versions.
    for (let i = 0; i < N; i++) {
      const [, , angleDeg]       = layout[i];
      const rad                  = (angleDeg * Math.PI / 180).toFixed(6);
      const { w: rotW, h: rotH } = rotatedBounds(CANVAS_W, CANVAS_H, angleDeg);
      const cIdx   = i + 1;           // colour input index
      const bwIdx  = N + 1 + i;       // B&W input index (only valid for i < N-1)
      const isLast = i === N - 1;

      parts.push(
        `[${cIdx}:v]format=yuv420p,` +
        `rotate=a=${rad}:out_w=${rotW}:out_h=${rotH}:fillcolor=0x111111` +
        `[rot_c${i}]`
      );
      if (!isLast) {
        parts.push(
          `[${bwIdx}:v]format=yuv420p,` +
          `rotate=a=${rad}:out_w=${rotW}:out_h=${rotH}:fillcolor=0x111111` +
          `[rot_bw${i}]`
        );
      }
    }

    // Phase 2: Overlay chain (bottom → top)
    let prev = '[0:v]';

    for (let i = 0; i < N; i++) {
      const [cx, cy, angleDeg] = layout[i];
      const { w: rW, h: rH }   = rotatedBounds(CANVAS_W, CANVAS_H, angleDeg);

      // Top-left corner of the rotated image on the 1920×1080 canvas
      const finalX = Math.round(cx - rW / 2);
      const finalY = Math.round(cy - rH / 2);

      const startTime = i * PHOTO_DUR_S;
      const endTime   = (i + 1) * PHOTO_DUR_S;
      const isLast    = i === N - 1;

      // B&W overlay: settles in from endTime onward
      if (!isLast) {
        const bwOut = `[l_bw${i}]`;
        parts.push(
          `${prev}[rot_bw${i}]overlay` +
          `=x=${finalX}:y=${finalY}` +
          `:enable='gte(t,${endTime.toFixed(3)})'` +
          `${bwOut}`
        );
        prev = bwOut;
      }

      // Colour overlay: flies in from the right, active during its hero window.
      // Use `t` (overlay stream timestamp) — equivalent to main_t here and
      // more broadly supported across FFmpeg builds.
      const cOut   = isLast ? '[vout]' : `[l_c${i}]`;
      const flyEnd = (startTime + FLY_DUR_S).toFixed(3);

      const flyX =
        `if(lt(t,${flyEnd}),` +
        `1920+(${finalX}-1920)*(t-${startTime.toFixed(3)})/${FLY_DUR_S},` +
        `${finalX})`;

      const enableExpr = isLast
        ? `gte(t,${startTime.toFixed(3)})`
        : `between(t,${startTime.toFixed(3)},${endTime.toFixed(3)})`;

      parts.push(
        `${prev}[rot_c${i}]overlay` +
        `=x='${flyX}'` +
        `:y=${finalY}` +
        `:enable='${enableExpr}'` +
        `${cOut}`
      );
      prev = cOut;
    }

    // Phase 3: Audio — trim to video length, then 1.5 s fade-out
    if (audioPath) {
      const fadeStart = Math.max(0, totalDuration - 1.5).toFixed(3);
      parts.push(
        `[${audioIdx}:a]` +
        `atrim=end=${totalDuration.toFixed(3)},` +
        `asetpts=PTS-STARTPTS,` +
        `afade=t=out:st=${fadeStart}:d=1.5` +
        `[aout]`
      );
    }

    const complexFilter = parts.join(';');

    // ── Output ────────────────────────────────────────────────────────────────
    const mapArgs = ['-map', '[vout]'];
    if (audioPath) mapArgs.push('-map', '[aout]');

    cmd
      .outputOptions([
        '-filter_complex', complexFilter,
        ...mapArgs,
        '-c:v',      'libx264',
        '-preset',   'fast',
        '-crf',      '22',
        '-pix_fmt',  'yuv420p',
        '-t',        String(totalDuration),
        '-movflags', '+faststart',
        ...(audioPath ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']),
      ])
      .output(outputPath)
      .on('start', cmd =>
        console.log('[photo-wall] FFmpeg start:', cmd.slice(0, 130) + '…'))
      .on('error', (err, _out, stderr) => {
        console.error('[photo-wall] FFmpeg error:', err.message);
        if (stderr) console.error('[photo-wall] stderr (tail):', stderr.slice(-1200));
        reject(err);
      })
      .on('end', resolve)
      .run();
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Render the Photo Wall template.
 *
 * @param {{
 *   clipFiles:   string[],                        — 3–8 uploaded image paths
 *   audioPath:   string|null,
 *   onProgress:  ((msg: string) => void)|undefined,
 * }} opts
 * @returns {Promise<{ outputPath, filename, duration, clipCount }>}
 */
export async function renderPhotoWall({ clipFiles, audioPath, onProgress }) {
  const N = clipFiles.length;

  if (N < 3) throw new Error('Photo Wall requires at least 3 photos.');
  if (N > 8) throw new Error('Photo Wall supports a maximum of 8 photos.');

  const tempDir = path.join(os.tmpdir(), `pw_${Date.now()}`);
  fs.mkdirSync(tempDir);

  try {
    const totalDuration = N * PHOTO_DUR_S;
    const layout        = LAYOUT.slice(0, N);

    // 1. Pre-process: build colour + B&W Polaroid PNGs
    onProgress?.('Preparing Polaroid frames…');
    const colorPngs = [];
    const bwPngs    = [];

    for (let i = 0; i < N; i++) {
      onProgress?.(`Processing photo ${i + 1} / ${N}…`);

      const [colorBuf, bwBuf] = await Promise.all([
        createPolaroidPng(clipFiles[i], false),
        createPolaroidPng(clipFiles[i], true),
      ]);

      const cPath  = path.join(tempDir, `color_${i}.png`);
      const bwPath = path.join(tempDir, `bw_${i}.png`);
      fs.writeFileSync(cPath,  colorBuf);
      fs.writeFileSync(bwPath, bwBuf);

      colorPngs.push(cPath);
      bwPngs.push(bwPath);
    }

    // 2. FFmpeg composite
    onProgress?.('Compositing photo wall…');
    const outputFilename = `photo_wall_${Date.now()}.mp4`;
    const outputPath     = path.join(OUTPUTS_DIR, outputFilename);

    await runPhotoWallFFmpeg({
      N, colorPngs, bwPngs, layout, totalDuration, audioPath, outputPath,
    });

    return {
      outputPath,
      filename:  outputFilename,
      duration:  totalDuration,
      clipCount: N,
    };

  } finally {
    // Clean up temp PNGs best-effort
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
