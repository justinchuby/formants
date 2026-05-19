/**
 * IPA vowel reference data with F1/F2 formant frequencies (Hz).
 * Values are based on average adult male productions (Peterson & Barney, 1952).
 */
export const VOWELS = [
  // Close
  { symbol: "i", f1: 270, f2: 2290, f3: 3010, name: "close front unrounded" },
  { symbol: "y", f1: 235, f2: 2100, f3: 2350, name: "close front rounded" },
  { symbol: "ɨ", f1: 300, f2: 1600, f3: 2700, name: "close central unrounded" },
  { symbol: "ɯ", f1: 300, f2: 1100, f3: 2700, name: "close back unrounded" },
  { symbol: "u", f1: 300, f2: 870, f3: 2240, name: "close back rounded" },

  // Near-close
  { symbol: "ɪ", f1: 390, f2: 1990, f3: 2550, name: "near-close near-front unrounded" },
  { symbol: "ʊ", f1: 440, f2: 1020, f3: 2240, name: "near-close near-back rounded" },

  // Close-mid
  { symbol: "e", f1: 390, f2: 2100, f3: 2550, name: "close-mid front unrounded" },
  { symbol: "ø", f1: 370, f2: 1900, f3: 2300, name: "close-mid front rounded" },
  { symbol: "ɘ", f1: 400, f2: 1500, f3: 2500, name: "close-mid central unrounded" },
  { symbol: "ɵ", f1: 400, f2: 1300, f3: 2300, name: "close-mid central rounded" },
  { symbol: "ɤ", f1: 400, f2: 1100, f3: 2550, name: "close-mid back unrounded" },
  { symbol: "o", f1: 390, f2: 880, f3: 2240, name: "close-mid back rounded" },

  // Mid
  { symbol: "ə", f1: 500, f2: 1500, f3: 2500, name: "mid central (schwa)" },

  // Open-mid
  { symbol: "ɛ", f1: 530, f2: 1840, f3: 2480, name: "open-mid front unrounded" },
  { symbol: "œ", f1: 530, f2: 1700, f3: 2300, name: "open-mid front rounded" },
  { symbol: "ɜ", f1: 560, f2: 1400, f3: 2500, name: "open-mid central unrounded" },
  { symbol: "ʌ", f1: 640, f2: 1190, f3: 2550, name: "open-mid back unrounded" },
  { symbol: "ɔ", f1: 570, f2: 840, f3: 2240, name: "open-mid back rounded" },

  // Near-open
  { symbol: "æ", f1: 660, f2: 1720, f3: 2500, name: "near-open front unrounded" },
  { symbol: "ɐ", f1: 650, f2: 1450, f3: 2500, name: "near-open central" },

  // Open
  { symbol: "a", f1: 730, f2: 1600, f3: 2500, name: "open front unrounded" },
  { symbol: "ɶ", f1: 730, f2: 1500, f3: 2300, name: "open front rounded" },
  { symbol: "ɑ", f1: 730, f2: 1090, f3: 2440, name: "open back unrounded" },
  { symbol: "ɒ", f1: 730, f2: 950, f3: 2240, name: "open back rounded" },
];

/**
 * Find the nearest vowel to a given F1/F2 pair using Euclidean distance
 * in normalized formant space.
 */
export function findNearestVowel(f1, f2, f3 = null) {
  let best = null;
  let bestDist = Infinity;
  for (const v of VOWELS) {
    let d;
    if (f3 !== null && v.f3) {
      // 3D distance: F1 × F2 × F3 (F3 lower weight, helps disambiguate rounded)
      d = Math.sqrt(
        Math.pow((f1 - v.f1) / 500, 2) +
        Math.pow((f2 - v.f2) / 1500, 2) +
        Math.pow((f3 - v.f3) / 800, 2) * 0.5
      );
    } else {
      d = Math.hypot((f1 - v.f1) / 500, (f2 - v.f2) / 1500);
    }
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  // Add diacritics for precision based on offset from reference
  let diacritics = '';
  if (best) {
    const f1Diff = f1 - best.f1;
    const f2Diff = f2 - best.f2;
    // F1 offset: positive = more open, negative = more close
    if (f1Diff > 60) diacritics += '̞'; // ̞ (lowered/more open)
    else if (f1Diff < -60) diacritics += '̝'; // ̝ (raised/more close)
    // F2 offset: positive = more front, negative = more back
    if (f2Diff > 150) diacritics += '̟'; // ̟ (advanced/more front)
    else if (f2Diff < -150) diacritics += '̠'; // ̠ (retracted/more back)
    // F3 rounding: if F3 provided and vowel is unrounded but F3 is low → add rounded diacritic
    if (f3 !== null && best.f3) {
      const f3Diff = f3 - best.f3;
      if (f3Diff < -200 && !best.name.includes('rounded')) diacritics += '̹'; // ̹ (more rounded)
      else if (f3Diff > 200 && best.name.includes('rounded')) diacritics += '̜'; // ̜ (less rounded)
    }
  }

  return { vowel: best, distance: bestDist, diacritics };
}
