/**
 * claude.js
 * Sends a media frame to Claude vision and returns structured edit suggestions.
 * Each edit object has: { name, description, style, operations }
 */
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Valid style keys that map 1-to-1 to processor functions
const VALID_STYLES = [
  'colorGrade',
  'blackAndWhite',
  'warmTone',
  'coolTone',
  'vignette',
  'cinematicCrop',
  'filmGrain',
  'speedRamp',
  'textOverlay',
];

const SYSTEM_PROMPT = `You are a professional colorist and creative director. Analyze the provided image and suggest 5 distinct, visually impactful edit styles.

Return ONLY a valid JSON array — no markdown, no explanation. Each object must have exactly these fields:

{
  "name": "Short Style Name",          // 2–4 words
  "description": "One sentence.",      // what it looks like
  "style": "<styleKey>",               // one of the valid style keys listed below
  "operations": { /* style-specific params */ }
}

Valid style keys and their allowed operations:

  colorGrade    → { "brightness": -0.5…0.5, "contrast": 0.5…2.0, "saturation": 0.0…3.0 }
  blackAndWhite → {}
  warmTone      → {}
  coolTone      → {}
  vignette      → {}
  cinematicCrop → {}
  filmGrain     → { "strength": 0…100 }
  speedRamp     → { "speed": 0.25…4.0 }   (ignored for photos — maps to warmTone)
  textOverlay   → { "text": "string ≤30 chars", "fontsize": 24…72, "color": "white"|"black"|"yellow", "position": "top"|"center"|"bottom" }

Rules:
- Use each style key at most once across the 5 suggestions.
- Make the edits genuinely distinct (don't suggest the same style twice).
- Choose edits that suit the specific content of this image.
- Return exactly 5 edit objects, no more, no less.`;

const USER_PROMPT = 'Analyze this image and return exactly 5 distinct creative edit styles as a JSON array.';

export async function analyzeWithClaude(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const ext = path.extname(imagePath).toLowerCase().replace('.', '');
  const mediaType = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png';

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
        { type: 'text', text: USER_PROMPT },
      ],
    }],
  });

  const message = await stream.finalMessage();
  const rawText = message.content.find(b => b.type === 'text')?.text ?? '';
  return parseEditsJSON(rawText);
}

function parseEditsJSON(raw) {
  let text = raw.trim();

  // Strip markdown fences if Claude wrapped the JSON
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  // Extract the JSON array
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (!arrayMatch) throw new Error('Claude did not return a valid JSON array.');

  let edits;
  try {
    edits = JSON.parse(arrayMatch[0]);
  } catch {
    throw new Error('Failed to parse Claude response as JSON.');
  }

  if (!Array.isArray(edits) || edits.length === 0) {
    throw new Error('Claude returned an empty or invalid edit list.');
  }

  return edits.map(sanitizeEdit);
}

function sanitizeEdit(edit) {
  const style = VALID_STYLES.includes(edit.style) ? edit.style : 'colorGrade';
  return {
    name:        String(edit.name        ?? 'Edit').slice(0, 30),
    description: String(edit.description ?? '').slice(0, 120),
    style,
    operations:  sanitizeOperations(style, edit.operations ?? {}),
  };
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, Number(v) || 0)); }

function sanitizeOperations(style, ops) {
  switch (style) {
    case 'colorGrade':
      return {
        brightness: clamp(ops.brightness ?? 0, -0.5, 0.5),
        contrast:   clamp(ops.contrast   ?? 1, 0.5, 2.0),
        saturation: clamp(ops.saturation ?? 1, 0.0, 3.0),
      };
    case 'filmGrain':
      return { strength: clamp(ops.strength ?? 20, 0, 100) };
    case 'speedRamp':
      return { speed: clamp(ops.speed ?? 1.5, 0.25, 4.0) };
    case 'textOverlay':
      return {
        text:     String(ops.text ?? 'FRAME').slice(0, 30),
        fontsize: clamp(ops.fontsize ?? 48, 24, 72),
        color:    ['white', 'black', 'yellow'].includes(ops.color) ? ops.color : 'white',
        position: ['top', 'center', 'bottom'].includes(ops.position) ? ops.position : 'bottom',
      };
    default:
      return {}; // blackAndWhite, warmTone, coolTone, vignette, cinematicCrop take no params
  }
}

// ── Collage analysis ────────────────────────────────────────────────────────

const COLLAGE_SYSTEM_PROMPT = `You are a video editor analyzing a set of photos to create a short-form highlight reel. Analyze the mood, colors, and content of each photo. Return ONLY a JSON object with these fields:
- overall_mood: string describing the emotional tone
- color_grade: one of: cinematic, warm, cool, vibrant, muted, black_and_white
- suggested_duration_per_photo: number in seconds between 1.5 and 4.0, based on photo complexity
- transition_style: one of: fade, flash, zoom_in, zoom_out, slide
- suggested_order: array of photo indices (0-based) reordered for best visual flow

Return only valid JSON. No markdown, no explanation.`;

/**
 * Resize a photo to ≤1024px for efficient API transmission.
 */
async function resizeForClaude(imagePath) {
  const buf = await sharp(imagePath)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return buf.toString('base64');
}

/**
 * Send all collage photos to Claude in a single vision request.
 * @param {string[]} imagePaths  absolute paths to uploaded images (2–20)
 * @returns {object} Claude's collage instructions
 */
export async function analyzeCollageWithClaude(imagePaths) {
  const base64Images = await Promise.all(imagePaths.map(resizeForClaude));

  const imageBlocks = base64Images.map(data => ({
    type:   'image',
    source: { type: 'base64', media_type: 'image/jpeg', data },
  }));

  const stream = await client.messages.stream({
    model:      'claude-sonnet-4-6',
    max_tokens: 1024,
    system:     COLLAGE_SYSTEM_PROMPT,
    messages: [{
      role:    'user',
      content: [
        ...imageBlocks,
        {
          type: 'text',
          text: `Analyze these ${imagePaths.length} photos and return a JSON object for assembling them into a vertical highlight reel. The suggested_order must be an array of exactly ${imagePaths.length} unique indices from 0 to ${imagePaths.length - 1}.`,
        },
      ],
    }],
  });

  const message = await stream.finalMessage();
  const raw     = message.content.find(b => b.type === 'text')?.text ?? '';
  console.log('[collage] Claude raw response:', raw.slice(0, 500));
  return parseCollageJSON(raw, imagePaths.length);
}

function buildDefaultCollageInstructions(photoCount) {
  return {
    overall_mood:                'cinematic',
    color_grade:                 'cinematic',
    suggested_duration_per_photo: 2.5,
    transition_style:            'fade',
    suggested_order:             Array.from({ length: photoCount }, (_, i) => i),
  };
}

function parseCollageJSON(raw, photoCount) {
  let text = raw.trim();

  // Strip markdown fences (```json ... ``` or ``` ... ```)
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();

  // Try to extract a JSON object — be generous: grab everything from first { to last }
  const firstBrace = text.indexOf('{');
  const lastBrace  = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    console.error('[collage] No JSON object found in Claude response:', text.slice(0, 300));
    // Return safe defaults so the pipeline still runs
    return buildDefaultCollageInstructions(photoCount);
  }

  let obj;
  try {
    obj = JSON.parse(text.slice(firstBrace, lastBrace + 1));
  } catch (e) {
    console.error('[collage] JSON.parse failed:', e.message, '\nRaw text:', text.slice(0, 300));
    return buildDefaultCollageInstructions(photoCount);
  }

  // Sanitize suggested_order: must be a permutation of 0..photoCount-1
  let order = Array.isArray(obj.suggested_order) ? obj.suggested_order.map(Number) : [];
  const validIndices = new Set(Array.from({ length: photoCount }, (_, i) => i));
  const seen = new Set();
  order = order.filter(i => validIndices.has(i) && !seen.has(i) && seen.add(i));
  if (order.length !== photoCount) order = Array.from({ length: photoCount }, (_, i) => i);

  const validGrades      = ['cinematic', 'warm', 'cool', 'vibrant', 'muted', 'black_and_white'];
  const validTransitions = ['fade', 'flash', 'zoom_in', 'zoom_out', 'slide'];

  return {
    overall_mood:               String(obj.overall_mood ?? 'cinematic').slice(0, 40),
    color_grade:                validGrades.includes(obj.color_grade)            ? obj.color_grade      : 'cinematic',
    suggested_duration_per_photo: Math.max(1.5, Math.min(4.0, Number(obj.suggested_duration_per_photo) || 2.5)),
    transition_style:           validTransitions.includes(obj.transition_style)  ? obj.transition_style : 'fade',
    suggested_order:            order,
  };
}
