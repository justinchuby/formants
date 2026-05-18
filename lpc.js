/**
 * LPC (Linear Predictive Coding) formant extraction.
 *
 * Pipeline: downsample (44100→11025 Hz) → pre-emphasis → Hamming window →
 * Burg's method → polynomial root finding (Durand-Kerner) → select formants.
 *
 * Burg's method replaces the older autocorrelation + Levinson-Durbin approach.
 * It estimates LPC coefficients directly from the signal without computing
 * autocorrelation first, producing more stable and accurate results.
 */

// ---------------------------------------------------------------------------
// Internal sample rate after downsampling. Nyquist = 5512 Hz covers F1–F3.
// ---------------------------------------------------------------------------
const INTERNAL_SAMPLE_RATE = 11025;
const DOWNSAMPLE_FACTOR = 4; // 44100 / 11025

/**
 * Downsample a signal by an integer factor with anti-aliasing.
 * Uses a simple box (moving-average) low-pass filter before decimation.
 * Good enough for speech formant analysis where we only need < 5 kHz.
 *
 * @param {Float32Array|Float64Array} signal - Input samples
 * @param {number} factor - Decimation factor (e.g. 4 for 44100→11025)
 * @returns {Float64Array} Downsampled signal
 */
function downsample(signal, factor) {
  if (factor <= 1) return Float64Array.from(signal);
  const outLen = Math.floor(signal.length / factor);
  const out = new Float64Array(outLen);
  for (let i = 0; i < outLen; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) {
      sum += signal[i * factor + j];
    }
    out[i] = sum / factor;
  }
  return out;
}

/**
 * Apply pre-emphasis filter: y[n] = x[n] - α * x[n-1]
 */
function preEmphasis(signal, alpha = 0.97) {
  const out = new Float64Array(signal.length);
  out[0] = signal[0];
  for (let i = 1; i < signal.length; i++) {
    out[i] = signal[i] - alpha * signal[i - 1];
  }
  return out;
}

/**
 * Apply Hamming window.
 */
function hammingWindow(signal) {
  const N = signal.length;
  const out = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    out[i] = signal[i] * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1)));
  }
  return out;
}

/**
 * Burg's method for LPC coefficient estimation.
 *
 * Unlike autocorrelation + Levinson-Durbin, Burg's method works directly on
 * the signal and guarantees a minimum-phase, stable result. The algorithm:
 *
 *   1. Initialise forward error ef[] and backward error eb[] to the signal.
 *   2. For each order k = 1 … p:
 *      a. Compute reflection coefficient:
 *         k_m = -2 Σ ef[n]·eb[n-1] / Σ (ef[n]² + eb[n-1]²)
 *      b. Update LPC coefficients a[] using Levinson-style recursion.
 *      c. Update ef[] and eb[] for the next order.
 *   3. Return coefficients a[0..p] (a[0] is unused / = 1 by convention).
 *
 * @param {Float64Array} signal - Windowed signal samples
 * @param {number} order - LPC order (p)
 * @returns {Float64Array} LPC coefficients a[0..order]
 */
function burgMethod(signal, order) {
  const N = signal.length;
  const a = new Float64Array(order + 1);

  // Step 1: initialise forward and backward prediction errors
  let ef = Float64Array.from(signal);
  let eb = Float64Array.from(signal);

  for (let k = 1; k <= order; k++) {
    // Step 2a: compute reflection coefficient k_m
    let num = 0;
    let den = 0;
    for (let n = k; n < N; n++) {
      num += ef[n] * eb[n - 1];
      den += ef[n] * ef[n] + eb[n - 1] * eb[n - 1];
    }
    const km = den > 1e-30 ? (-2 * num) / den : 0;

    // Step 2b: update LPC coefficients (Levinson recursion style)
    // a_new[k] = km
    // a_new[j] = a_old[j] + km * a_old[k-j]   for j = 1..k-1
    const aOld = Float64Array.from(a);
    a[k] = km;
    for (let j = 1; j < k; j++) {
      a[j] = aOld[j] + km * aOld[k - j];
    }

    // Step 2c: update forward and backward errors
    const efNew = new Float64Array(N);
    const ebNew = new Float64Array(N);
    for (let n = k; n < N; n++) {
      efNew[n] = ef[n] + km * eb[n - 1];
      ebNew[n] = eb[n - 1] + km * ef[n];
    }
    ef = efNew;
    eb = ebNew;
  }

  // Negate coefficients to match Levinson-Durbin convention:
  // Burg produces A(z) = 1 + a[1]z^-1 + ..., but findRoots expects
  // A(z) = 1 - a[1]z^-1 - ... (prediction form: x[n] ≈ Σ a[k] x[n-k])
  for (let i = 1; i <= order; i++) {
    a[i] = -a[i];
  }

  return a;
}

/**
 * Find roots of LPC polynomial using Durand-Kerner method.
 * The polynomial is 1 - a[1]*z^-1 - a[2]*z^-2 - ... = 0
 * which we convert to z^p - a[1]*z^(p-1) - ... - a[p] = 0
 *
 * Returns array of {re, im} complex roots.
 */
function findRoots(a, order) {
  const coeffs = new Float64Array(order + 1);
  coeffs[0] = 1;
  for (let i = 1; i <= order; i++) {
    coeffs[i] = -a[i];
  }

  // Initialize roots on a circle with slight perturbation
  const roots = [];
  for (let i = 0; i < order; i++) {
    const angle = (2 * Math.PI * i) / order + 0.01;
    const r = 0.9 + 0.05 * (i / order);
    roots.push({ re: r * Math.cos(angle), im: r * Math.sin(angle) });
  }

  // Durand-Kerner iterations
  const maxIter = 100;
  for (let iter = 0; iter < maxIter; iter++) {
    let maxDelta = 0;
    for (let i = 0; i < order; i++) {
      // Evaluate polynomial at roots[i] using Horner's method
      let pRe = 1;
      let pIm = 0;
      for (let k = 1; k <= order; k++) {
        const newRe = pRe * roots[i].re - pIm * roots[i].im;
        const newIm = pRe * roots[i].im + pIm * roots[i].re;
        pRe = newRe + coeffs[k];
        pIm = newIm;
      }

      // Compute denominator: product of (z_i - z_j) for j != i
      let dRe = 1;
      let dIm = 0;
      for (let j = 0; j < order; j++) {
        if (j === i) continue;
        const diffRe = roots[i].re - roots[j].re;
        const diffIm = roots[i].im - roots[j].im;
        const newDRe = dRe * diffRe - dIm * diffIm;
        const newDIm = dRe * diffIm + dIm * diffRe;
        dRe = newDRe;
        dIm = newDIm;
      }

      const denom = dRe * dRe + dIm * dIm;
      if (denom < 1e-30) continue;
      const deltaRe = (pRe * dRe + pIm * dIm) / denom;
      const deltaIm = (pIm * dRe - pRe * dIm) / denom;

      roots[i].re -= deltaRe;
      roots[i].im -= deltaIm;

      maxDelta = Math.max(maxDelta, Math.hypot(deltaRe, deltaIm));
    }
    if (maxDelta < 1e-10) break;
  }

  return roots;
}

/**
 * Prepare a frame for LPC analysis: downsample → pre-emphasis → Hamming window.
 *
 * @param {Float32Array} frame - Raw audio samples
 * @param {number} sampleRate - Original sample rate (Hz)
 * @returns {{ windowed: Float64Array, effectiveRate: number } | null}
 */
function prepareFrame(frame, sampleRate) {
  // Determine downsample factor (only if original rate is higher than target)
  const factor = Math.max(1, Math.round(sampleRate / INTERNAL_SAMPLE_RATE));
  const effectiveRate = factor > 1 ? sampleRate / factor : sampleRate;

  const ds = downsample(frame, factor);

  // Silence detection
  let energy = 0;
  for (let i = 0; i < ds.length; i++) energy += ds[i] * ds[i];
  if (energy / ds.length < 1e-8) return null;

  const emphasized = preEmphasis(ds);
  const windowed = hammingWindow(emphasized);
  return { windowed, effectiveRate };
}

/**
 * Compute LPC coefficients for a frame of audio.
 * Uses Burg's method on a downsampled (11025 Hz) version of the signal.
 *
 * @param {Float32Array} frame - Audio samples
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} [order=12] - LPC order (12–14 is sufficient at 11025 Hz)
 * @returns {Float64Array | null} LPC coefficients a[0..order], or null on silence
 */
export function getLPCCoefficients(frame, sampleRate, order = 12) {
  const prep = prepareFrame(frame, sampleRate);
  if (!prep) return null;
  if (prep.windowed.length < order + 1) return null;

  return burgMethod(prep.windowed, order);
}

/**
 * Extract formant frequencies from a frame of audio samples.
 *
 * Full pipeline:
 *   raw frame (e.g. 44100 Hz, 2048 samples)
 *   → downsample to ~11025 Hz (~512 samples)
 *   → pre-emphasis (α = 0.97)
 *   → Hamming window
 *   → Burg's method (order 12)
 *   → Durand-Kerner root finding
 *   → filter formant candidates
 *   → return F1 / F2
 *
 * @param {Float32Array} frame - Audio samples (typically 20–30 ms worth)
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} [lpcOrder=12] - LPC order (12–14 sufficient at 11025 Hz)
 * @returns {{ f1: number, f2: number, f3: number|null } | null} Formant frequencies or null
 */
export function extractFormants(frame, sampleRate, lpcOrder = 12) {
  const prep = prepareFrame(frame, sampleRate);
  if (!prep) return null;
  if (prep.windowed.length < lpcOrder + 1) return null;

  const { windowed, effectiveRate } = prep;

  const a = burgMethod(windowed, lpcOrder);
  const roots = findRoots(a, lpcOrder);

  // Convert roots to frequencies, keep only positive-frequency stable roots
  const formants = [];
  for (const root of roots) {
    if (root.im < 0) continue; // Only positive frequencies (conjugate pairs)

    const mag = Math.hypot(root.re, root.im);
    if (mag < 0.3 || mag > 1.0) continue; // Reject unstable / too-damped roots

    const angle = Math.atan2(root.im, root.re);
    const freq = (angle * effectiveRate) / (2 * Math.PI);
    const bandwidth = (-Math.log(mag) * effectiveRate) / Math.PI;

    // Reject if bandwidth too wide (> 400 Hz) or frequency out of range
    if (freq > 50 && freq < effectiveRate / 2 && bandwidth < 600) {
      formants.push({ freq, bandwidth });
    }
  }

  formants.sort((a, b) => a.freq - b.freq);

  if (formants.length < 2) return null;

  // F1 is typically 200–1000 Hz, F2 is 500–3000 Hz
  let f1 = null;
  let f2 = null;
  let f3 = null;
  for (const f of formants) {
    if (f1 === null && f.freq >= 150 && f.freq <= 1000) {
      f1 = f.freq;
    } else if (f1 !== null && f2 === null && f.freq >= 500 && f.freq <= 3000) {
      f2 = f.freq;
    } else if (f2 !== null && f3 === null && f.freq >= 1500 && f.freq <= 4500) {
      f3 = f.freq;
    }
  }

  if (f1 === null || f2 === null) return null;

  return { f1, f2, f3 };
}
