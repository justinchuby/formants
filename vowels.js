/**
 * IPA vowel reference data with F1/F2 formant frequencies (Hz).
 * Values are based on average adult male productions (Peterson & Barney, 1952).
 */
export const VOWELS = [
  // Close
  { symbol: "i", f1: 270, f2: 2290, name: "close front unrounded" },
  { symbol: "y", f1: 235, f2: 2100, name: "close front rounded" },
  { symbol: "ɨ", f1: 300, f2: 1600, name: "close central unrounded" },
  { symbol: "ɯ", f1: 300, f2: 1100, name: "close back unrounded" },
  { symbol: "u", f1: 300, f2: 870, name: "close back rounded" },

  // Near-close
  { symbol: "ɪ", f1: 390, f2: 1990, name: "near-close near-front unrounded" },
  { symbol: "ʊ", f1: 440, f2: 1020, name: "near-close near-back rounded" },

  // Close-mid
  { symbol: "e", f1: 390, f2: 2100, name: "close-mid front unrounded" },
  { symbol: "ø", f1: 370, f2: 1900, name: "close-mid front rounded" },
  { symbol: "ɘ", f1: 400, f2: 1500, name: "close-mid central unrounded" },
  { symbol: "ɵ", f1: 400, f2: 1300, name: "close-mid central rounded" },
  { symbol: "ɤ", f1: 400, f2: 1100, name: "close-mid back unrounded" },
  { symbol: "o", f1: 390, f2: 880, name: "close-mid back rounded" },

  // Mid
  { symbol: "ə", f1: 500, f2: 1500, name: "mid central (schwa)" },

  // Open-mid
  { symbol: "ɛ", f1: 530, f2: 1840, name: "open-mid front unrounded" },
  { symbol: "œ", f1: 530, f2: 1700, name: "open-mid front rounded" },
  { symbol: "ɜ", f1: 560, f2: 1400, name: "open-mid central unrounded" },
  { symbol: "ʌ", f1: 640, f2: 1190, name: "open-mid back unrounded" },
  { symbol: "ɔ", f1: 570, f2: 840, name: "open-mid back rounded" },

  // Near-open
  { symbol: "æ", f1: 660, f2: 1720, name: "near-open front unrounded" },
  { symbol: "ɐ", f1: 650, f2: 1450, name: "near-open central" },

  // Open
  { symbol: "a", f1: 730, f2: 1600, name: "open front unrounded" },
  { symbol: "ɶ", f1: 730, f2: 1500, name: "open front rounded" },
  { symbol: "ɑ", f1: 730, f2: 1090, name: "open back unrounded" },
  { symbol: "ɒ", f1: 730, f2: 950, name: "open back rounded" },
];

/**
 * Find the nearest vowel to a given F1/F2 pair using Euclidean distance
 * in normalized formant space.
 */
export function findNearestVowel(f1, f2) {
  let best = null;
  let bestDist = Infinity;
  for (const v of VOWELS) {
    // Normalize: F2 range (~800-2300) is wider than F1 (~250-750),
    // so we scale to give roughly equal weight.
    const d = Math.hypot((f1 - v.f1) / 500, (f2 - v.f2) / 1500);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return { vowel: best, distance: bestDist };
}
