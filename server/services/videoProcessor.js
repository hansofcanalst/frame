/**
 * videoProcessor.js
 * FFmpeg-backed video edit functions.
 * Each named export takes (inputPath, outputPath, options?) → Promise<void>
 */
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// ── Startup verification ────────────────────────────────────────────────────

/**
 * Verifies FFmpeg is reachable and logs its version.
 * Throws if the binary cannot be executed.
 */
export function verifyFfmpeg() {
  return new Promise((resolve, reject) => {
    ffmpeg.getAvailableFormats((err) => {
      if (err) {
        reject(new Error(`FFmpeg not available at "${ffmpegInstaller.path}": ${err.message}`));
      } else {
        console.log(`✓ FFmpeg ${ffmpegInstaller.version} ready (${ffmpegInstaller.path})`);
        resolve(ffmpegInstaller.version);
      }
    });
  });
}

// ── Shared helpers ──────────────────────────────────────────────────────────

const VALID_EXT = /\.(mp4|mov|webm|jpg|jpeg|png)$/i;

function validateInput(inputPath) {
  if (!VALID_EXT.test(inputPath)) {
    throw new Error(`Unsupported input format: ${path.extname(inputPath)}. Use mp4/mov/jpg/png.`);
  }
}

/**
 * Core runner: applies a vf filter chain and writes an mp4.
 * @param {string}   inputPath
 * @param {string}   outputPath
 * @param {string[]} filters     - array of ffmpeg video filter strings
 * @param {object}   [extra]     - extra outputOptions (merged with defaults)
 */
function run(inputPath, outputPath, filters = [], extra = {}) {
  validateInput(inputPath);
  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(inputPath);

    if (filters.length > 0) cmd = cmd.videoFilters(filters);

    const defaultOpts = [
      '-c:v libx264',
      '-preset fast',
      '-crf 22',
      '-pix_fmt yuv420p',
      '-movflags +faststart',
      '-t 30',
    ];

    cmd
      .outputOptions([...defaultOpts, ...(extra.outputOptions ?? [])])
      .output(outputPath)
      .on('start', (cmdLine) => console.log(`[ffmpeg] ${path.basename(outputPath)}:`, cmdLine.slice(0, 100)))
      .on('error', (err, _stdout, stderr) => {
        console.error(`[ffmpeg] error on ${path.basename(outputPath)}:`, err.message);
        if (stderr) console.error('[ffmpeg] stderr:', stderr.slice(-400));
        reject(err);
      })
      .on('end', resolve)
      .run();
  });
}

// ── 1. Color Grade ──────────────────────────────────────────────────────────
/**
 * Adjust brightness, contrast, and saturation.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {{ brightness?: number, contrast?: number, saturation?: number }} opts
 *   brightness: -0.5 to 0.5  (0 = no change)
 *   contrast:   0.5 to 2.0   (1 = no change)
 *   saturation: 0.0 to 3.0   (1 = no change)
 */
export function colorGrade(inputPath, outputPath, {
  brightness = 0,
  contrast = 1,
  saturation = 1,
} = {}) {
  const parts = [];
  if (brightness !== 0) parts.push(`brightness=${brightness.toFixed(3)}`);
  if (contrast   !== 1) parts.push(`contrast=${contrast.toFixed(3)}`);
  if (saturation !== 1) parts.push(`saturation=${saturation.toFixed(3)}`);
  const filters = parts.length ? [`eq=${parts.join(':')}`] : [];
  return run(inputPath, outputPath, filters);
}

// ── 2. Black & White ────────────────────────────────────────────────────────
/**
 * Fully desaturate the video.
 */
export function blackAndWhite(inputPath, outputPath) {
  return run(inputPath, outputPath, ['hue=s=0']);
}

// ── 3. Warm Tone ────────────────────────────────────────────────────────────
/**
 * Boost reds/yellows, reduce blues for a warm, golden look.
 */
export function warmTone(inputPath, outputPath) {
  return run(inputPath, outputPath, [
    'colorbalance=rs=0.12:gs=0.04:bs=-0.10:rm=0.08:gm=0.02:bm=-0.06',
    'eq=saturation=1.15:gamma=0.95',
  ]);
}

// ── 4. Cool Tone ────────────────────────────────────────────────────────────
/**
 * Boost blues/cyans, reduce reds for a cold, clinical look.
 */
export function coolTone(inputPath, outputPath) {
  return run(inputPath, outputPath, [
    'colorbalance=rs=-0.10:gs=0.02:bs=0.14:rm=-0.06:gm=0.01:bm=0.08',
    'eq=saturation=1.1:gamma=1.05',
  ]);
}

// ── 5. Vignette ─────────────────────────────────────────────────────────────
/**
 * Darken edges with a circular vignette.
 */
export function applyVignette(inputPath, outputPath) {
  return run(inputPath, outputPath, ['vignette=PI/3.5:eval=init']);
}

// ── 6. Cinematic Crop ───────────────────────────────────────────────────────
/**
 * Crop to 2.35:1 anamorphic aspect ratio (letterbox bars removed, content cropped).
 */
export function cinematicCrop(inputPath, outputPath) {
  // Crop height to iw/2.35, centered vertically
  const filter = 'crop=iw:trunc(iw/2.35/2)*2:0:(ih-trunc(iw/2.35/2)*2)/2';
  return run(inputPath, outputPath, [filter]);
}

// ── 7. Film Grain ───────────────────────────────────────────────────────────
/**
 * Add analogue-style noise/grain.
 * @param {{ strength?: number }} opts  strength: 0–100 (default 20)
 */
export function filmGrain(inputPath, outputPath, { strength = 20 } = {}) {
  const s = Math.round(Math.min(100, Math.max(0, strength)));
  return run(inputPath, outputPath, [`noise=alls=${s}:allf=t+u`]);
}

// ── 8. Speed Ramp ───────────────────────────────────────────────────────────
/**
 * Change playback speed (no audio preserved).
 * @param {{ speed?: number }} opts  speed: e.g. 2.0 = 2× faster, 0.5 = half speed
 */
export function speedRamp(inputPath, outputPath, { speed = 1.5 } = {}) {
  const s = Math.min(8, Math.max(0.1, speed));
  // setpts: PTS *= 1/speed  →  faster when speed > 1
  const filter = `setpts=${(1 / s).toFixed(4)}*PTS`;
  return run(inputPath, outputPath, [filter], {
    outputOptions: ['-an'],  // strip audio (atempo can't handle all speed ranges)
  });
}

// ── 9. Text Overlay ─────────────────────────────────────────────────────────
/**
 * Burn a styled text label into the video.
 * @param {{
 *   text?: string,
 *   fontsize?: number,
 *   color?: string,
 *   position?: 'top'|'center'|'bottom'
 * }} opts
 */
export function textOverlay(inputPath, outputPath, {
  text = 'FRAME',
  fontsize = 48,
  color = 'white',
  position = 'bottom',
} = {}) {
  const safe = String(text)
    .slice(0, 50)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');

  const yMap = { top: 'h*0.08', center: '(h-text_h)/2', bottom: 'h*0.87' };
  const y = yMap[position] ?? yMap.bottom;

  const filter =
    `drawtext=text='${safe}':fontsize=${fontsize}:fontcolor=${color}@0.92:` +
    `x=(w-text_w)/2:y=${y}:box=1:boxcolor=black@0.55:boxborderw=8`;

  return run(inputPath, outputPath, [filter]);
}

// ── 10. Thumbnail Extractor ─────────────────────────────────────────────────
/**
 * Extract a single JPEG frame from a video.
 * @param {string} videoPath
 * @param {string} outputPath   must end in .jpg / .jpeg
 * @param {{ timestamp?: number }} opts   seconds into video (default 1)
 */
export function extractThumbnail(videoPath, outputPath, { timestamp = 1 } = {}) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: [timestamp],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '1280x?',
      })
      .on('end', resolve)
      .on('error', reject);
  });
}

// ── Backward-compat aliases ─────────────────────────────────────────────────
// Keep these so existing api.js / routes still import without changes.

export const extractFrame = (videoPath, outputPath, seconds = 1) =>
  extractThumbnail(videoPath, outputPath, { timestamp: seconds });

export const generateVideoThumbnail = (videoPath, thumbPath) =>
  extractThumbnail(videoPath, thumbPath, { timestamp: 1 });

/**
 * Generic processor driven by the Claude ops schema (used by /api/generate).
 * Maps the full ops object to the appropriate filter chain.
 */
export function processVideoEdit(inputPath, outputPath, ops) {
  const filters = buildLegacyFilterChain(ops);
  return run(inputPath, outputPath, filters);
}

function buildLegacyFilterChain(ops) {
  const filters = [];
  const eq = [];
  if (ops.brightness !== 0)                      eq.push(`brightness=${ops.brightness.toFixed(3)}`);
  if (ops.contrast   !== 1)                      eq.push(`contrast=${ops.contrast.toFixed(3)}`);
  if (ops.saturation !== 1 && !ops.grayscale)    eq.push(`saturation=${ops.saturation.toFixed(3)}`);
  if (ops.gamma      !== 1)                      eq.push(`gamma=${ops.gamma.toFixed(3)}`);
  if (eq.length) filters.push(`eq=${eq.join(':')}`);

  if (ops.grayscale)                             filters.push('hue=s=0');
  if (!ops.grayscale && ops.hue !== 0)           filters.push(`hue=h=${ops.hue}`);

  if (!ops.grayscale && ops.warm !== 0) {
    const w = ops.warm;
    if (w > 0) {
      filters.push(`colorbalance=rs=${(w*0.18).toFixed(3)}:gs=${(w*0.04).toFixed(3)}:bs=${(-w*0.12).toFixed(3)}`);
    } else {
      const c = -w;
      filters.push(`colorbalance=rs=${(-c*0.12).toFixed(3)}:gs=${(c*0.02).toFixed(3)}:bs=${(c*0.18).toFixed(3)}`);
    }
  }

  if (ops.grain  > 0.05) filters.push(`noise=alls=${Math.round(ops.grain * 32)}:allf=t+u`);
  if (ops.vignette)      filters.push('vignette=PI/4');
  if (ops.blur   > 0)    filters.push(`boxblur=${Math.max(1, Math.round(ops.blur * 2))}:1`);

  if (ops.crop_ratio) {
    if (ops.crop_ratio === '21:9') filters.push('crop=iw:trunc(iw*9/21/2)*2:0:(ih-trunc(iw*9/21/2)*2)/2');
    if (ops.crop_ratio === '1:1')  filters.push('crop=min(iw\\,ih):min(iw\\,ih):(iw-min(iw\\,ih))/2:(ih-min(iw\\,ih))/2');
    if (ops.crop_ratio === '9:16') filters.push('crop=trunc(ih*9/16/2)*2:ih:(iw-trunc(ih*9/16/2)*2)/2:0');
  }

  if (ops.text_overlay) {
    const safe = ops.text_overlay.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/:/g,'\\:').replace(/\[/g,'\\[').replace(/\]/g,'\\]');
    filters.push(`drawtext=text='${safe}':fontsize=h/22:fontcolor=white@0.92:x=(w-text_w)/2:y=h*0.87:box=1:boxcolor=black@0.52:boxborderw=6`);
  }

  return filters;
}
