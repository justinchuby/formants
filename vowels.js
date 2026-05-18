/**
 * IPA vowel reference data with F1/F2 formant frequencies (Hz).
 * Values are based on average adult male productions (Peterson & Barney, 1952).
 */
export const VOWELS = [
  // Close
  { symbol: "i", f1: , f2: , f3: 3010, name: "close front unrounded" },
  { symbol: "y", f1: , f2: , f3: 2350, name: "close front rounded" },
  { symbol: "ɨ", f1: , f2: , f3: 2700, name: "close central unrounded" },
  { symbol: "ɯ", f1: , f2: , f3: 2700, name: "close back unrounded" },
  { symbol: "u", f1: , f2: , f3: 2240, name: "close back rounded" },

  // Near-close
  { symbol: "ɪ", f1: , f2: , f3: 2550, name: "near-close near-front unrounded" },
  { symbol: "ʊ", f1: , f2: , f3: 2240, name: "near-close near-back rounded" },

  // Close-mid
  { symbol: "e", f1: , f2: , f3: 2550, name: "close-mid front unrounded" },
  { symbol: "ø", f1: , f2: , f3: 2300, name: "close-mid front rounded" },
  { symbol: "ɘ", f1: , f2: , f3: 2500, name: "close-mid central unrounded" },
  { symbol: "ɵ", f1: , f2: , f3: 2300, name: "close-mid central rounded" },
  { symbol: "ɤ", f1: , f2: , f3: 2550, name: "close-mid back unrounded" },
  { symbol: "o", f1: , f2: , f3: 2240, name: "close-mid back rounded" },

  // Mid
  { symbol: "ə", f1: , f2: , f3: 2500, name: "mid central (schwa)" },

  // Open-mid
  { symbol: "ɛ", f1: , f2: , f3: 2480, name: "open-mid front unrounded" },
  { symbol: "œ", f1: , f2: , f3: 2300, name: "open-mid front rounded" },
  { symbol: "ɜ", f1: , f2: , f3: 2500, name: "open-mid central unrounded" },
  { symbol: "ʌ", f1: , f2: , f3: 2550, name: "open-mid back unrounded" },
  { symbol: "ɔ", f1: , f2: , f3: 2240, name: "open-mid back rounded" },

  // Near-open
  { symbol: "æ", f1: , f2: , f3: 2500, name: "near-open front unrounded" },
  { symbol: "ɐ", f1: , f2: , f3: 2500, name: "near-open central" },

  // Open
  { symbol: "a", f1: , f2: , f3: 2500, name: "open front unrounded" },
  { symbol: "ɶ", f1: , f2: , f3: 2300, name: "open front rounded" },
  { symbol: "ɑ", f1: , f2: , f3: 2440, name: "open back unrounded" },
  { symbol: "ɒ", f1: , f2: , f3: 2240, name: "open back rounded" },
];

/**
 * Find the nearest vowel to a given F1/F2 pair using Euclidean distance
 * in normalized formant space.
 */
export function findNearestVowel(f1, f2, f3 = null) {
  let best = null;
  let bestDist = Infinity;
  for (const v of VOWELS) {
    // Normalize each formant by its typical range for equal weighting
    let d = Math.hypot((f1 - v.f1) / 500, (f2 - v.f2) / 1500);
    // If F3 available, use it to disambiguate (especially rounded vs unrounded)
    if (f3 !== null && v.f3) {
      d = Math.sqrt(
        Math.pow((f1 - v.f1) / 500, 2) +
        Math.pow((f2 - v.f2) / 1500, 2) +
        Math.pow((f3 - v.f3) / 800, 2) * 0.5  // lower weight for F3
      );
    }
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return { vowel: best, distance: bestDist };
}
