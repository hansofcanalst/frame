/**
 * editRunner.js
 * Maps Claude's structured edit JSON to the appropriate processor functions,
 * runs all edits in parallel, and returns result metadata for the frontend.
 *
 * Input (Claude JSON):
 *   Array of { name, description, style, operations }
 *
 * Output:
 *   Array of { name, description, outputPath, filename } | { name, error }
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

// Video processors
import {
  colorGrade    as videoColorGrade,
  blackAndWhite as videoBlackAndWhite,
  warmTone      as videoWarmTone,
  coolTone      as videoCoolTone,
  applyVignette as videoVignette,
  cinematicCrop as videoCinematicCrop,
  filmGrain     as videoFilmGrain,
  speedRamp     as videoSpeedRamp,
  textOverlay   as videoTextOverlay,
  extractThumbnail,
  generateVideoThumbnail,
} from './videoProcessor.js';

// Image processors
import {
  colorGrade    as imgColorGrade,
  blackAndWhite as imgBlackAndWhite,
  warmTone      as imgWarmTone,
  coolTone      as imgCoolTone,
  applyVignette as imgVignette,
  cinematicCrop as imgCinematicCrop,
  filmGrain     as imgFilmGrain,
  speedRamp     as imgSpeedRamp,    // gracefully falls back to warmTone
  textOverlay   as imgTextOverlay,
} from './imageProcessor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUTS_DIR = path.resolve(__dirname, '..', 'outputs');

// ── Style → processor dispatch ──────────────────────────────────────────────

const VIDEO_PROCESSORS = {
  colorGrade:    (inp, out, ops) => videoColorGrade(inp, out, ops),
  blackAndWhite: (inp, out)      => videoBlackAndWhite(inp, out),
  warmTone:      (inp, out)      => videoWarmTone(inp, out),
  coolTone:      (inp, out)      => videoCoolTone(inp, out),
  vignette:      (inp, out)      => videoVignette(inp, out),
  cinematicCrop: (inp, out)      => videoCinematicCrop(inp, out),
  filmGrain:     (inp, out, ops) => videoFilmGrain(inp, out, ops),
  speedRamp:     (inp, out, ops) => videoSpeedRamp(inp, out, ops),
  textOverlay:   (inp, out, ops) => videoTextOverlay(inp, out, ops),
};

const IMAGE_PROCESSORS = {
  colorGrade:    (inp, out, ops) => imgColorGrade(inp, out, ops),
  blackAndWhite: (inp, out)      => imgBlackAndWhite(inp, out),
  warmTone:      (inp, out)      => imgWarmTone(inp, out),
  coolTone:      (inp, out)      => imgCoolTone(inp, out),
  vignette:      (inp, out)      => imgVignette(inp, out),
  cinematicCrop: (inp, out)      => imgCinematicCrop(inp, out),
  filmGrain:     (inp, out, ops) => imgFilmGrain(inp, out, ops),
  speedRamp:     (inp, out)      => imgSpeedRamp(inp, out),   // no ops needed
  textOverlay:   (inp, out, ops) => imgTextOverlay(inp, out, ops),
};

// ── Input validation ────────────────────────────────────────────────────────

const VIDEO_EXT = /\.(mp4|mov|webm)$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png)$/i;

function detectType(filePath) {
  if (VIDEO_EXT.test(filePath)) return 'video';
  if (IMAGE_EXT.test(filePath)) return 'image';
  throw new Error(`Unsupported file type: ${path.extname(filePath)}`);
}

// ── Single-edit executor ────────────────────────────────────────────────────

async function runEdit(edit, inputPath, fileType, originalBasename) {
  const { name, description, style, operations } = edit;

  const processors = fileType === 'video' ? VIDEO_PROCESSORS : IMAGE_PROCESSORS;
  const processor  = processors[style] ?? processors.colorGrade;

  const ext        = fileType === 'video' ? 'mp4' : 'jpg';
  const safeName   = name.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 24);
  const filename   = `${originalBasename}_${safeName}_${uuidv4().slice(0, 8)}.${ext}`;
  const outputPath = path.join(OUTPUTS_DIR, filename);

  await processor(inputPath, outputPath, operations ?? {});

  // For videos, also generate a thumbnail
  let thumbFilename = null;
  if (fileType === 'video') {
    thumbFilename = filename.replace('.mp4', '_thumb.jpg');
    const thumbPath = path.join(OUTPUTS_DIR, thumbFilename);
    try {
      await generateVideoThumbnail(outputPath, thumbPath);
    } catch (e) {
      console.warn(`[editRunner] thumbnail failed for "${name}":`, e.message);
    }
  }

  return { name, description, style, outputPath, filename, thumbFilename };
}

// ── Main runner ─────────────────────────────────────────────────────────────

/**
 * Run all edits from Claude's JSON output in parallel.
 *
 * @param {Array<{ name, description, style, operations }>} edits  Claude output
 * @param {string} inputPath   Absolute path to the uploaded source file
 * @param {object} [opts]
 * @param {(result: object) => void} [opts.onEditDone]  Called as each edit finishes
 * @returns {Promise<Array>}  Array of result objects (success or error)
 */
export async function runEdits(edits, inputPath, { onEditDone } = {}) {
  const fileType = detectType(inputPath);
  const originalBasename = path.basename(inputPath, path.extname(inputPath)).slice(0, 20);

  const tasks = edits.map(async (edit) => {
    try {
      const result = await runEdit(edit, inputPath, fileType, originalBasename);
      console.log(`[editRunner] ✓ "${edit.name}" → ${result.filename}`);
      if (onEditDone) onEditDone({ ok: true, ...result });
      return { ok: true, ...result };
    } catch (err) {
      const errResult = {
        ok:          false,
        name:        edit.name,
        description: edit.description,
        style:       edit.style,
        error:       err.message,
      };
      console.error(`[editRunner] ✗ "${edit.name}":`, err.message);
      if (onEditDone) onEditDone(errResult);
      return errResult;
    }
  });

  // Run ALL edits concurrently; individual failures don't abort the batch
  return Promise.all(tasks);
}
