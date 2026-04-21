/**
 * treatments.js
 * Video treatment (color/look) filter strings for FFmpeg.
 */

export const TREATMENTS = {
  throwback: 'eq=brightness=0.05:contrast=0.9:saturation=0.7,noise=alls=8:allf=t',
  modern:    'eq=brightness=-0.02:contrast=1.15:saturation=1.3',
  none:      null,
};

/**
 * Returns the FFmpeg vf filter string for a named treatment,
 * or null if the treatment is 'none' / unknown.
 * @param {string} name
 * @returns {string|null}
 */
export function getTreatmentFilter(name) {
  return TREATMENTS[name] ?? null;
}
