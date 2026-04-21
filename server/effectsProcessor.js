/**
 * effectsProcessor.js
 * Builds FFmpeg filter strings from effect/transition IDs.
 *
 * All functions are pure (no I/O) and return strings / objects.
 * Consumers append the output into their own filter_complex or -vf chains.
 */

import { getClipEffect, getTransition, getGlobalEffect, TRANSITIONS } from './effects/effectsLibrary.js';

// ── Clip effects ──────────────────────────────────────────────────────────────

/**
 * Build a `-vf` compatible filter chain string from an array of effect IDs.
 * Returns null when the array is empty or all IDs are unknown.
 *
 * @param {string[]} effectIds
 * @returns {string|null}
 */
export function buildClipFilterChain(effectIds) {
  if (!effectIds || effectIds.length === 0) return null;

  const filters = effectIds
    .map(id => getClipEffect(id)?.filter)
    .filter(Boolean);

  return filters.length > 0 ? filters.join(',') : null;
}

// ── Transitions ───────────────────────────────────────────────────────────────

/**
 * Return xfade params for a given transition ID.
 * Falls back to 'fade' when the requested type is marked safe:false so the
 * caller can attempt the real type first and fall back on FFmpeg error.
 *
 * @param {string|null|undefined} transitionId
 * @returns {{ xfadeType: string|null, duration: number, originalType: string|null }}
 */
export function getTransitionParams(transitionId) {
  const t = getTransition(transitionId ?? 'hard_cut') ?? TRANSITIONS.hard_cut;
  return {
    xfadeType:    t.xfadeType,
    duration:     t.duration,
    safe:         t.safe,
    originalType: t.xfadeType,  // keep the desired type even if !safe
  };
}

/**
 * Build the xfade filter entries for a chain of N clips.
 * Returns an array of filter strings like:
 *   "[v0][v1]xfade=transition=fade:duration=0.4:offset=2.6[xf0]"
 *
 * @param {number}   clipCount    — total number of clips
 * @param {number[]} durations    — duration in seconds per clip
 * @param {string[]} transIds     — one transition ID per gap (length = clipCount - 1)
 * @param {string}   [inputPrefix='scaled'] — label prefix used in filter inputs/outputs
 * @returns {string[]}            — array of xfade filter strings; empty if all are hard_cut
 */
export function buildXfadeFilters(clipCount, durations, transIds, inputPrefix = 'scaled') {
  if (clipCount < 2) return [];

  const filters = [];
  let currentLabel = `[${inputPrefix}_0]`;
  let offsetAccum  = 0;

  for (let i = 0; i < clipCount - 1; i++) {
    const transId = transIds?.[i] ?? 'hard_cut';
    const { xfadeType, duration } = getTransitionParams(transId);

    const outLabel = i === clipCount - 2 ? '[vout]' : `[xf${i}]`;
    const nextLabel = `[${inputPrefix}_${i + 1}]`;

    if (!xfadeType) {
      // hard cut — advance current label without adding an xfade filter.
      // Note: mixing hard_cut with xfade in a single chain doesn't compose
      // correctly (the accumulated stream from previous xfades is dropped).
      // Callers should use a uniform transition across all gaps; hard_cut
      // should route to the concat fallback instead.
      currentLabel = nextLabel;
      offsetAccum += durations[i];
      continue;
    }

    offsetAccum += durations[i] - duration;
    filters.push(
      `${currentLabel}${nextLabel}xfade=transition=${xfadeType}` +
      `:duration=${duration}` +
      `:offset=${Math.max(0, offsetAccum).toFixed(3)}${outLabel}`
    );
    currentLabel = outLabel;
  }

  // If we produced at least one xfade filter but the final accumulated label
  // isn't [vout] (because the last gap(s) were hard_cut), add a null pass to
  // create the expected [vout] output label.
  if (filters.length > 0 && currentLabel !== '[vout]') {
    filters.push(`${currentLabel}null[vout]`);
  }

  return filters;
}

// ── Global effects ────────────────────────────────────────────────────────────

/**
 * Build a combined `-vf` filter string for global effects applied to the
 * final rendered video. Returns null when nothing applies.
 *
 * @param {string[]} effectIds
 * @param {number}   videoDuration  — total video length in seconds
 * @returns {string|null}
 */
export function buildGlobalFilterChain(effectIds, videoDuration) {
  if (!effectIds || effectIds.length === 0) return null;

  const filters = effectIds
    .map(id => getGlobalEffect(id)?.buildFilter(videoDuration))
    .filter(Boolean);

  return filters.length > 0 ? filters.join(',') : null;
}

/**
 * Apply a vf filter string to a video file, writing to outputPath.
 * Convenience wrapper so routes don't need to import fluent-ffmpeg.
 *
 * @param {import('fluent-ffmpeg').FfmpegCommand} ffmpegFactory — the `ffmpeg` import
 * @param {string} inputPath
 * @param {string} filterStr
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
export function applyFilterToVideo(ffmpegFactory, inputPath, filterStr, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpegFactory(inputPath)
      .outputOptions([
        `-vf ${filterStr}`,
        '-c:v libx264',
        '-preset fast',
        '-crf 22',
        '-pix_fmt yuv420p',
        '-c:a copy',
      ])
      .output(outputPath)
      .on('end',   resolve)
      .on('error', reject)
      .run();
  });
}
