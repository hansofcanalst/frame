/**
 * templateRenderer.js
 * Full rendering pipeline for video templates.
 *
 * Steps:
 *   1. Treat each clip (scale/pad, color grade)
 *   2. Concatenate treated clips
 *   3. Build & apply word-by-word captions via drawtext
 *   4. Mix optional background audio
 *   5. Return output path
 */

import ffmpeg        from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs            from 'node:fs';
import path          from 'node:path';
import os            from 'node:os';
import { fileURLToPath } from 'url';

import { getTreatmentFilter }              from '../treatments.js';
import { buildCaptions, buildDrawtextFilterChain } from '../captionEngine.js';
import {
  buildClipFilterChain,
  buildXfadeFilters,
  buildGlobalFilterChain,
  applyFilterToVideo,
} from '../effectsProcessor.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const OUTPUTS_DIR = path.resolve(__dirname, '..', 'outputs');
const FONTS_DIR   = path.resolve(__dirname, '..', 'fonts');

fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Returns the duration of a video file in seconds.
 * @param {string} filePath
 * @returns {Promise<number>}
 */
function getVideoDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration ?? 0);
    });
  });
}

/**
 * Scale/pad/treat a single clip and write to outputPath.
 * @param {string}      inputPath
 * @param {string|null} treatmentFilter   — FFmpeg vf filter string from template treatment (or null)
 * @param {string|null} clipEffectFilter  — FFmpeg vf filter chain from effectsLibrary (or null)
 * @param {{ width:number, height:number, fps:number }} format
 * @param {string}      outputPath
 * @param {{ trimStart:number, trimEnd:number }|null} [trimRange] — server-side trim fallback
 * @returns {Promise<void>}
 */
function treatClip(inputPath, treatmentFilter, clipEffectFilter, format, outputPath, trimRange = null) {
  return new Promise((resolve, reject) => {
    const scaleFilter =
      `scale=${format.width}:${format.height}:force_original_aspect_ratio=decrease,` +
      `pad=${format.width}:${format.height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
      `setsar=1,format=yuv420p`;

    // Treatment comes from the template slot definition; effects are user-selected
    const vfParts = [scaleFilter, treatmentFilter, clipEffectFilter].filter(Boolean);
    const vf      = vfParts.join(',');

    const cmd = ffmpeg(inputPath);

    // Apply trim via fast input seek when FFmpeg.wasm wasn't available client-side
    if (trimRange && trimRange.trimStart != null && trimRange.trimEnd != null) {
      cmd.seekInput(trimRange.trimStart);
      cmd.inputOptions(['-to', String(trimRange.trimEnd)]);
    }

    cmd
      .outputOptions([
        `-vf ${vf}`,
        '-c:v libx264',
        '-preset fast',
        '-crf 22',
        `-r ${format.fps}`,
        '-an',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

/**
 * Join clips using xfade transitions (one transition ID applied to all gaps).
 * Falls back to concatClips internally if all transitions are hard_cut.
 *
 * @param {string[]} treatedPaths
 * @param {number[]} durations      — duration in seconds for each clip
 * @param {string[]} transIds       — transition ID per gap (length = N - 1)
 * @param {{ width:number, height:number, fps:number }} format
 * @param {string}   outputPath
 * @returns {Promise<void>}
 */
function xfadeClips(treatedPaths, durations, transIds, format, outputPath) {
  const n = treatedPaths.length;
  if (n < 2) {
    fs.copyFileSync(treatedPaths[0], outputPath);
    return Promise.resolve();
  }

  // Use 'v' as the inputPrefix so labels become [v_0], [v_1], etc.
  const xfFilterStrs = buildXfadeFilters(n, durations, transIds, 'v');

  // If no xfade filters were produced (all hard_cut), fall back to concat
  if (xfFilterStrs.length === 0) {
    return concatClips(treatedPaths, format, outputPath);
  }

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    for (const p of treatedPaths) cmd.input(p);

    // Normalise each input to a consistently-labelled stream
    const normalise = treatedPaths.map((_, i) =>
      `[${i}:v]setsar=1,format=yuv420p[v_${i}]`
    );

    const complexFilter = [...normalise, ...xfFilterStrs].join(';');

    cmd
      .complexFilter(complexFilter)
      .outputOptions([
        '-map [vout]',
        '-c:v libx264',
        '-preset fast',
        '-crf 22',
        `-r ${format.fps}`,
        '-an',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

/**
 * Concatenate multiple treated clips into one video using a concat filtergraph.
 * @param {string[]} treatedPaths
 * @param {{ width:number, height:number, fps:number }} format
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
function concatClips(treatedPaths, format, outputPath) {
  return new Promise((resolve, reject) => {
    const n = treatedPaths.length;
    const cmd = ffmpeg();

    for (const p of treatedPaths) {
      cmd.input(p);
    }

    // Build per-clip normalisation + concat filter
    const perClip = treatedPaths
      .map((_, i) => `[${i}:v]setsar=1,format=yuv420p[v${i}]`)
      .join(';');

    const concatInputs = treatedPaths.map((_, i) => `[v${i}]`).join('');
    const complexFilter = `${perClip};${concatInputs}concat=n=${n}:v=1:a=0[vout]`;

    cmd
      .complexFilter(complexFilter)
      .outputOptions([
        '-map [vout]',
        '-c:v libx264',
        '-preset fast',
        '-crf 22',
        `-r ${format.fps}`,
        '-an',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

/**
 * Overlay word-by-word drawtext captions onto a video.
 * If words is null/empty, just copies the file.
 * @param {string} inputPath
 * @param {Array<{word:string,startTime:number}>|null} words
 * @param {Array<{color:string,strokeColor:string}>} captionStyles
 * @param {string} fontPath
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
function applyCaptions(inputPath, words, captionStyles, fontPath, outputPath) {
  if (!words || words.length === 0) {
    fs.copyFileSync(inputPath, outputPath);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const drawtextChain = buildDrawtextFilterChain(words, captionStyles, fontPath);

    ffmpeg(inputPath)
      .outputOptions([
        `-vf ${drawtextChain}`,
        '-c:v libx264',
        '-preset fast',
        '-crf 22',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

/**
 * Mix background audio into the video, trimmed and faded to match video duration.
 * @param {string} videoPath
 * @param {string} audioPath
 * @param {number} videoDuration  — seconds
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
function mixAudio(videoPath, audioPath, videoDuration, outputPath) {
  return new Promise((resolve, reject) => {
    const fadeStart = Math.max(0, videoDuration - 1.5).toFixed(3);
    const audioFilter =
      `[1:a]atrim=end=${videoDuration.toFixed(3)},` +
      `afade=t=out:st=${fadeStart}:d=1.5,` +
      `asetpts=PTS-STARTPTS[aout]`;

    ffmpeg(videoPath)
      .input(audioPath)
      .complexFilter(audioFilter)
      .outputOptions([
        '-map 0:v',
        '-map [aout]',
        '-c:v copy',
        '-c:a aac',
        '-b:a 192k',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Render a template with the given clips and settings.
 *
 * @param {{
 *   templateId:      string,
 *   template:        object,
 *   clipFiles:       string[],
 *   treatments:      string[],
 *   clipEffects:     string[][]   — per-clip effect ID arrays (optional)
 *   transitions:     string[]     — transition IDs; first value applied to all gaps (optional)
 *   globalEffects:   string[]     — global effect IDs applied to the final render (optional)
 *   captionMode:     'none'|'manual'|'auto',
 *   manualCaptions:  Array<{word:string,startTime:number}>,
 *   audioPath:       string|null,
 *   onProgress:      ((msg:string) => void)|undefined,
 * }} opts
 *
 * @returns {Promise<{ outputPath:string, filename:string, duration:number, clipCount:number }>}
 */
export async function renderTemplate({
  templateId,
  template,
  clipFiles,
  treatments,
  clipEffects   = [],
  transitions   = [],
  globalEffects = [],
  captionMode,
  manualCaptions,
  audioPath,
  onProgress,
  trimRanges = null,  // Array<{ trimStart, trimEnd }|null> | null — server-side trim fallback
}) {
  // 1. Create temp directory
  const tempDir = path.join(os.tmpdir(), `tr_${Date.now()}`);
  fs.mkdirSync(tempDir);

  try {
    // 2. Treat clips sequentially (treatment + per-clip effects)
    const treatedPaths = [];
    for (let i = 0; i < clipFiles.length; i++) {
      onProgress?.(`Treating clip ${i + 1} of ${clipFiles.length}`);
      const treatment       = getTreatmentFilter(treatments[i] ?? 'none');
      const perClipEffects  = Array.isArray(clipEffects[i]) ? clipEffects[i] : [];
      const clipEffectFilter = buildClipFilterChain(perClipEffects);  // null if none
      const trimRange       = trimRanges?.[i] ?? null;
      const treatedPath     = path.join(tempDir, `treated_${i}.mp4`);
      await treatClip(clipFiles[i], treatment, clipEffectFilter, template.format, treatedPath, trimRange);
      treatedPaths.push(treatedPath);
    }

    // 3. Join clips — use xfade if a non-hard_cut transition was requested
    onProgress?.('Joining clips…');
    const concatPath = path.join(tempDir, 'concat.mp4');

    const userTransition = transitions?.[0] ?? null;
    const useXfade = userTransition && userTransition !== 'hard_cut';

    if (useXfade && treatedPaths.length > 1) {
      const clipDurations = await Promise.all(treatedPaths.map(getVideoDuration));
      const transIds      = Array.from({ length: treatedPaths.length - 1 }, () => userTransition);
      try {
        await xfadeClips(treatedPaths, clipDurations, transIds, template.format, concatPath);
      } catch (xErr) {
        console.warn('[renderer] xfade failed, falling back to concat:', xErr.message);
        await concatClips(treatedPaths, template.format, concatPath);
      }
    } else {
      await concatClips(treatedPaths, template.format, concatPath);
    }

    // 4. Get duration & build captions
    onProgress?.('Analyzing captions…');
    const duration = await getVideoDuration(concatPath);
    const words = await buildCaptions(captionMode, treatedPaths, manualCaptions);

    // 5. Apply captions
    onProgress?.('Applying captions…');
    const fontPath = path.join(FONTS_DIR, 'Anton-Regular.ttf');
    const captionedPath = path.join(tempDir, 'captioned.mp4');
    await applyCaptions(concatPath, words, template.captionStyles, fontPath, captionedPath);

    // 5b. Apply global effects (fade-in, fade-out, color pop, etc.)
    let preAudioPath = captionedPath;
    if (globalEffects.length > 0) {
      const globalFilterStr = buildGlobalFilterChain(globalEffects, duration);
      if (globalFilterStr) {
        onProgress?.('Applying global effects…');
        const globalFxPath = path.join(tempDir, 'global_fx.mp4');
        try {
          await applyFilterToVideo(ffmpeg, captionedPath, globalFilterStr, globalFxPath);
          preAudioPath = globalFxPath;
        } catch (fxErr) {
          console.warn('[renderer] Global effects failed, skipping:', fxErr.message);
        }
      }
    }

    // 6. Mix audio / finalize
    onProgress?.('Mixing audio…');
    const outputFilename = `template_${templateId}_${Date.now()}.mp4`;
    const finalOutput    = path.join(OUTPUTS_DIR, outputFilename);

    if (audioPath) {
      await mixAudio(preAudioPath, audioPath, duration, finalOutput);
    } else {
      fs.copyFileSync(preAudioPath, finalOutput);
    }

    return {
      outputPath: finalOutput,
      filename:   outputFilename,
      duration,
      clipCount:  clipFiles.length,
    };

  } finally {
    // Clean up temp directory best-effort
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
