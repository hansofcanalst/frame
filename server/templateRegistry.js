/**
 * templateRegistry.js
 * Loads, caches, writes, and deletes template JSON definitions from ./templates/.
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, 'templates');

// ── Internal cache ───────────────────────────────────────────────────────────

function loadAll() {
  try {
    if (!fs.existsSync(TEMPLATES_DIR)) return new Map();
    const map = new Map();
    for (const file of fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json'))) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf8'));
        if (data.id) map.set(data.id, data);
      } catch { /* skip malformed JSON */ }
    }
    return map;
  } catch {
    return new Map();
  }
}

let _cache = loadAll();

// ── Reads ────────────────────────────────────────────────────────────────────

export function getAllTemplates() {
  return Array.from(_cache.values());
}

export function getTemplateById(id) {
  return _cache.get(id) ?? null;
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Write (create or overwrite) a template JSON file and refresh the cache.
 * @param {object} data  Must have a valid `id` field.
 * @returns {object} The saved template data.
 */
export function writeTemplate(data) {
  if (!data?.id) throw new Error('Template must have an id');
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  const filePath = path.join(TEMPLATES_DIR, `${data.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  _cache = loadAll();
  return data;
}

/**
 * Delete a template JSON file and refresh the cache.
 * @param {string} id
 */
export function removeTemplate(id) {
  const filePath = path.join(TEMPLATES_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) throw new Error(`Template "${id}" not found`);
  fs.unlinkSync(filePath);
  _cache = loadAll();
}
