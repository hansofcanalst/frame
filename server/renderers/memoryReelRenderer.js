/**
 * memoryReelRenderer.js
 *
 * Renderer for the "Memory Reel" template.
 *
 * Each photo is displayed as a large, rotated Polaroid on a dark canvas
 * that accumulates all previously-shown photos as dimmed B&W Polaroids.
 * A slow Ken Burns zoom animates the active photo for its hold duration.
 *
 * Pipeline:
 *   1. sharp  — resize + Polaroid border + drop shadow → color PNG + B&W-dimmed PNG
 *   2. sharp  — composite B&W photos 0..i-1 onto a black canvas → bg_i.png
 *   3. FFmpeg — bg_i.png + color_i.png → zoompan + rotate + overlay → seg_i.mp4
 *   4. FFmpeg — concat demuxer joins all segments; optional audio is faded in/out
 *   (Optional) 3a — title card segment rendered before main segments
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
const CANVAS_H = 1080;
const FPS      = 30;

// ── Polaroid geometry (confirmed from reference-frame analysis) ────────────────
const PHOTO_FIT   = 680;                               // fit photo within this square
const BORDER_SIDE = 15;                                // top / left / right border
const BORDER_BOT  = 55;                                // wide Polaroid bottom
const POLAR_W     = PHOTO_FIT + BORDER_SIDE * 2;      // 710  (Polaroid face)
const POLAR_H     = PHOTO_FIT + BORDER_SIDE + BORDER_BOT; // 750

// Shadow extends 6 px right + 8 px down → extend canvas to avoid sharp overflow
const POLAR_CANVAS_W = POLAR_W + 14;   // 724 px  (output PNG width)
const POLAR_CANVAS_H = POLAR_H + 14;   // 764 px  (output PNG height)

// ── Timing ────────────────────────────────────────────────────────────────────
const TITLE_DUR   = 3.0;  // seconds for optional title card
const DEFAULT_SPP = 5.5;  // default seconds-per-photo (confirmed from frames)
const ZOOM_MAX    = 1.04; // Ken Burns maximum zoom (confirmed: subtle)

// ── Background B&W pile scatter positions (cx, cy, angleDeg) on 1920×1080 ─────
// Photos retire here when the next one becomes active.
const BG_SCATTER = [
  [ 480,  540,  -8], [1440,  270,  12], [ 300,  810,  -5], [1600,  810,  15],
  [ 960,  200, -11], [ 200,  350,   7], [1700,  540, -14], [ 700,  900,   9],
  [1200,  900,  -6], [ 450,  180,  13], [ 960,  720, -10], [1500,  400,   5],
  [ 700,  380, -12], [ 250,  680,   8], [1700,  200,  -7], [1100,  300,  11],
  [ 350,  120,  -9], [1550,  600,  14], [ 800,  120,   6], [1300,  700, -13],
  [ 600,  700,   4], [1750,  380,  -8], [ 150,  500,  10], [1050,  950,  -5],
  [ 850,  500,   7], [1400,  950, -11], [ 400,  480,   3], [1650,  150,  16],
  [ 750,  600,  -4], [1200,  150,   9],
];

// Tilt angles for the active (foreground) photo — cycles if N > 16
const ROTATIONS = [-8, 12, -5, 15, -11, 7, -14, 9, -6, 13, -10, 5, -12, 8, -7, 11];

// Active photo center positions: near canvas center, slight variation per slot
const ACTIVE_POS = [
  [960, 540], [920, 522], [980, 555], [940, 530],
  [970, 548], [952, 537], [988, 552], [935, 526],
];

// Extra canvas padding used during B&W composite to handle off-edge photos
const BG_PAD = 500;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Bounding box (px) of a W×H rect rotated by angleDeg. */
function rotatedBounds(w, h, angleDeg) {
  const r = Math.abs(angleDeg) * Math.PI / 180;
  return {
    w: Math.ceil(w * Math.cos(r) + h * Math.sin(r)),
    h: Math.ceil(w * Math.sin(r) + h * Math.cos(r)),
  };
}

// ── Sharp: create one Polaroid PNG ───────────────────────────────────────────

/**
 * Returns a POLAR_CANVAS_W × POLAR_CANVAS_H (724×764) RGB PNG Buffer:
 *   - photo resized to fit PHOTO_FIT px square
 *   - white Polaroid border
 *   - soft drop shadow (offset 6px right, 8px down)
 *   - dark (#0a0a0a) background canvas (14px larger than Polaroid face to fit shadow)
 *
 * @param {string}  imagePath
 * @param {boolean} isGrayscale — true: dimmed B&W for background pile
 */
async function createPolaroid(imagePath, isGrayscale) {
  let chain = sharp(imagePath).resize(PHOTO_FIT, PHOTO_FIT, {
    fit: 'contain',
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  });

  if (isGrayscale) {
    // Very dark for background pile (confirmed ~35% brightness from frames)
    chain = chain.grayscale().modulate({ brightness: 0.35 });
  } else {
    chain = chain.modulate({ saturation: 1.1, brightness: 1.02 });
  }

  const polarBuf = await chain
    .extend({
      top: BORDER_SIDE, bottom: BORDER_BOT,
      left: BORDER_SIDE, right: BORDER_SIDE,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();

  // Soft drop shadow: blurred semi-transparent black rectangle
  const shadowBuf = await sharp({
    create: {
      width:    POLAR_W,
      height:   POLAR_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 100 },
    },
  }).blur(8).png().toBuffer();

  // Compose: shadow offset (+6 right, +8 down) then Polaroid on top.
  // Canvas is 14 px wider/taller than the Polaroid face so the shadow
  // never overflows sharp's composite bounds.
  return sharp({
    create: {
      width:    POLAR_CANVAS_W,
      height:   POLAR_CANVAS_H,
      channels: 3,
      background: { r: 10, g: 10, b: 10 }, // #0a0a0a matches canvas BG
    },
  })
    .composite([
      { input: shadowBuf, top: 8, left: 6 },
      { input: polarBuf,  top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}

// ── Sharp: background composite ───────────────────────────────────────────────

/**
 * Composites the given B&W Polaroid PNGs onto a 1920×1080 black canvas,
 * each rotated and placed at its BG_SCATTER position.
 * A padded canvas (CANVAS + 2×BG_PAD) is used so near-edge photos don't
 * require clamping; the result is then cropped back to 1920×1080.
 */
async function buildBgPng(bwPaths, tempDir, idx) {
  const cW = CANVAS_W + BG_PAD * 2;
  const cH = CANVAS_H + BG_PAD * 2;
  const layers = [];

  for (let i = 0; i < bwPaths.length; i++) {
    const [cx, cy, angle] = BG_SCATTER[i % BG_SCATTER.length];

    const rotBuf = await sharp(bwPaths[i])
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

  const bgPath = path.join(tempDir, `bg_${idx}.png`);

  await sharp({
    create: { width: cW, height: cH, channels: 3, background: { r: 10, g: 10, b: 10 } },
  })
    .composite(layers)
    .extract({ left: BG_PAD, top: BG_PAD, width: CANVAS_W, height: CANVAS_H })
    .png()
    .toFile(bgPath);

  return bgPath;
}

// ── FFmpeg: single photo segment ──────────────────────────────────────────────

/**
 * Renders one photo segment: bg (static) + Ken-Burns-animated color Polaroid.
 *
 * filter_complex:
 *   bg → format=yuv420p
 *   polar → format → zoompan (Ken Burns) → rotate → overlay on bg
 */
function renderSegment({ bgPath, polarPath, angleDeg, cx, cy, segDur, outPath }) {
  return new Promise((resolve, reject) => {
    const rad    = (angleDeg * Math.PI / 180).toFixed(6);
    const frames = Math.round(segDur * FPS);
    const zStep  = (0.04 / frames).toFixed(8);
    // Use POLAR_CANVAS_W/H — the actual PNG output size from createPolaroid
    const { w: rotW, h: rotH } = rotatedBounds(POLAR_CANVAS_W, POLAR_CANVAS_H, angleDeg);
    const finalX = Math.round(cx - rotW / 2);
    const finalY = Math.round(cy - rotH / 2);
    const loopT  = String(Math.ceil(segDur) + 1);

    const filter = [
      `[0:v]format=yuv420p[bg]`,
      `[1:v]format=yuv420p,` +
        `zoompan=z='min(zoom+${zStep},${ZOOM_MAX})':` +
        `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
        `d=${frames}:s=${POLAR_CANVAS_W}x${POLAR_CANVAS_H}:fps=${FPS}[zoomed]`,
      `[zoomed]rotate=a=${rad}:out_w=${rotW}:out_h=${rotH}:fillcolor=0x0a0a0a[rotated]`,
      `[bg][rotated]overlay=x=${finalX}:y=${finalY}[vout]`,
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

// ── FFmpeg: title card segment ────────────────────────────────────────────────

/**
 * Renders a 3-second title card:
 *   - Background: ALL photos as B&W scatter pile
 *   - Foreground: first color Polaroid at center with Ken Burns
 *   - Title text fades in over first 0.5 s
 */
function renderTitleSeg({ bgPath, polarPath, titleText, outPath }) {
  return new Promise((resolve, reject) => {
    const angleDeg = ROTATIONS[0];
    const rad    = (angleDeg * Math.PI / 180).toFixed(6);
    const frames = Math.round(TITLE_DUR * FPS);
    const zStep  = (0.04 / frames).toFixed(8);
    // Use POLAR_CANVAS_W/H — the actual PNG output size from createPolaroid
    const { w: rotW, h: rotH } = rotatedBounds(POLAR_CANVAS_W, POLAR_CANVAS_H, angleDeg);
    const finalX = Math.round(CANVAS_W / 2 - rotW / 2);
    const finalY = Math.round(CANVAS_H / 2 - rotH / 2);
    const loopT  = String(Math.ceil(TITLE_DUR) + 1);

    // Font (Anton-Regular.ttf preferred; falls back to FFmpeg default)
    const fontPath = path.resolve(__dirname, '..', 'fonts', 'Anton-Regular.ttf');
    const hasFont  = fs.existsSync(fontPath);
    const fontStr  = hasFont
      ? `fontfile='${fontPath.replace(/\\/g, '/').replace(/:/g, '\\:')}':` : '';

    // Escape text for FFmpeg drawtext
    const escaped = (titleText || '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g,  "\\'")
      .replace(/:/g,  '\\:');

    const filter = [
      `[0:v]format=yuv420p[bg]`,
      `[1:v]format=yuv420p,` +
        `zoompan=z='min(zoom+${zStep},${ZOOM_MAX})':` +
        `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
        `d=${frames}:s=${POLAR_CANVAS_W}x${POLAR_CANVAS_H}:fps=${FPS}[zoomed]`,
      `[zoomed]rotate=a=${rad}:out_w=${rotW}:out_h=${rotH}:fillcolor=0x0a0a0a[rotated]`,
      `[bg][rotated]overlay=x=${finalX}:y=${finalY}[overlaid]`,
      // Title text centered horizontally, placed ~73% down canvas; fades in
      `[overlaid]drawtext=${fontStr}` +
        `text='${escaped}':` +
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

// ── FFmpeg: concat all segments + mix audio ───────────────────────────────────

/**
 * Uses the FFmpeg concat demuxer (-f concat) to join all segments with
 * stream-copy (no re-encode), then mixes in the audio (if provided).
 */
function concatAndMix({ segPaths, audioPath, totalDuration, outPath, tempDir }) {
  return new Promise((resolve, reject) => {
    // Write concat list with normalized (forward-slash) paths
    const listFile = path.join(tempDir, '_concat.txt');
    const lines = segPaths.map(p =>
      `file '${p.replace(/\\/g, '/').replace(/'/g, "\\'")}'`
    );
    fs.writeFileSync(listFile, lines.join('\n'));

    const cmd = ffmpeg()
      .input(listFile)
      .inputOptions(['-f', 'concat', '-safe', '0']);

    if (audioPath) {
      cmd.input(audioPath);
      const fadeStart = Math.max(0, totalDuration - 1.5).toFixed(3);
      cmd.outputOptions([
        '-filter_complex',
        `[1:a]atrim=end=${totalDuration.toFixed(3)},` +
          `asetpts=PTS-STARTPTS,` +
          `afade=t=out:st=${fadeStart}:d=1.5[aout]`,
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac', '-b:a', '192k',
        '-t', String(totalDuration),
        '-movflags', '+faststart',
      ]);
    } else {
      cmd.outputOptions([
        '-map', '0:v',
        '-c:v', 'copy',
        '-an',
        '-t', String(totalDuration),
        '-movflags', '+faststart',
      ]);
    }

    cmd
      .output(outPath)
      .on('start', c => console.log('[memory-reel] concat:', c.slice(0, 120) + '…'))
      .on('error', (err, _o, stderr) => {
        console.error('[memory-reel] concat error:', err.message);
        if (stderr) console.error('[memory-reel] stderr:', stderr.slice(-800));
        reject(err);
      })
      .on('end', resolve)
      .run();
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Render the Memory Reel template.
 *
 * @param {{
 *   clipFiles:      string[],          // 4–30 uploaded image paths
 *   audioPath:      string|null,
 *   titleText:      string|null,       // optional title card text
 *   targetDuration: number|null,       // optional total duration (seconds)
 *   onProgress:     ((msg:string)=>void)|undefined,
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

    // Seconds per photo: respect targetDuration if provided
    const secsPerPhoto = targetDuration
      ? Math.max(1.5, (targetDuration - (hasTitle ? TITLE_DUR : 0)) / N)
      : DEFAULT_SPP;

    const totalDuration = (hasTitle ? TITLE_DUR : 0) + N * secsPerPhoto;

    // ── Step 1: Pre-process photos ────────────────────────────────────────────
    onProgress?.('Preparing Polaroid frames…');
    const colorPaths = [];
    const bwPaths    = [];

    for (let i = 0; i < N; i++) {
      onProgress?.(`Processing photo ${i + 1} / ${N}…`);
      const [colorBuf, bwBuf] = await Promise.all([
        createPolaroid(clipFiles[i], false),
        createPolaroid(clipFiles[i], true),
      ]);
      const cp = path.join(tempDir, `color_${i}.png`);
      const bp = path.join(tempDir, `bw_${i}.png`);
      fs.writeFileSync(cp, colorBuf);
      fs.writeFileSync(bp, bwBuf);
      colorPaths.push(cp);
      bwPaths.push(bp);
    }

    // ── Step 2: Build background composites ───────────────────────────────────
    // bg[i] = B&W photos 0..i-1 composited (used as background when photo i is active)
    // bg[N] = all N photos in B&W (used for title card background)
    onProgress?.('Building background composites…');
    const bgPaths = [];

    // bg[0] = empty black canvas (first photo has no background pile yet)
    const emptyBg = path.join(tempDir, 'bg_0.png');
    await sharp({
      create: { width: CANVAS_W, height: CANVAS_H, channels: 3, background: { r: 10, g: 10, b: 10 } },
    }).png().toFile(emptyBg);
    bgPaths.push(emptyBg);

    for (let i = 1; i <= N; i++) {
      const bg = await buildBgPng(bwPaths.slice(0, i), tempDir, i);
      bgPaths.push(bg);
    }

    // ── Step 3: Render segments ───────────────────────────────────────────────
    const segPaths = [];

    if (hasTitle) {
      onProgress?.('Rendering title card…');
      const titleOut = path.join(tempDir, 'seg_title.mp4');
      await renderTitleSeg({
        bgPath:    bgPaths[N],         // all photos B&W as background
        polarPath: colorPaths[0],      // first photo in color at center
        titleText: titleText.trim(),
        outPath:   titleOut,
      });
      segPaths.push(titleOut);
    }

    for (let i = 0; i < N; i++) {
      onProgress?.(`Rendering photo ${i + 1} / ${N}…`);
      const angleDeg = ROTATIONS[i % ROTATIONS.length];
      const [cx, cy] = ACTIVE_POS[i % ACTIVE_POS.length];
      const segOut   = path.join(tempDir, `seg_${i}.mp4`);

      await renderSegment({
        bgPath:    bgPaths[i],         // B&W photos 0..i-1 as background
        polarPath: colorPaths[i],
        angleDeg, cx, cy,
        segDur:    secsPerPhoto,
        outPath:   segOut,
      });
      segPaths.push(segOut);
    }

    // ── Step 4: Concatenate + audio ───────────────────────────────────────────
    onProgress?.('Concatenating and mixing audio…');
    const filename = `memory_reel_${Date.now()}.mp4`;
    const outPath  = path.join(OUTPUTS_DIR, filename);

    await concatAndMix({ segPaths, audioPath, totalDuration, outPath, tempDir });

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
