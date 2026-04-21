/**
 * routes/photoTemplates.js
 *
 * GET  /api/photo-templates         — list all template definitions
 * POST /api/photo-templates/preview — fast low-res image preview (no video)
 * POST /api/photo-templates/render  — full quality image + looping video
 */

import express  from 'express';
import multer   from 'multer';
import path     from 'path';
import fs       from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 }  from 'uuid';
import { renderPhotoTemplate, getAllPhotoTemplates, getPhotoTemplate } from '../renderers/photoTemplateRenderer.js';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const OUTPUTS_DIR = path.join(__dirname, '..', 'outputs');
[UPLOADS_DIR, OUTPUTS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ── Multer ────────────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `pt_${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(jpg|jpeg|png|webp)$/i.test(file.originalname);
    cb(ok ? null : new Error('Photos must be JPG, PNG, or WebP'), ok);
  },
});

const router = express.Router();

// ── GET /api/photo-templates ──────────────────────────────────────────────────

router.get('/', (_req, res) => {
  try {
    res.json(getAllPhotoTemplates());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/photo-templates/preview ────────────────────────────────────────
// Returns a single low-res JPEG preview URL within ~1s

router.post('/preview', upload.array('photos', 3), async (req, res) => {
  const { templateId, sizeId } = req.body;
  const photos = (req.files ?? []).map(f => f.path);

  const template = getPhotoTemplate(templateId);
  if (!template) return res.status(404).json({ error: 'Template not found.' });
  if (!sizeId)   return res.status(400).json({ error: 'sizeId required.' });
  if (photos.length < template.photoCount) {
    return res.status(400).json({
      error: `This template needs ${template.photoCount} photo(s). Got ${photos.length}.`
    });
  }

  const size = template.sizes.find(s => s.id === sizeId);
  if (!size) return res.status(400).json({ error: 'Unknown sizeId.' });

  try {
    const outName = `pt_preview_${Date.now()}.jpg`;
    const outPath = path.join(OUTPUTS_DIR, outName);
    await renderPhotoTemplate({ template, sizeId, photos, outputImagePath: outPath, preview: true });
    res.json({ previewUrl: `/outputs/${outName}` });
  } catch (err) {
    console.error('[photo-templates] preview error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/photo-templates/render ─────────────────────────────────────────
// Full-quality render: returns { imageUrl, videoUrl }

router.post('/render', upload.array('photos', 3), async (req, res) => {
  const { templateId, sizeId } = req.body;
  const photos = (req.files ?? []).map(f => f.path);

  const template = getPhotoTemplate(templateId);
  if (!template) return res.status(404).json({ error: 'Template not found.' });
  if (!sizeId)   return res.status(400).json({ error: 'sizeId required.' });
  if (photos.length < template.photoCount) {
    return res.status(400).json({
      error: `This template needs ${template.photoCount} photo(s). Got ${photos.length}.`
    });
  }

  const size = template.sizes.find(s => s.id === sizeId);
  if (!size) return res.status(400).json({ error: 'Unknown sizeId.' });

  try {
    const stamp    = Date.now();
    const baseName = `pt_${templateId}_${sizeId}_${stamp}`;
    const imagePath = path.join(OUTPUTS_DIR, `${baseName}.jpg`);
    const videoPath = path.join(OUTPUTS_DIR, `${baseName}.mp4`);

    await renderPhotoTemplate({
      template, sizeId, photos,
      outputImagePath: imagePath,
      outputVideoPath: videoPath,
      preview: false,
    });

    res.json({
      imageUrl: `/outputs/${baseName}.jpg`,
      videoUrl: `/outputs/${baseName}.mp4`,
    });
  } catch (err) {
    console.error('[photo-templates] render error:', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

// ── Multer error handler ──────────────────────────────────────────────────────

router.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message });
});

export default router;
