import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { analyzeWithClaude, analyzeCollageWithClaude } from '../services/claude.js';
import { buildCollageVideo } from '../services/collageProcessor.js';
import { runEdits } from '../services/editRunner.js';
import { extractThumbnail } from '../services/videoProcessor.js';
import { getAllTemplates, getTemplateById, writeTemplate, removeTemplate } from '../templateRegistry.js';
import { renderTemplate }    from '../services/templateRenderer.js';
import { renderPhotoWall }   from '../renderers/photoWallRenderer.js';
import { renderMemoryReel }  from '../renderers/memoryReelRenderer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const OUTPUTS_DIR = path.join(__dirname, '..', 'outputs');

[UPLOADS_DIR, OUTPUTS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// In-memory file registry (keyed by fileId)
const fileRegistry = new Map();

// ── Multer ──────────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 150 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(jpg|jpeg|png|mp4|mov|webm)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported format. Use JPG, PNG, MP4, or MOV.'));
    }
  },
});

const router = express.Router();

// ── Multer — template uploads ────────────────────────────────────────────────

const templateUpload = multer({
  storage,  // reuse existing diskStorage
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Accept video clips, audio, and images (photo-wall template uploads photos)
    const ok = /\.(mp4|mov|webm|mp3|m4a|aac|wav|jpg|jpeg|png)$/i.test(file.originalname);
    if (ok) cb(null, true);
    else cb(new Error('Unsupported file type. Accepted: MP4, MOV, WEBM, MP3, M4A, JPG, PNG.'));
  },
});

// ── POST /api/upload ─────────────────────────────────────────────────────────

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided.' });

    const isVideo = /\.(mp4|mov|webm)$/i.test(req.file.filename);
    const fileId  = uuidv4();
    let previewUrl;

    if (isVideo) {
      const thumbName = `thumb_${fileId}.jpg`;
      const thumbPath = path.join(UPLOADS_DIR, thumbName);
      await extractThumbnail(req.file.path, thumbPath, { timestamp: 1 });
      previewUrl = `/uploads/${thumbName}`;
    } else {
      previewUrl = `/uploads/${req.file.filename}`;
    }

    fileRegistry.set(fileId, {
      filePath:   req.file.path,
      fileName:   req.file.filename,
      isVideo,
      previewUrl,
    });

    res.json({ fileId, previewUrl, isVideo });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/generate — SSE streaming ──────────────────────────────────────

router.post('/generate', async (req, res) => {
  const { fileId } = req.body;
  const record = fileRegistry.get(fileId);

  if (!record) {
    return res.status(404).json({ error: 'File not found. Please re-upload.' });
  }

  // SSE headers
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (type, data = {}) =>
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  try {
    send('status', { message: 'Analyzing your media with Claude…' });

    // For video: extract a representative frame for Claude to inspect
    let analysisImagePath;
    if (record.isVideo) {
      const frameName = `frame_${fileId}.jpg`;
      const framePath = path.join(UPLOADS_DIR, frameName);
      await extractThumbnail(record.filePath, framePath, { timestamp: 2 });
      analysisImagePath = framePath;
    } else {
      analysisImagePath = record.filePath;
    }

    // Ask Claude for edit suggestions
    const edits = await analyzeWithClaude(analysisImagePath);
    send('edits_planned', { edits: edits.map(e => ({ name: e.name, description: e.description, style: e.style })) });

    // Run all edits in parallel via editRunner; stream each completion
    send('status', { message: 'Processing edits…' });
    let editIndex = 0;

    const results = await runEdits(edits, record.filePath, {
      onEditDone: (result) => {
        if (result.ok) {
          const outputUrl = `/outputs/${result.filename}`;
          const thumbUrl  = result.thumbFilename
            ? `/outputs/${result.thumbFilename}`
            : outputUrl;
          send('edit_done', {
            index:       editIndex++,
            name:        result.name,
            description: result.description,
            style:       result.style,
            outputUrl,
            thumbUrl,
          });
        } else {
          send('edit_error', {
            index: editIndex++,
            name:  result.name,
            error: result.error,
          });
        }
      },
    });

    // Build final summary for the complete event
    const finalResults = results.map(r =>
      r.ok
        ? {
            name:        r.name,
            description: r.description,
            outputUrl:   `/outputs/${r.filename}`,
            thumbUrl:    r.thumbFilename ? `/outputs/${r.thumbFilename}` : `/outputs/${r.filename}`,
          }
        : { name: r.name, error: r.error }
    );

    send('complete', { results: finalResults });
    res.end();

  } catch (err) {
    console.error('Generate error:', err);
    let message = err.message ?? 'Something went wrong.';
    if (err.status === 401 || message.includes('authentication_error') || message.includes('invalid x-api-key')) {
      message = 'Invalid Anthropic API key. Update ANTHROPIC_API_KEY in server/.env and restart.';
    } else if (err.status === 429 || message.includes('rate_limit')) {
      message = 'Anthropic rate limit hit. Wait a moment and try again.';
    } else if (message.startsWith('{')) {
      try { const p = JSON.parse(message); message = p?.error?.message ?? message; } catch {}
    }
    send('error', { message });
    res.end();
  }
});

// ── GET /api/outputs/:filename ───────────────────────────────────────────────

router.get('/outputs/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // sanitise traversal
  const filePath = path.join(OUTPUTS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Output file not found.' });
  }

  // Content-Disposition so browsers download with the right name
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(filePath);
});

// ── POST /api/collage ────────────────────────────────────────────────────────

const collageUpload = multer({
  storage,                                      // reuse the same diskStorage
  limits: { fileSize: 20 * 1024 * 1024 },       // 20 MB per file
  fileFilter: (req, file, cb) => {
    const photoOk = /\.(jpg|jpeg|png)$/i.test(file.originalname);
    const audioOk = /\.(mp3|m4a|aac|wav)$/i.test(file.originalname);
    if (photoOk || audioOk) cb(null, true);
    else cb(new Error('Photos must be JPG/PNG; audio must be MP3/M4A.'));
  },
});

router.post('/collage', collageUpload.fields([
  { name: 'photos', maxCount: 20 },
  { name: 'audio',  maxCount: 1  },
]), async (req, res) => {
  // SSE setup (mirrors /api/generate — gives progress feedback during long encode)
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (type, data = {}) =>
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  try {
    const photoFiles = req.files?.photos ?? [];
    const audioFile  = req.files?.audio?.[0] ?? null;

    if (photoFiles.length < 2) {
      send('error', { message: 'Please upload at least 2 photos.' });
      return res.end();
    }
    if (photoFiles.length > 20) {
      send('error', { message: 'Maximum 20 photos per collage.' });
      return res.end();
    }

    const photoPaths = photoFiles.map(f => f.path);
    const audioPath  = audioFile?.path ?? null;

    // Optional user controls from CollageMode
    const audioTrimStart = req.body.audioTrimStart ? parseFloat(req.body.audioTrimStart)        : null;
    const targetDuration = req.body.targetDuration ? parseInt(req.body.targetDuration, 10)       : null;
    const clipEffects    = req.body.clipEffects    ? JSON.parse(req.body.clipEffects)            : [];
    const transitions    = req.body.transitions    ? JSON.parse(req.body.transitions)            : [];
    const globalEffects  = req.body.globalEffects  ? JSON.parse(req.body.globalEffects)          : [];

    if (audioTrimStart !== null) console.log(`[collage] audioTrimStart=${audioTrimStart.toFixed(3)}s`);
    if (targetDuration  !== null) console.log(`[collage] targetDuration=${targetDuration}s`);
    if (transitions.length > 0) console.log(`[collage] transition=${transitions[0]}`);
    if (clipEffects.length > 0) console.log(`[collage] clipEffects=${clipEffects.join(',')}`);
    if (globalEffects.length > 0) console.log(`[collage] globalEffects=${globalEffects.join(',')}`);

    // Step 1 — Claude vision analysis
    send('status', { message: `Analyzing ${photoFiles.length} photos with Claude…` });
    const claudeInstructions = await analyzeCollageWithClaude(photoPaths);
    send('analyzed', {
      mood:       claudeInstructions.overall_mood,
      colorGrade: claudeInstructions.color_grade,
      transition: claudeInstructions.transition_style,
      order:      claudeInstructions.suggested_order,
    });

    // Step 2 — FFmpeg encode
    send('status', { message: 'Building video with FFmpeg…' });
    const { filename, metadata } = await buildCollageVideo(
      photoPaths, audioPath, claudeInstructions,
      { audioTrimStart, targetDuration, clipEffects, transitions, globalEffects },
    );

    const outputUrl = `/outputs/${filename}`;
    send('complete', { outputUrl, filename, metadata });
    res.end();

  } catch (err) {
    console.error('Collage error:', err);
    let message = err.message ?? 'Collage generation failed.';
    if (err.status === 401 || message.includes('authentication_error')) {
      message = 'Invalid Anthropic API key. Check server/.env and restart.';
    } else if (err.status === 429) {
      message = 'Anthropic rate limit hit — wait a moment and try again.';
    }
    send('error', { message });
    res.end();
  }
});

// ── GET /api/templates ───────────────────────────────────────────────────────

router.get('/templates', (req, res) => {
  res.json(getAllTemplates());
});

// ── Multer for template thumbnail uploads ────────────────────────────────────

const thumbnailUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.originalname);
    cb(ok ? null : new Error('Thumbnail must be an image (JPG, PNG, GIF, WebP)'), ok);
  },
});

// ── Shared slug validator ────────────────────────────────────────────────────

function isValidSlug(id) {
  return typeof id === 'string' && /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(id);
}

function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ── POST /api/templates — create new template ────────────────────────────────

router.post('/templates', thumbnailUpload.single('thumbnail'), (req, res) => {
  try {
    const raw = req.body.template;
    if (!raw) return res.status(400).json({ error: 'Missing template JSON in body' });

    const data = JSON.parse(raw);
    if (!data.name?.trim()) return res.status(400).json({ error: 'Template name is required' });

    // Derive id from name
    data.id = slugify(data.name);
    if (!isValidSlug(data.id)) {
      return res.status(400).json({ error: `Cannot derive a valid id from name "${data.name}"` });
    }

    // Reject duplicates (use PUT to update)
    if (getTemplateById(data.id)) {
      return res.status(409).json({
        error: `A template with id "${data.id}" already exists. Use PUT /api/templates/${data.id} to update it.`,
      });
    }

    // Save thumbnail if provided
    if (req.file) {
      const thumbDir  = path.join(__dirname, '..', 'templates', data.id);
      const ext       = path.extname(req.file.originalname).toLowerCase() || '.jpg';
      const thumbName = `preview${ext}`;
      fs.mkdirSync(thumbDir, { recursive: true });
      fs.renameSync(req.file.path, path.join(thumbDir, thumbName));
      data.previewThumbnail = `/templates/${data.id}/${thumbName}`;
    }

    const saved = writeTemplate(data);
    res.status(201).json({ success: true, template: saved });
  } catch (err) {
    console.error('POST /api/templates error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/templates/:id — update (or create) existing template ─────────────

router.put('/templates/:id', thumbnailUpload.single('thumbnail'), (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidSlug(id)) return res.status(400).json({ error: 'Invalid template id' });

    const raw = req.body.template;
    if (!raw) return res.status(400).json({ error: 'Missing template JSON in body' });

    const data = JSON.parse(raw);
    data.id = id; // enforce id from URL

    // Save new thumbnail if provided
    if (req.file) {
      const thumbDir  = path.join(__dirname, '..', 'templates', id);
      const ext       = path.extname(req.file.originalname).toLowerCase() || '.jpg';
      const thumbName = `preview${ext}`;
      fs.mkdirSync(thumbDir, { recursive: true });
      fs.renameSync(req.file.path, path.join(thumbDir, thumbName));
      data.previewThumbnail = `/templates/${id}/${thumbName}`;
    }

    const saved = writeTemplate(data);
    res.json({ success: true, template: saved });
  } catch (err) {
    console.error('PUT /api/templates error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/templates/:id ─────────────────────────────────────────────────

router.delete('/templates/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidSlug(id)) return res.status(400).json({ error: 'Invalid template id' });
    removeTemplate(id);
    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ── POST /api/template-render — SSE streaming ────────────────────────────────

router.post('/template-render', templateUpload.fields([
  { name: 'clips', maxCount: 30 },  // Memory Reel supports up to 30 photos
  { name: 'audio', maxCount: 1 },
]), async (req, res) => {
  // SSE headers (same pattern as /api/collage)
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (type, data = {}) =>
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  // Parse body
  const templateId     = req.body.templateId;
  const treatments     = JSON.parse(req.body.treatments    || '[]');
  const captionMode    = req.body.captionMode || 'none';
  const manualCaptions = req.body.captions    ? JSON.parse(req.body.captions)    : [];
  // trimRanges is sent only when FFmpeg.wasm client-side trim wasn't available.
  // Each entry is { trimStart, trimEnd } or null (already trimmed client-side).
  const trimRanges     = req.body.trimRanges  ? JSON.parse(req.body.trimRanges)  : null;
  // Effects & transitions (optional — fully backwards-compatible)
  const clipEffects    = req.body.clipEffects   ? JSON.parse(req.body.clipEffects)  : [];
  const transitions    = req.body.transitions   ? JSON.parse(req.body.transitions)  : [];
  const globalEffects  = req.body.globalEffects ? JSON.parse(req.body.globalEffects) : [];

  const template = getTemplateById(templateId);
  if (!template) {
    send('error', { message: 'Template not found.' });
    return res.end();
  }

  const clipFiles = (req.files?.clips ?? []).map(f => f.path);
  const audioPath = req.files?.audio?.[0]?.path ?? null;

  // Custom renderers bypass the standard slot-count check
  const isPhotoWall   = templateId === 'photo-wall';
  const isMemoryReel  = templateId === 'memory-reel';
  const isCustom      = isPhotoWall || isMemoryReel;

  if (!isCustom && clipFiles.length !== template.clipSlots.length) {
    send('error', { message: `Expected ${template.clipSlots.length} clips, got ${clipFiles.length}.` });
    return res.end();
  }

  if (isPhotoWall && clipFiles.length < 3) {
    send('error', { message: 'Photo Wall requires at least 3 photos.' });
    return res.end();
  }

  if (isMemoryReel && clipFiles.length < 4) {
    send('error', { message: 'Memory Reel requires at least 4 photos.' });
    return res.end();
  }

  try {
    send('status', { message: 'Starting render…' });

    let result;

    if (isPhotoWall) {
      // ── Custom Photo Wall renderer ──────────────────────────────────────────
      result = await renderPhotoWall({
        clipFiles,
        audioPath,
        onProgress: (msg) => send('status', { message: msg }),
      });

    } else if (isMemoryReel) {
      // ── Custom Memory Reel renderer ─────────────────────────────────────────
      const titleText      = req.body.titleText     || null;
      const targetDuration = req.body.targetDuration
        ? parseFloat(req.body.targetDuration) : null;

      result = await renderMemoryReel({
        clipFiles,
        audioPath,
        titleText,
        targetDuration,
        onProgress: (msg) => send('status', { message: msg }),
      });

    } else {
      // ── Standard template renderer ──────────────────────────────────────────
      result = await renderTemplate({
        templateId, template, clipFiles, treatments,
        clipEffects, transitions, globalEffects,
        captionMode, manualCaptions, audioPath, trimRanges,
        onProgress: (msg) => send('status', { message: msg }),
      });
    }

    send('complete', {
      outputUrl:  `/outputs/${result.filename}`,
      filename:   result.filename,
      duration:   result.duration,
      clipCount:  result.clipCount,
    });
    res.end();
  } catch (err) {
    console.error('Template render error:', err);
    send('error', { message: err.message ?? 'Render failed.' });
    res.end();
  }
});

// ── Multer error handler ─────────────────────────────────────────────────────

router.use((err, req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Max 150 MB.' });
  }
  res.status(400).json({ error: err.message });
});

export default router;
