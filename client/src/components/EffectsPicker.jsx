/**
 * EffectsPicker.jsx
 * Multi-select pill strip for clip effects.
 *
 * Props:
 *   selected  — string[]            currently active effect IDs
 *   onChange  — (ids: string[]) => void
 *   compact   — boolean             use a more compact layout (default false)
 */

import { useState } from 'react';
import {
  CLIP_EFFECTS_DATA,
  EFFECT_CATEGORIES,
  CATEGORY_DOT_COLORS,
} from '../data/effectsData.js';

export default function EffectsPicker({ selected = [], onChange, compact = false }) {
  const [activeCategory, setActiveCategory] = useState('all');

  const filtered = activeCategory === 'all'
    ? CLIP_EFFECTS_DATA
    : CLIP_EFFECTS_DATA.filter(e => e.category === activeCategory);

  const toggle = (id) => {
    onChange(
      selected.includes(id)
        ? selected.filter(x => x !== id)
        : [...selected, id]
    );
  };

  return (
    <div className={`space-y-2 ${compact ? '' : ''}`}>

      {/* Category tabs */}
      <div className="flex gap-1 flex-wrap">
        {EFFECT_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${
              activeCategory === cat.id
                ? 'bg-surface-600 text-ink'
                : 'text-ink-dim hover:text-ink-muted'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Effect pills */}
      <div className="flex flex-wrap gap-1.5">
        {filtered.map(effect => {
          const isActive = selected.includes(effect.id);
          const dotColor = CATEGORY_DOT_COLORS[effect.category] ?? 'bg-ink-dim';

          return (
            <button
              key={effect.id}
              onClick={() => toggle(effect.id)}
              title={effect.description}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                transition-all border select-none
                ${isActive
                  ? 'bg-accent text-white border-accent shadow-sm shadow-accent/25'
                  : 'bg-surface-700 text-ink-muted border-border hover:border-accent/50 hover:text-ink'
                }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-white/70' : dotColor}`} />
              {effect.label}
            </button>
          );
        })}
      </div>

      {/* Clear link */}
      {selected.length > 0 && (
        <button
          onClick={() => onChange([])}
          className="text-xs text-ink-dim hover:text-ink-muted transition-colors"
        >
          Clear {selected.length} effect{selected.length !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
}
