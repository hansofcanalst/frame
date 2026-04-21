/**
 * testProcessor.js
 * Runs all 10 edit types against a synthetic test video and a test image.
 * Usage:  node testProcessor.js
 *
 * Generates:
 *   test_assets/source.mp4   — 5-second synthetic test video (colour bars)
 *   test_assets/source.jpg   — 720p test image (colour gradient)
 *   test_assets/out_*.mp4    — one output per video edit type
 *   test_assets/out_*.jpg    — one output per image edit type
 */

import 'dotenv/config';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { verifyFfmpeg } from './services/videoProcessor.js';
import {
  colorGrade,
  blackAndWhite,
  warmTone,
  coolTone,
  applyVignette,
  cinematicCrop,
  filmGrain,
  speedRamp,
  textOverlay   as videoTextOverlay,
  extractThumbnail,
} from './services/videoProcessor.js';

import {
  colorGrade    as imgColorGrade,
  blackAndWhite as imgBlackAndWhite,
  warmTone      as imgWarmTone,
  coolTone      as imgCoolTone,
  applyVignette as imgVignette,
  cinematicCrop as imgCinematicCrop,
  filmGrain     as imgFilmGrain,
  speedRamp     as imgSpeedRamp,
  textOverlay   as imgTextOverlay,
} from './services/imageProcessor.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS    = path.join(__dirname, 'test_assets');
const SRC_VID   = path.join(ASSETS, 'source.mp4');
const SRC_IMG   = path.join(ASSETS, 'source.jpg');

fs.mkdirSync(ASSETS, { recursive: true });

// ── Helpers ─────────────────────────────────────────────────────────────────

function tick(label, ok, detail = '') {
  const icon = ok ? '✓' : '✗';
  const msg  = ok ? `${label}` : `${label}  ← ${detail}`;
  console.log(`  ${icon} ${msg}`);
  return ok;
}

async function runTest(label, fn) {
  try {
    await fn();
    return tick(label, true);
  } catch (err) {
    return tick(label, false, err.message);
  }
}

// ── Synthetic source generators ──────────────────────────────────────────────

function generateTestVideo(outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('color=c=0x1a3a6a:size=1280x720:rate=30')
      .inputOptions(['-f', 'lavfi'])
      // Overlay a second input: SMPTE colour bars
      .input('smptebars=size=1280x720:rate=30')
      .inputOptions(['-f', 'lavfi'])
      .complexFilter([
        '[0:v][1:v]blend=all_expr=\'A*(1-T/5)+B*(T/5)\':shortest=1[v]',
      ], 'v')
      .outputOptions([
        '-c:v libx264', '-preset fast', '-crf 20',
        '-pix_fmt yuv420p', '-t 5', '-an',
      ])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

async function generateTestImage(outputPath) {
  // 1280×720 gradient from deep blue → warm orange
  const width = 1280, height = 720;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = x / width;
      const i = (y * width + x) * 3;
      pixels[i]     = Math.round(20  + t * 235); // R
      pixels[i + 1] = Math.round(60  + t * 100); // G
      pixels[i + 2] = Math.round(200 - t * 180); // B
    }
  }
  await sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 90 })
    .toFile(outputPath);
}

// ── Test suites ──────────────────────────────────────────────────────────────

async function testVideoProcessors() {
  console.log('\n📹  Video processors (ffmpeg)\n');

  const o = (name) => path.join(ASSETS, `out_video_${name}.mp4`);
  const results = await Promise.all([
    runTest('colorGrade',    () => colorGrade(SRC_VID, o('colorGrade'),
      { brightness: 0.1, contrast: 1.3, saturation: 1.5 })),
    runTest('blackAndWhite', () => blackAndWhite(SRC_VID, o('blackAndWhite'))),
    runTest('warmTone',      () => warmTone(SRC_VID, o('warmTone'))),
    runTest('coolTone',      () => coolTone(SRC_VID, o('coolTone'))),
    runTest('vignette',      () => applyVignette(SRC_VID, o('vignette'))),
    runTest('cinematicCrop', () => cinematicCrop(SRC_VID, o('cinematicCrop'))),
    runTest('filmGrain',     () => filmGrain(SRC_VID, o('filmGrain'), { strength: 35 })),
    runTest('speedRamp',     () => speedRamp(SRC_VID, o('speedRamp'), { speed: 2.0 })),
    runTest('textOverlay',   () => videoTextOverlay(SRC_VID, o('textOverlay'),
      { text: 'TEST OVERLAY', fontsize: 52, color: 'white', position: 'bottom' })),
    runTest('extractThumbnail', async () => {
      const thumbOut = path.join(ASSETS, 'out_video_thumbnail.jpg');
      await extractThumbnail(SRC_VID, thumbOut, { timestamp: 2 });
    }),
  ]);

  return results;
}

async function testImageProcessors() {
  console.log('\n🖼️   Image processors (sharp)\n');

  const o = (name) => path.join(ASSETS, `out_image_${name}.jpg`);
  const results = await Promise.all([
    runTest('colorGrade',    () => imgColorGrade(SRC_IMG, o('colorGrade'),
      { brightness: 0.15, contrast: 1.2, saturation: 1.4 })),
    runTest('blackAndWhite', () => imgBlackAndWhite(SRC_IMG, o('blackAndWhite'))),
    runTest('warmTone',      () => imgWarmTone(SRC_IMG, o('warmTone'))),
    runTest('coolTone',      () => imgCoolTone(SRC_IMG, o('coolTone'))),
    runTest('vignette',      () => imgVignette(SRC_IMG, o('vignette'))),
    runTest('cinematicCrop', () => imgCinematicCrop(SRC_IMG, o('cinematicCrop'))),
    runTest('filmGrain',     () => imgFilmGrain(SRC_IMG, o('filmGrain'), { strength: 40 })),
    runTest('speedRamp',     () => imgSpeedRamp(SRC_IMG, o('speedRamp'))),   // warm fallback
    runTest('textOverlay',   () => imgTextOverlay(SRC_IMG, o('textOverlay'),
      { text: 'TEST OVERLAY', fontsize: 52, color: 'white', position: 'bottom' })),
  ]);

  return results;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  FRAME — Edit Processor Test Suite   ');
  console.log('═══════════════════════════════════════');

  // 1. Verify FFmpeg
  try {
    await verifyFfmpeg();
  } catch (err) {
    console.error('❌ FFmpeg check failed:', err.message);
    process.exit(1);
  }

  // 2. Generate source assets
  console.log('\n⚙️   Generating test assets…');
  if (!fs.existsSync(SRC_VID)) {
    try {
      await generateTestVideo(SRC_VID);
      console.log(`  ✓ ${SRC_VID}`);
    } catch (err) {
      console.warn(`  ⚠ Could not generate test video (${err.message}) — skipping video tests`);
    }
  } else {
    console.log(`  → reusing ${SRC_VID}`);
  }

  if (!fs.existsSync(SRC_IMG)) {
    await generateTestImage(SRC_IMG);
    console.log(`  ✓ ${SRC_IMG}`);
  } else {
    console.log(`  → reusing ${SRC_IMG}`);
  }

  // 3. Run processors
  const [videoResults, imageResults] = await Promise.all([
    fs.existsSync(SRC_VID) ? testVideoProcessors() : Promise.resolve([]),
    testImageProcessors(),
  ]);

  const all    = [...videoResults, ...imageResults];
  const passed = all.filter(Boolean).length;
  const failed = all.length - passed;

  console.log('\n═══════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed / ${all.length} total`);
  console.log(`  Outputs written to: ${ASSETS}`);
  console.log('═══════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
