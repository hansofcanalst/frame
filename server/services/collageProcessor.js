/**
 * collageProcessor.js
 * Assembles multiple photos into a polished short-form video (Shorts/vertical format).
 *
 * Exports:
 *   buildCollageVideo(photos, audioPath, claudeInstructions) → { outputPath, filename, metadata }
 *   detectBPM(audioPath)                                     → beat interval in ms (or null)
 *   applyColorGrade(grade)                                   → ffmpeg filter string
 *   buildXfadeChain(photoCount, durations, transition, T)    → array of filter strings
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  buildClipFilterChain,
  buildXfadeFilters,
  buildGlobalFilterChain,
  applyFilterToVideo,
} from '../effectsProcessor.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const require     = createRequire(import.meta.url);
const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const OUTPUTS_DIR = path.resolve(__dirname, '..', 'outputs');

// ── Color grade mappings ────────────────────────────────────────────────────

const COLOR_GRADE_FILTERS = {
  // Use only eq+hue — universally available in all FFmpeg builds
  cinematic:       'eq=brightness=-0.05:contrast=1.2:saturation=0.85',
  warm:            'eq=brightness=0.04:contrast=1.05:saturation=1.35',
  cool:            'eq=brightness=-0.04:contrast=1.05:saturation=0.8',
  vibrant:         'eq=saturation=1.6:contrast=1.1',
  muted:           'eq=saturation=0.6:contrast=0.95',
  black_and_white: 'hue=s=0,eq=contrast=1.15',
};

// xfade transition name mappings (Claude key → FFmpeg name)
const XFADE_TRANSITIONS = {
  fade:     'fade',
  flash:    'fadewhite',
  zoom_in:  'zoomin',
  zoom_out: 'fadeblack',
  slide:    'slideleft',
};

const TRANSITION_DURATION = 0.5; // seconds of xfade overlap
const OUTPUT_W = 1080;
const OUTPUT_H = 1920;

// ── 1. detectBPM ────────────────────────────────────────────────────────────

/**
 * Decode audio with FFmpeg → Float32Array → music-tempo BPM analysis.
 * Returns beat interval in ms, or null if detection fails.
 */
export async function detectBPM(audioPath) {
  try {
    // Decode first 30 s to mono f32le PCM
    const result = spawnSync(
      ffmpegInstaller.path,
      ['-i', audioPath, '-t', '30', '-ac', '1', '-ar', '44100', '-f', 'f32le', '-'],
      { maxBuffer: 200 * 1024 * 1024 }
    );

    if (result.error || (result.status !== 0 && !result.stdout?.length)) {
      throw new Error(result.stderr?.toString().slice(-200) || 'ffmpeg decode failed');
    }

    let MusicTempo = require('music-tempo');
    if (MusicTempo.default) MusicTempo = MusicTempo.default; // handle ESM wrapper

    const audioData = new Float32Array(
      result.stdout.buffer,
      result.stdout.byteOffset,
      result.stdout.byteLength / 4
    );

    const mt  = new MusicTempo(audioData);
    const bpm = mt.tempo;

    if (!bpm || bpm < 40 || bpm > 250) throw new Error(`Unreliable BPM: ${bpm}`);

    const intervalMs = 60000 / bpm;
    console.log(`[collage] BPM: ${bpm.toFixed(1)} → ${intervalMs.toFixed(0)} ms/beat`);
    return intervalMs;
  } catch (err) {
    console.warn('[collage] BPM detection failed:', err.message, '— falling back to Claude duration');
    return null;
  }
}

// ── 2. applyColorGrade ──────────────────────────────────────────────────────

/** Maps a Claude color_grade string to the corresponding ffmpeg filter chain. */
export function applyColorGrade(grade) {
  return COLOR_GRADE_FILTERS[grade] ?? COLOR_GRADE_FILTERS.cinematic;
}

// ── 3. buildXfadeChain ──────────────────────────────────────────────────────

/**
 * Generate the sequence of xfade filter strings for N photos.
 *
 * Offset formula: offset[i] = sum(durations[0..i]) - (i+1) * T
 * Simplified iteratively: accumulate += (durations[i] - T) each step.
 *
 * @param {number}   photoCount
 * @param {number[]} durations        per-photo display duration in seconds
 * @param {string}   transition       Claude transition key (fade | flash | zoom_in | ...)
 * @param {number}   [T]             transition overlap in seconds (default 0.5)
 * @returns {string[]}
 */
export function buildXfadeChain(photoCount, durations, transition, T = TRANSITION_DURATION) {
  const xfName = XFADE_TRANSITIONS[transition] ?? 'fade';
  const filters = [];
  let currentLabel    = '[scaled_0]';
  let offsetAccum     = 0;

  for (let i = 0; i < photoCount - 1; i++) {
    offsetAccum    += durations[i] - T;
    const outLabel  = i === photoCount - 2 ? '[vout]' : `[xf${i}]`;
    const nextLabel = `[scaled_${i + 1}]`;

    filters.push(
      `${currentLabel}${nextLabel}xfade=transition=${xfName}:duration=${T}:offset=${Math.max(0, offsetAccum).toFixed(3)}${outLabel}`
    );
    currentLabel = outLabel;
  }

  return filters;
}

// ── 4. buildCollageVideo ────────────────────────────────────────────────────

/**
 * Main orchestrator: reorder photos, determine timing, grade, and encode.
 *
 * @param {string[]}    photos           absolute paths to uploaded images
 * @param {string|null} audioPath        absolute path to audio file, or null
 * @param {object}      claudeInstructions JSON from analyzeCollageWithClaude
 * @param {object}      [options]
 * @param {number|null} [options.audioTrimStart]  seconds into the audio track to start (default 0)
 * @param {number|null} [options.targetDuration]  desired total video duration in seconds (overrides BPM/Claude timing)
 * @param {string[]}    [options.clipEffects]      effect IDs applied to every photo (e.g. ['cinematic','grain'])
 * @param {string[]}    [options.transitions]      transition IDs per gap; first value is used for all gaps
 * @param {string[]}    [options.globalEffects]    global effect IDs applied to the final render
 * @returns {{ outputPath, filename, metadata }}
 */
export async function buildCollageVideo(photos, audioPath, claudeInstructions, options = {}) {
  if (photos.length < 2) throw new Error('At least 2 photos are required.');

  const {
    audioTrimStart  = null,
    targetDuration  = null,
    clipEffects     = [],
    transitions     = [],
    globalEffects   = [],
  } = options;

  const {
    overall_mood             = 'neutral',
    color_grade              = 'cinematic',
    suggested_duration_per_photo = 2.5,
    transition_style         = 'fade',
    suggested_order          = photos.map((_, i) => i),
  } = claudeInstructions;

  // Reorder — validate indices, fall back to original order on bad data
  const validOrder = suggested_order.filter(i => Number.isInteger(i) && i >= 0 && i < photos.length);
  const orderedPhotos = validOrder.length === photos.length
    ? validOrder.map(i => photos[i])
    : [...photos];

  const N = orderedPhotos.length;

  // Duration per photo — priority: targetDuration > BPM > Claude suggestion
  let photoDuration;

  if (targetDuration && targetDuration > 0) {
    // User-specified total duration: divide evenly, clamped to 1.0–6.0 s per photo
    photoDuration = Math.max(1.0, Math.min(6.0, targetDuration / N));
    console.log(`[collage] targetDuration=${targetDuration}s → ${photoDuration.toFixed(2)}s/photo`);
  } else {
    // Fall back to Claude suggestion, then BPM detection
    photoDuration = Math.max(1.5, Math.min(4.0, Number(suggested_duration_per_photo) || 2.5));

    if (audioPath) {
      const beatMs = await detectBPM(audioPath);
      if (beatMs !== null) {
        // 2 beats per photo, clamped to 1.5–4 s
        photoDuration = Math.max(1.5, Math.min(4.0, (beatMs * 2) / 1000));
      }
    }
  }

  const durations = orderedPhotos.map(() => photoDuration);

  const colorFilter     = applyColorGrade(color_grade);
  const clipEffectFilter = buildClipFilterChain(clipEffects);  // null if empty

  // ── Determine which transition to use ──────────────────────────────────────
  // Honour user-picked transition (first element applied to all gaps).
  // Fall back to Claude's suggestion, then to the legacy buildXfadeChain.
  const userTransition   = transitions?.[0] ?? null; // single ID for all gaps
  const effectiveTransId = userTransition || transition_style;

  // Build the per-gap transIds array (uniform: same ID for every gap)
  const transIds = Array.from({ length: N - 1 }, () => effectiveTransId);

  // Decide path: hard_cut → straight to concat; otherwise xfade with fallback
  const isHardCut = effectiveTransId === 'hard_cut';

  // Total duration differs based on path:
  //  xfade path:    each pair overlaps by TRANSITION_DURATION
  //  concat/cut:    simple sum (no overlap)
  const totalDuration = isHardCut
    ? durations.reduce((a, b) => a + b, 0)
    : durations.reduce((a, b) => a + b, 0) - (N - 1) * TRANSITION_DURATION;

  const outputFilename = `collage_${Date.now()}.mp4`;
  const outputPath     = path.join(OUTPUTS_DIR, outputFilename);

  if (isHardCut) {
    // No transitions — concat is correct and faster
    await runConcatFFmpeg({ orderedPhotos, photoDuration, audioPath, audioTrimStart, colorFilter, clipEffectFilter, outputPath });
  } else {
    // Build xfade chain using effectsProcessor (per-gap, honours safe flag)
    const xfadeFilters = buildXfadeFilters(N, durations, transIds);

    // Attempt 1: requested transition
    let xfadeOk = false;
    try {
      await runCollageFFmpeg({ orderedPhotos, durations, audioPath, audioTrimStart, colorFilter, clipEffectFilter, xfadeFilters, totalDuration, outputPath });
      xfadeOk = true;
    } catch (err) {
      console.warn(`[collage] xfade "${effectiveTransId}" failed:`, err.message);
    }

    // Attempt 2: plain fade xfade fallback
    if (!xfadeOk && effectiveTransId !== 'smooth_fade') {
      try {
        console.warn('[collage] Retrying with smooth_fade transition…');
        const fallbackFilters = buildXfadeFilters(N, durations, Array(N - 1).fill('smooth_fade'));
        await runCollageFFmpeg({ orderedPhotos, durations, audioPath, audioTrimStart, colorFilter, clipEffectFilter, xfadeFilters: fallbackFilters, totalDuration, outputPath });
        xfadeOk = true;
      } catch (err2) {
        console.warn('[collage] smooth_fade also failed:', err2.message);
      }
    }

    // Attempt 3: hard concat — universally supported
    if (!xfadeOk) {
      console.warn('[collage] Falling back to concat (no transitions)…');
      await runConcatFFmpeg({ orderedPhotos, photoDuration, audioPath, audioTrimStart, colorFilter, clipEffectFilter, outputPath });
    }
  }

  // ── Global effects post-processing ─────────────────────────────────────────
  if (globalEffects.length > 0) {
    const globalFilterStr = buildGlobalFilterChain(globalEffects, totalDuration);
    if (globalFilterStr) {
      console.log('[collage] Applying global effects:', globalFilterStr);
      const tempFxPath = outputPath.replace('.mp4', '_gfx.mp4');
      try {
        await applyFilterToVideo(ffmpeg, outputPath, globalFilterStr, tempFxPath);
        fs.renameSync(tempFxPath, outputPath);
      } catch (fxErr) {
        console.warn('[collage] Global effects failed, keeping original:', fxErr.message);
        if (fs.existsSync(tempFxPath)) fs.unlinkSync(tempFxPath);
      }
    }
  }

  return {
    outputPath,
    filename: outputFilename,
    metadata: {
      mood:       overall_mood,
      colorGrade: color_grade,
      photoCount: N,
      duration:   Math.round(totalDuration * 10) / 10,
    },
  };
}

// ── Internal FFmpeg runner ──────────────────────────────────────────────────

function runCollageFFmpeg({ orderedPhotos, durations, audioPath, audioTrimStart, colorFilter, clipEffectFilter, xfadeFilters, totalDuration, outputPath }) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    const N   = orderedPhotos.length;

    // ── Inputs ──
    // Each photo: loop=1 so a static image becomes a video stream, duration = photo time + overlap buffer
    // Use -r (not -framerate) for maximum FFmpeg compat across versions
    orderedPhotos.forEach((photoPath, i) => {
      cmd.input(photoPath)
         .inputOptions(['-loop', '1', '-r', '30', '-t', String(durations[i] + TRANSITION_DURATION)]);
    });

    if (audioPath) cmd.input(audioPath);

    // ── Complex filtergraph ──
    // Part 1: scale each photo to 1080x1920 (letterbox / pillarbox) + color grade
    const perPhotoFilters = orderedPhotos.map((_, i) => {
      const base =
        `[${i}:v]` +
        `scale=${OUTPUT_W}:${OUTPUT_H}:force_original_aspect_ratio=decrease,` +
        `pad=${OUTPUT_W}:${OUTPUT_H}:(ow-iw)/2:(oh-ih)/2:color=black,` +
        `setsar=1`;
      const grade  = colorFilter      ? `,${colorFilter}`      : '';
      const fxChain = clipEffectFilter ? `,${clipEffectFilter}` : '';
      // format=yuv420p ensures all streams share the same pixel format before xfade
      return `${base}${grade}${fxChain},format=yuv420p[scaled_${i}]`;
    });

    // Part 2: xfade chain (connects [scaled_0]…[scaled_N-1] → [vout])
    // Edge case: only 1 photo — rename label directly (shouldn't happen due to validation)
    let videoFilters;
    if (N === 1) {
      videoFilters = [perPhotoFilters[0].replace('[scaled_0]', '[vout]')];
    } else {
      videoFilters = [...perPhotoFilters, ...xfadeFilters];
    }

    // Part 3: optional audio trim + fade-out
    // Order matters:
    //   1. atrim  — cut the desired window out of the audio file
    //   2. asetpts — reset timestamps to 0 so afade sees t=0..totalDuration
    //   3. afade  — fade-out relative to the reset timeline (st = totalDuration - 1.5)
    // Putting asetpts AFTER afade caused afade to see original timestamps (e.g. 43–58 s)
    // and silence the entire track because st=13.5 was already in the past.
    let audioFilter = null;
    if (audioPath) {
      const audioIdx    = N;
      const start       = audioTrimStart != null ? Number(audioTrimStart) : 0;
      const end         = start + totalDuration;
      const fadeAtReset = Math.max(0, totalDuration - 1.5); // relative to reset t=0
      audioFilter =
        `[${audioIdx}:a]` +
        `atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)},` +
        `asetpts=PTS-STARTPTS,` +
        `afade=t=out:st=${fadeAtReset.toFixed(3)}:d=1.5` +
        `[aout]`;
    }

    const complexFilter = [...videoFilters, ...(audioFilter ? [audioFilter] : [])].join(';');

    // ── Output options ──
    const mapArgs = ['-map', '[vout]'];
    if (audioPath) mapArgs.push('-map', '[aout]');

    cmd
      .outputOptions([
        '-filter_complex', complexFilter,
        ...mapArgs,
        '-c:v',        'libx264',
        '-preset',     'fast',
        '-crf',        '22',
        '-pix_fmt',    'yuv420p',
        '-movflags',   '+faststart',
        ...(audioPath ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']),
      ])
      .output(outputPath)
      .on('start', cmdLine =>
        console.log('[collage] FFmpeg:', cmdLine.slice(0, 140) + '…'))
      .on('error', (err, _out, stderr) => {
        console.error('[collage] FFmpeg error:', err.message);
        if (stderr) console.error('[collage] stderr (last 1000):', stderr.slice(-1000));
        reject(err);
      })
      .on('end', resolve)
      .run();
  });
}

// ── Concat fallback (hard cuts, no xfade — universally supported) ────────────

function runConcatFFmpeg({ orderedPhotos, photoDuration, audioPath, audioTrimStart, colorFilter, clipEffectFilter, outputPath }) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    const N   = orderedPhotos.length;

    orderedPhotos.forEach((photoPath) => {
      cmd.input(photoPath)
         .inputOptions(['-loop', '1', '-r', '30', '-t', String(photoDuration)]);
    });
    if (audioPath) cmd.input(audioPath);

    const perPhotoFilters = orderedPhotos.map((_, i) => {
      const base =
        `[${i}:v]` +
        `scale=${OUTPUT_W}:${OUTPUT_H}:force_original_aspect_ratio=decrease,` +
        `pad=${OUTPUT_W}:${OUTPUT_H}:(ow-iw)/2:(oh-ih)/2:color=black,` +
        `setsar=1`;
      const grade   = colorFilter      ? `,${colorFilter}`      : '';
      const fxChain = clipEffectFilter ? `,${clipEffectFilter}` : '';
      return `${base}${grade}${fxChain},format=yuv420p[v${i}]`;
    });

    const inputLabels  = Array.from({ length: N }, (_, i) => `[v${i}]`).join('');
    const concatFilter = `${inputLabels}concat=n=${N}:v=1:a=0[vout]`;

    const totalDuration = photoDuration * N;
    let audioFilter = null;
    if (audioPath) {
      const start       = audioTrimStart != null ? Number(audioTrimStart) : 0;
      const end         = start + totalDuration;
      const fadeAtReset = Math.max(0, totalDuration - 1.5); // relative to reset t=0
      audioFilter =
        `[${N}:a]` +
        `atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)},` +
        `asetpts=PTS-STARTPTS,` +
        `afade=t=out:st=${fadeAtReset.toFixed(3)}:d=1.5` +
        `[aout]`;
    }

    const complexFilter = [...perPhotoFilters, concatFilter, ...(audioFilter ? [audioFilter] : [])].join(';');
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
        '-movflags', '+faststart',
        ...(audioPath ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']),
      ])
      .output(outputPath)
      .on('start', cmdLine =>
        console.log('[collage] FFmpeg (concat):', cmdLine.slice(0, 140) + '…'))
      .on('error', (err, _out, stderr) => {
        console.error('[collage] FFmpeg concat error:', err.message);
        if (stderr) console.error('[collage] stderr:', stderr.slice(-1000));
        reject(err);
      })
      .on('end', resolve)
      .run();
  });
}
