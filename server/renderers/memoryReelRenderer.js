/**
 * memoryReelRenderer.js  —  v2 complete rewrite
 *
 * Key differences from v1:
 *  - Canvas: 1920 × 1196  (matches reference video height)
 *  - Active Polaroid: fit photo inside 1300 × 950 (landscape-first, natural aspect)
 *  - Polaroid borders: 22 / 22 / 22 / 75  (top / left / right / bottom)
 *  - Dense background: ONE static BG PNG built from ALL N photos placed at
 *    15 wall-to-wall BG_POSITIONS — same BG used for every segment
 *  - BG photos darkened: greyscale + brightness 0.35, then FFmpeg ×0.55 overlay
 *  - Active photo overlay position: finalX = 240+(i%3)*30, finalY = 80+(i%2)*25
 *  - Ken Burns: zoom += 0.00004 per frame  (barely perceptible, max ≈ 1.012)
 *  - Fly-in: active Polaroid slides from x = 2050 to finalX over 20 frames
 *  - Default seconds-per-photo: 2.8
 *  - Concat: FFmpeg concat FILTER (no playlist file — immune to Windows path bugs)
 */

import ffmpeg          from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import sharp           from 'sharp';
import fs              from 'node:fs';
import path            from 'node:path';
import os              from 'node:os';
import { fileURLToPath } from 'url';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const OUTPUTS_DIR = path.resolve(__dirname, '..', 'outputs');
fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

// ── Canvas ─────────────────────────────────────────────────────────────────────
const CANVAS_W = 1920;
const CANVAS_H = 1196;   // matches reference video (1920×1196)
const FPS      = 30;

// ── Active Polaroid geometry ───────────────────────────────────────────────────
// Photo is resized to fit INSIDE 1300×950 while preserving natural aspect ratio.
// No white letterbox padding — the Polaroid shape adapts to the photo.
const ACTIVE_MAX_W = 1300;
const ACTIVE_MAX_H = 950;
const BORDER_SIDE  = 22;   // top / left / right border (px)
const BORDER_BOT   = 75;   // wide Polaroid caption strip  (px)
// NOTE: POLAR_W, POLAR_H, POLAR_CANVAS_W/H are computed PER PHOTO in createActivePolaroid()

// ── Background Polaroid geometry (smaller, square contain) ────────────────────
const BG_PHOTO_FIT  = 680;
const BG_BORDER_S   = 15;
const BG_BORDER_B   = 55;
const BG_POLAR_W    = BG_PHOTO_FIT + BG_BORDER_S * 2;   // 710
const BG_POLAR_H    = BG_PHOTO_FIT + BG_BORDER_S + BG_BORDER_B;  // 750
const BG_CANVAS_W   = BG_POLAR_W + 14;   // 724  (shadow padding)
const BG_CANVAS_H   = BG_POLAR_H + 14;   // 764

// ── Timing ─────────────────────────────────────────────────────────────────────
const TITLE_DUR   = 3.0;   // title card duration (seconds)
const DEFAULT_SPP = 2.8;   // default seconds per photo

// ── Ken Burns ──────────────────────────────────────────────────────────────────
const ZOOM_STEP = 0.00004;  // added per frame — barely perceptible
const ZOOM_MAX  = 1.02;     // cap at 2% zoom

// ── Fly-in animation ───────────────────────────────────────────────────────────
const FLY_IN_FRAMES = 20;    // frames to slide from off-screen to final position
const FLY_IN_START  = 2050;  // starting x (just off right edge of 1920 canvas)

// ── 15 Background scatter positions (cx, cy, angleDeg) ────────────────────────
// Spread wall-to-wall across 1920 × 1196 so no black gaps show through.
// Large BG photos (724 × 764 each) overlap significantly at these positions.
const BG_POSITIONS = [
  // Row 1  — top area  (cy ≈ 200)
  [ 150,  200, -12],
  [ 560,  185,   8],
  [ 960,  165,  -9],
  [1360,  190,  11],
  [1780,  205,  -7],
  // Row 2  — middle  (cy ≈ 590)
  [  55,  590,   6],
  [ 480,  605, -14],
  [ 960,  590,  10],
  [1440,  580, -12],
  [1870,  600,   5],
  // Row 3  — bottom  (cy ≈ 980)
  [ 210,  985, -10],
  [ 660,  965,  13],
  [1100,  995,  -6],
  [1550,  975,   9],
  [1860,  985, -11],
];

// Tilt angles for the active foreground Polaroid (cycles for i > 15)
const ROTATIONS = [-8, 12, -5, 15, -11, 7, -14, 9, -6, 13, -10, 5, -12, 8, -7, 11];

// Extra canvas padding used during BG composite (handles near-edge photos)
const BG_PAD = 600;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Bounding box (px) of a W×H rect rotated by angleDeg. */
function rotatedBounds(w, h, angleDeg) {
  const r = Math.abs(angleDeg) * Math.PI / 180;
  return {
    w: Math.ceil(w * Math.cos(r) + h * Math.sin(r)),
    h: Math.ceil(w * Math.sin(r) + h * Math.cos(r)),
  };
}

// ── Sharp: create active (color) Polaroid PNG ──────────────────────────────────
/**
 * Resizes the photo to fit inside ACTIVE_MAX_W × ACTIVE_MAX_H preserving
 * natural aspect ratio (no letterboxing).  Returns:
 *   { buf, polarW, polarH, canvasW, canvasH }
 *
 * canvasW / canvasH are the actual PNG output dimensions (Polaroid face + shadow padding).
 */
async function createActivePolaroid(imagePath) {
  const meta  = await sharp(imagePath).metadata();
  const scale = Math.min(ACTIVE_MAX_W / meta.width, ACTIVE_MAX_H / meta.height);
  const photoW = Math.max(1, Math.round(meta.width  * scale));
  const photoH = Math.max(1, Math.round(meta.height * scale));

  const polarW  = photoW + BORDER_SIDE * 2;
  const polarH  = photoH + BORDER_SIDE + BORDER_BOT;
  const canvasW = polarW + 14;   // 14 px shadow overflow
  const canvasH = polarH + 14;

  // 1. Resize photo to exact natural size within max box
  const photoBuf = await sharp(imagePath)
    .resize(photoW, photoH, { fit: 'fill' })
    .modulate({ saturation: 1.1, brightness: 1.02 })
    .png()
    .toBuffer();

  // 2. Add white Polaroid borders
  const polarBuf = await sharp(photoBuf)
    .extend({
      top:    BORDER_SIDE,
      bottom: BORDER_BOT,
      left:   BORDER_SIDE,
      right:  BORDER_SIDE,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();

  // 3. Soft drop shadow
  const shadowBuf = await sharp({
    create: {
      width: polarW, height: polarH,
      channels: 4, background: { r: 0, g: 0, b: 0, alpha: 100 },
    },
  }).blur(8).png().toBuffer();

  // 4. Compose on TRANSPARENT canvas so FFmpeg rotate corners show the BG through
  //    shadow (semi-transparent) + Polaroid (fully opaque) on alpha=0 background
  const buf = await sharp({
    create: {
      width: canvasW, height: canvasH,
      channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 },  // fully transparent
    },
  })
    .composite([
      { input: shadowBuf, top: 8, left: 6 },
      { input: polarBuf,  top: 0, left: 0 },
    ])
    .png()
    .toBuffer();

  return { buf, polarW, polarH, canvasW, canvasH };
}

// ── Sharp: create background (BW dimmed) Polaroid PNG ─────────────────────────
/**
 * Always BG_CANVAS_W × BG_CANVAS_H (724 × 764).
 * Grayscale + brightness 0.35; shadow kept light so it doesn't bleed.
 */
async function createBgPolaroid(imagePath) {
  const photoBuf = await sharp(imagePath)
    .resize(BG_PHOTO_FIT, BG_PHOTO_FIT, {
      fit:        'contain',
      background: { r: 255, g: 255, b: 255 },
    })
    .grayscale()
    .modulate({ brightness: 0.40 })  // slightly lighter so photos are visible in BG
    .png()
    .toBuffer();

  const polarBuf = await sharp(photoBuf)
    .extend({
      top:    BG_BORDER_S,
      bottom: BG_BORDER_B,
      left:   BG_BORDER_S,
      right:  BG_BORDER_S,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();

  const shadowBuf = await sharp({
    create: {
      width: BG_POLAR_W, height: BG_POLAR_H,
      channels: 4, background: { r: 0, g: 0, b: 0, alpha: 80 },
    },
  }).blur(6).png().toBuffer();

  return await sharp({
    create: {
      width: BG_CANVAS_W, height: BG_CANVAS_H,
      channels: 3, background: { r: 10, g: 10, b: 10 },
    },
  })
    .composite([
      { input: shadowBuf, top: 7, left: 5 },
      { input: polarBuf,  top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}

// ── Sharp: ONE shared background PNG (all N photos) ───────────────────────────
/**
 * Composites ALL bwPaths onto a 1920 × 1196 dark canvas using BG_POSITIONS.
 * This single PNG is reused as-is for every video segment.
 */
async function buildBgPng(bwPaths, tempDir) {
  const cW = CANVAS_W + BG_PAD * 2;
  const cH = CANVAS_H + BG_PAD * 2;
  const layers = [];

  // Fill ALL 15 BG_POSITIONS by cycling through available photos.
  // This ensures full canvas coverage even with fewer than 15 input photos.
  const numSlots = BG_POSITIONS.length;
  for (let i = 0; i < numSlots; i++) {
    const photoPath = bwPaths[i % bwPaths.length];
    const [cx, cy, angle] = BG_POSITIONS[i];

    const rotBuf = await sharp(photoPath)
      .rotate(angle, { background: { r: 10, g: 10, b: 10 } })
      .png()
      .toBuffer();

    const { width: rW, height: rH } = await sharp(rotBuf).metadata();

    // Center the rotated image at (cx, cy) on the padded canvas
    const left = Math.round(cx - rW / 2 + BG_PAD);
    const top  = Math.round(cy - rH / 2 + BG_PAD);

    // Skip if completely outside the padded canvas
    if (left + rW <= 0 || top + rH <= 0 || left >= cW || top >= cH) continue;

    layers.push({ input: rotBuf, left: Math.max(0, left), top: Math.max(0, top) });
  }

  const bgPath = path.join(tempDir, 'bg_all.png');

  // Two-step to avoid sharp pipeline issues with composite+extract chaining
  const composited = await sharp({
    create: { width: cW, height: cH, channels: 3, background: { r: 10, g: 10, b: 10 } },
  })
    .composite(layers)
    .png()
    .toBuffer();

  await sharp(composited)
    .extract({ left: BG_PAD, top: BG_PAD, width: CANVAS_W, height: CANVAS_H })
    .png()
    .toFile(bgPath);

  return bgPath;
}

// ── FFmpeg: single photo segment ───────────────────────────────────────────────
/**
 * Renders one segment:
 *   input 0 = bg_all.png  (static, darkened in filter)
 *   input 1 = active Polaroid PNG  (Ken Burns zoom → rotate → fly-in overlay)
 *
 * @param {{
 *   bgPath:    string,
 *   polarPath: string,
 *   canvasW:   number,    // POLAR_CANVAS_W for this photo
 *   canvasH:   number,    // POLAR_CANVAS_H for this photo
 *   angleDeg:  number,
 *   finalX:    number,    // overlay top-left x (resting position)
 *   finalY:    number,    // overlay top-left y
 *   segDur:    number,
 *   outPath:   string,
 * }} opts
 */
function renderSegment({ bgPath, polarPath, canvasW, canvasH, angleDeg, finalX, finalY, segDur, outPath }) {
  return new Promise((resolve, reject) => {
    const rad    = (angleDeg * Math.PI / 180).toFixed(6);
    const frames = Math.round(segDur * FPS);
    const { w: rotW, h: rotH } = rotatedBounds(canvasW, canvasH, angleDeg);
    const loopT  = String(Math.ceil(segDur) + 1);

    // Fly-in x expression: slide from FLY_IN_START to finalX over FLY_IN_FRAMES
    const xExpr =
      `if(lte(n,${FLY_IN_FRAMES}),` +
        `${FLY_IN_START}+(${finalX}-${FLY_IN_START})*n/${FLY_IN_FRAMES},` +
        `${finalX})`;

    // Ken Burns via crop+scale (works with RGBA unlike zoompan)
    // Crops a slightly shrinking window then scales back to original size → zoom-in effect
    const zoomCrop =
      `crop=` +
        `w='iw/(1+${ZOOM_STEP}*n)':` +
        `h='ih/(1+${ZOOM_STEP}*n)':` +
        `x='(iw-iw/(1+${ZOOM_STEP}*n))/2':` +
        `y='(ih-ih/(1+${ZOOM_STEP}*n))/2',` +
      `scale=${canvasW}:${canvasH}`;

    const filter = [
      // BG: darken, keep as RGBA for alpha compositing
      `[0:v]format=rgb24,colorchannelmixer=rr=0.70:gg=0.70:bb=0.70,format=rgba[darkbg]`,
      // Active Polaroid: RGBA → Ken Burns crop+scale → rotate with transparent fill
      `[1:v]format=rgba,${zoomCrop}[zoomed]`,
      `[zoomed]rotate=a=${rad}:out_w=${rotW}:out_h=${rotH}:fillcolor=0x00000000[rotated]`,
      // Alpha-composite over darkened BG, then convert to yuv420p for encoding
      `[darkbg][rotated]overlay=x='${xExpr}':y=${finalY},format=yuv420p[vout]`,
    ].join(';');

    ffmpeg()
      .input(bgPath)    .inputOptions(['-loop', '1', '-r', String(FPS), '-t', loopT])
      .input(polarPath) .inputOptions(['-loop', '1', '-r', String(FPS), '-t', loopT])
      .outputOptions([
        '-filter_complex', filter,
        '-map', '[vout]',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-t', String(segDur), '-r', String(FPS), '-an',
      ])
      .output(outPath)
      .on('error', (err, _o, stderr) => {
        console.error('[memory-reel] segment error:', err.message);
        if (stderr) console.error('[memory-reel] stderr:', stderr.slice(-800));
        reject(err);
      })
      .on('end', resolve)
      .run();
  });
}

// ── FFmpeg: title card segment ─────────────────────────────────────────────────
/**
 * 3-second title card: dense BG + first photo centered with Ken Burns + title text.
 */
function renderTitleSeg({ bgPath, polarPath, canvasW, canvasH, titleText, outPath }) {
  return new Promise((resolve, reject) => {
    const angleDeg = ROTATIONS[0];
    const rad      = (angleDeg * Math.PI / 180).toFixed(6);
    const { w: rotW, h: rotH } = rotatedBounds(canvasW, canvasH, angleDeg);
    const finalX   = Math.round(CANVAS_W / 2 - rotW / 2);
    const finalY   = Math.round(CANVAS_H / 2 - rotH / 2);
    const loopT    = String(Math.ceil(TITLE_DUR) + 1);

    // Fly-in from right
    const xExpr =
      `if(lte(n,${FLY_IN_FRAMES}),` +
        `${FLY_IN_START}+(${finalX}-${FLY_IN_START})*n/${FLY_IN_FRAMES},` +
        `${finalX})`;

    // Font (Anton-Regular.ttf preferred; falls back to FFmpeg default)
    const fontPath = path.resolve(__dirname, '..', 'fonts', 'Anton-Regular.ttf');
    const hasFont  = fs.existsSync(fontPath);
    const fontStr  = hasFont
      ? `fontfile='${fontPath.replace(/\\/g, '/').replace(/:/g, '\\:')}':` : '';

    // Write title to a temp file so we avoid shell-quoting issues with spaces
    const titleFile = path.join(path.dirname(outPath), 'title.txt');
    fs.writeFileSync(titleFile, (titleText || '').trim(), 'utf8');
    const titleFilePath = titleFile.replace(/\\/g, '/').replace(/:/g, '\\:');

    // Ken Burns via crop+scale (works with RGBA unlike zoompan)
    const zoomCrop =
      `crop=` +
        `w='iw/(1+${ZOOM_STEP}*n)':` +
        `h='ih/(1+${ZOOM_STEP}*n)':` +
        `x='(iw-iw/(1+${ZOOM_STEP}*n))/2':` +
        `y='(ih-ih/(1+${ZOOM_STEP}*n))/2',` +
      `scale=${canvasW}:${canvasH}`;

    const filter = [
      // BG: darken, keep as RGBA for alpha compositing
      `[0:v]format=rgb24,colorchannelmixer=rr=0.70:gg=0.70:bb=0.70,format=rgba[darkbg]`,
      // Active Polaroid: RGBA → Ken Burns crop+scale → rotate with transparent fill
      `[1:v]format=rgba,${zoomCrop}[zoomed]`,
      `[zoomed]rotate=a=${rad}:out_w=${rotW}:out_h=${rotH}:fillcolor=0x00000000[rotated]`,
      // Alpha-composite over darkened BG, convert to yuv420p for drawtext
      `[darkbg][rotated]overlay=x='${xExpr}':y=${finalY},format=yuv420p[overlaid]`,
      // Title text: fades in over first 0.5 s (use textfile= to avoid space-quoting issues)
      `[overlaid]drawtext=${fontStr}` +
        `textfile='${titleFilePath}':` +
        `fontsize=96:fontcolor=white:` +
        `x='(w-text_w)/2':y='h*0.73':` +
        `shadowcolor=black@0.85:shadowx=4:shadowy=4:` +
        `alpha='if(lt(t,0.5),t/0.5,1)'` +
        `[vout]`,
    ].join(';');

    ffmpeg()
      .input(bgPath)    .inputOptions(['-loop', '1', '-r', String(FPS), '-t', loopT])
      .input(polarPath) .inputOptions(['-loop', '1', '-r', String(FPS), '-t', loopT])
      .outputOptions([
        '-filter_complex', filter,
        '-map', '[vout]',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-t', String(TITLE_DUR), '-r', String(FPS), '-an',
      ])
      .output(outPath)
      .on('error', (err, _o, stderr) => {
        console.error('[memory-reel] title error:', err.message);
        if (stderr) console.error('[memory-reel] stderr:', stderr.slice(-800));
        reject(err);
      })
      .on('end', resolve)
      .run();
  });
}

// ── FFmpeg: concat all segments + optional audio ───────────────────────────────
/**
 * Joins all segments via the FFmpeg concat FILTER (no playlist file).
 * Each segment is a separate -i input; avoids all Windows drive-letter issues.
 */
function concatAndMix({ segPaths, audioPath, totalDuration, outPath }) {
  return new Promise((resolve, reject) => {
    const n   = segPaths.length;
    const cmd = ffmpeg();

    for (const p of segPaths) cmd.input(p);

    const vInputs = Array.from({ length: n }, (_, i) => `[${i}:v]`).join('');
    let filter = `${vInputs}concat=n=${n}:v=1:a=0[vout]`;

    const mapArgs   = ['-map', '[vout]'];
    const audioOpts = [];

    if (audioPath) {
      cmd.input(audioPath);
      const fadeStart = Math.max(0, totalDuration - 1.5).toFixed(3);
      filter +=
        `;[${n}:a]atrim=end=${totalDuration.toFixed(3)},` +
        `asetpts=PTS-STARTPTS,` +
        `afade=t=out:st=${fadeStart}:d=1.5[aout]`;
      mapArgs.push('-map', '[aout]');
      audioOpts.push('-c:a', 'aac', '-b:a', '192k');
    } else {
      audioOpts.push('-an');
    }

    cmd
      .outputOptions([
        '-filter_complex', filter,
        ...mapArgs,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-t', String(totalDuration), '-r', '30',
        ...audioOpts,
        '-movflags', '+faststart',
      ])
      .output(outPath)
      .on('start', c => console.log('[memory-reel] concat start:', c.slice(0, 200)))
      .on('error', (err, _o, stderr) => {
        console.error('[memory-reel] concat error:', err.message);
        if (stderr) console.error('[memory-reel] stderr:', stderr.slice(-800));
        reject(err);
      })
      .on('end', resolve)
      .run();
  });
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Render the Memory Reel template.
 *
 * @param {{
 *   clipFiles:      string[],
 *   audioPath:      string | null,
 *   titleText:      string | null,
 *   targetDuration: number | null,
 *   onProgress:     ((msg: string) => void) | undefined,
 * }} opts
 */
export async function renderMemoryReel({
  clipFiles, audioPath, titleText, targetDuration, onProgress,
}) {
  const N = clipFiles.length;
  if (N < 4)  throw new Error('Memory Reel requires at least 4 photos.');
  if (N > 30) throw new Error('Memory Reel supports a maximum of 30 photos.');

  const tempDir = path.join(os.tmpdir(), `mr_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const hasTitle = !!(titleText?.trim());

    const secsPerPhoto = targetDuration
      ? Math.max(1.5, (targetDuration - (hasTitle ? TITLE_DUR : 0)) / N)
      : DEFAULT_SPP;

    const totalDuration = (hasTitle ? TITLE_DUR : 0) + N * secsPerPhoto;

    // ── Step 1: Pre-process all photos ────────────────────────────────────────
    onProgress?.('Preparing Polaroid frames…');

    /** @type {{ path: string; canvasW: number; canvasH: number }[]} */
    const activePaths = [];
    const bwPaths     = [];

    for (let i = 0; i < N; i++) {
      onProgress?.(`Processing photo ${i + 1} / ${N}…`);

      const [active, bgBuf] = await Promise.all([
        createActivePolaroid(clipFiles[i]),
        createBgPolaroid(clipFiles[i]),
      ]);

      const ap = path.join(tempDir, `active_${i}.png`);
      const bp = path.join(tempDir, `bw_${i}.png`);
      fs.writeFileSync(ap, active.buf);
      fs.writeFileSync(bp, bgBuf);

      activePaths.push({ path: ap, canvasW: active.canvasW, canvasH: active.canvasH });
      bwPaths.push(bp);
    }

    // ── Step 2: Build ONE shared background PNG (all N photos) ────────────────
    onProgress?.('Building background collage…');
    const bgPath = await buildBgPng(bwPaths, tempDir);

    // ── Step 3: Render video segments ─────────────────────────────────────────
    const segPaths = [];

    if (hasTitle) {
      onProgress?.('Rendering title card…');
      const titleOut = path.join(tempDir, 'seg_title.mp4');
      await renderTitleSeg({
        bgPath,
        polarPath: activePaths[0].path,
        canvasW:   activePaths[0].canvasW,
        canvasH:   activePaths[0].canvasH,
        titleText: titleText.trim(),
        outPath:   titleOut,
      });
      segPaths.push(titleOut);
    }

    for (let i = 0; i < N; i++) {
      onProgress?.(`Rendering photo ${i + 1} / ${N}…`);

      const angleDeg = ROTATIONS[i % ROTATIONS.length];
      const { path: polarPath, canvasW, canvasH } = activePaths[i];

      // Active photo resting position (overlay top-left of rotated bounding box)
      const finalX = 240 + (i % 3) * 30;
      const finalY = 80  + (i % 2) * 25;

      const segOut = path.join(tempDir, `seg_${i}.mp4`);

      await renderSegment({
        bgPath, polarPath, canvasW, canvasH,
        angleDeg, finalX, finalY,
        segDur: secsPerPhoto,
        outPath: segOut,
      });
      segPaths.push(segOut);
    }

    // ── Step 4: Concatenate + optional audio ──────────────────────────────────
    onProgress?.('Concatenating and mixing audio…');
    const filename = `memory_reel_${Date.now()}.mp4`;
    const outPath  = path.join(OUTPUTS_DIR, filename);

    await concatAndMix({ segPaths, audioPath, totalDuration, outPath });

    return {
      outputPath: outPath,
      filename,
      duration:   totalDuration,
      clipCount:  N,
    };

  } finally {
    // Best-effort temp cleanup
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
