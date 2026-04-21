/**
 * captionEngine.js
 * Handles caption generation (via Whisper or manual) and FFmpeg drawtext filter building.
 */

import fs from 'node:fs';

// ── Whisper dynamic import ───────────────────────────────────────────────────

let whisperNode = null;
try {
  const mod = await import('whisper-node');
  whisperNode = mod.default ?? mod.whisper ?? mod;
} catch {
  // whisper-node not installed — auto caption mode will throw a helpful error
}

// ── ffprobe helper ───────────────────────────────────────────────────────────

async function getClipDuration(filePath) {
  let ffmpeg;
  try {
    const [ffmpegMod, ffmpegInstaller] = await Promise.all([
      import('fluent-ffmpeg'),
      import('@ffmpeg-installer/ffmpeg'),
    ]);
    ffmpeg = ffmpegMod.default;
    ffmpeg.setFfmpegPath(ffmpegInstaller.default.path);
  } catch {
    throw new Error('fluent-ffmpeg not available for ffprobe');
  }

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration ?? 0);
    });
  });
}

// ── Text escaping for FFmpeg drawtext ────────────────────────────────────────

function escapeDrawtext(text) {
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "\\\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,');
}

// ── Exports ──────────────────────────────────────────────────────────────────

/**
 * buildCaptions(mode, clipPaths, manualCaptions)
 *
 * Returns an array of { word, startTime } objects, or null for 'none' mode.
 *
 * @param {'auto'|'manual'|'none'} mode
 * @param {string[]} clipPaths   — absolute paths to treated video clips
 * @param {Array}    manualCaptions — array of { word, startTime } (used in 'manual' mode)
 * @returns {Promise<Array<{word:string, startTime:number}>|null>}
 */
export async function buildCaptions(mode, clipPaths, manualCaptions) {
  if (mode === 'none') {
    return null;
  }

  if (mode === 'manual') {
    if (!Array.isArray(manualCaptions) || manualCaptions.length === 0) {
      return null;
    }
    // Validate: each entry must have word (string) and startTime (number)
    for (const entry of manualCaptions) {
      if (typeof entry.word !== 'string' || typeof entry.startTime !== 'number') {
        throw new Error('Manual captions must be an array of { word: string, startTime: number }.');
      }
    }
    return manualCaptions;
  }

  if (mode === 'auto') {
    if (!whisperNode) {
      throw new Error(
        "Whisper not available — install whisper-node and run 'npx whisper-node download'"
      );
    }

    const allWords = [];
    let cumulativeDuration = 0;

    for (const clipPath of clipPaths) {
      let segments;
      try {
        const whisper = whisperNode;
        const result = await whisper(clipPath, {
          modelName: 'base.en',
          whisperOptions: { word_timestamps: true },
        });
        // result should be array of segments with words
        segments = Array.isArray(result) ? result : [];
      } catch (err) {
        // If whisper fails on a clip, skip it gracefully
        console.warn(`Whisper failed on ${clipPath}:`, err.message);
        segments = [];
      }

      for (const segment of segments) {
        const words = segment.words ?? [];
        for (const w of words) {
          allWords.push({
            word:      w.word ?? w.text ?? '',
            startTime: (w.start ?? 0) + cumulativeDuration,
          });
        }
      }

      // Advance cumulative duration by this clip's duration
      try {
        const dur = await getClipDuration(clipPath);
        cumulativeDuration += dur;
      } catch {
        // If we can't probe duration, just continue
      }
    }

    return allWords;
  }

  throw new Error(`Unknown caption mode: ${mode}`);
}

/**
 * buildDrawtextFilterChain(words, captionStyles, fontPath)
 *
 * Builds a comma-joined FFmpeg drawtext filter string for word-by-word captions.
 *
 * @param {Array<{word:string, startTime:number}>} words
 * @param {Array<{color:string, strokeColor:string}>} captionStyles
 * @param {string|null} fontPath — absolute path to a .ttf font file
 * @returns {string}
 */
export function buildDrawtextFilterChain(words, captionStyles, fontPath) {
  if (!words || words.length === 0) return '';

  // Resolve fontfile directive (if font exists)
  let fontfileDirective = '';
  if (fontPath) {
    const normalizedFontPath = fontPath.replace(/\\/g, '/');
    if (fs.existsSync(fontPath)) {
      fontfileDirective = `fontfile='${normalizedFontPath}':`;
    }
  }

  const filters = words.map((w, i) => {
    const style     = captionStyles[i % 2];
    const color     = style.color;
    const startTime = w.startTime.toFixed(3);
    const endTime   = i < words.length - 1
      ? words[i + 1].startTime.toFixed(3)
      : (w.startTime + 2).toFixed(3);

    const escapedWord = escapeDrawtext(w.word.trim());

    return (
      `drawtext=${fontfileDirective}` +
      `fontsize=72:` +
      `fontcolor=${color}:` +
      `borderw=4:bordercolor=black@0.6:` +
      `x=(w-text_w)/2:y=h*0.45:` +
      `text='${escapedWord}':` +
      `enable='between(t\\,${startTime}\\,${endTime})'`
    );
  });

  return filters.join(',');
}
