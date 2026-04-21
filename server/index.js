import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { verifyFfmpeg } from './services/videoProcessor.js';
import apiRouter           from './routes/api.js';
import photoTemplatesRouter from './routes/photoTemplates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3002;

// ── FFmpeg startup check ────────────────────────────────────────────────────
try {
  await verifyFfmpeg();
} catch (err) {
  console.error('❌ FFmpeg unavailable:', err.message);
  process.exit(1);
}

// ── Express app ─────────────────────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json());

// Serve processed files directly (also covered by GET /api/outputs/:filename)
app.use('/outputs',   express.static(path.join(__dirname, 'outputs')));
app.use('/uploads',   express.static(path.join(__dirname, 'uploads')));
// Serve template preview assets (thumbnails, preview videos)
app.use('/templates', express.static(path.join(__dirname, 'templates')));

app.use('/api', apiRouter);
app.use('/api/photo-templates', photoTemplatesRouter);

app.listen(PORT, () => {
  console.log(`✓ Server listening on http://localhost:${PORT}`);
});
