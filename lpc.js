/**
 * LPC (Linear Predictive Coding) formant extraction.
 *
 * Pipeline: pre-emphasis → Hamming window → autocorrelation →
 * Levinson-Durbin → polynomial root finding → select formants.
 */

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
 * Apply Hamming window in-place.
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
 * Compute autocorrelation coefficients R[0..order].
 */
function autocorrelation(signal, order) {
  const R = new Float64Array(order + 1);
  const N = signal.length;
  for (let k = 0; k <= order; k++) {
    let sum = 0;
    for (let i = 0; i < N - k; i++) {
      sum += signal[i] * signal[i + k];
    }
    R[k] = sum;
  }
  return R;
}

/**
 * Levinson-Durbin recursion to compute LPC coefficients from autocorrelation.
 * Returns array of LPC coefficients a[1..order].
 */
function levinsonDurbin(R, order) {
  const a = new Float64Array(order + 1);
  const aTemp = new Float64Array(order + 1);
  let E = R[0];

  if (E === 0) return a;

  for (let i = 1; i <= order; i++) {
    let lambda = 0;
    for (let j = 1; j < i; j++) {
      lambda += a[j] * R[i - j];
    }
    lambda = (R[i] - lambda) / E;

    aTemp.set(a);
    a[i] = lambda;
    for (let j = 1; j < i; j++) {
      a[j] = aTemp[j] - lambda * aTemp[i - j];
    }
    E *= 1 - lambda * lambda;
    if (E <= 0) break;
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
  // Coefficients of z^order + c[1]*z^(order-1) + ... + c[order] = 0
  // From LPC: A(z) = 1 - a1*z^-1 - ... - ap*z^-p
  // Multiply by z^p: z^p - a1*z^(p-1) - ... - ap = 0
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
      // Evaluate polynomial at roots[i]
      let pRe = coeffs[0];
      let pIm = 0;
      let zRe = 1;
      let zIm = 0;

      // We need to evaluate in descending power order
      // p(z) = z^n + c1*z^(n-1) + ... + cn
      pRe = 1;
      pIm = 0;
      for (let k = 1; k <= order; k++) {
        // Multiply by z
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

      // delta = p(z_i) / denominator
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
 * Extract formant frequencies from a frame of audio samples.
 *
 * @param {Float32Array} frame - Audio samples (typically 20-30ms worth)
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} [lpcOrder=12] - LPC order (rule of thumb: 2 + sampleRate/1000)
 * @returns {{ f1: number, f2: number } | null} - Formant frequencies or null if detection fails
 */
export function extractFormants(frame, sampleRate, lpcOrder = 12) {
  if (frame.length < lpcOrder + 1) return null;

  // Check if frame has enough energy (silence detection)
  let energy = 0;
  for (let i = 0; i < frame.length; i++) {
    energy += frame[i] * frame[i];
  }
  energy /= frame.length;
  if (energy < 1e-6) return null;

  // LPC pipeline
  const emphasized = preEmphasis(frame);
  const windowed = hammingWindow(emphasized);
  const R = autocorrelation(windowed, lpcOrder);

  if (R[0] === 0) return null;

  const a = levinsonDurbin(R, lpcOrder);
  const roots = findRoots(a, lpcOrder);

  // Convert roots to frequencies, keep only positive-frequency stable roots
  const formants = [];
  for (const root of roots) {
    if (root.im < 0) continue; // Only positive frequencies (conjugate pairs)

    const mag = Math.hypot(root.re, root.im);
    if (mag < 0.5 || mag > 1.0) continue; // Reject unstable/too-damped roots

    const angle = Math.atan2(root.im, root.re);
    const freq = (angle * sampleRate) / (2 * Math.PI);
    const bandwidth = (-Math.log(mag) * sampleRate) / Math.PI;

    // Reject if bandwidth too wide (> 400 Hz) or frequency out of range
    if (freq > 50 && freq < sampleRate / 2 && bandwidth < 400) {
      formants.push({ freq, bandwidth });
    }
  }

  // Sort by frequency
  formants.sort((a, b) => a.freq - b.freq);

  if (formants.length < 2) return null;

  // F1 is typically 200-1000 Hz, F2 is 500-3000 Hz
  let f1 = null;
  let f2 = null;
  for (const f of formants) {
    if (f1 === null && f.freq >= 150 && f.freq <= 1000) {
      f1 = f.freq;
    } else if (f1 !== null && f2 === null && f.freq >= 500 && f.freq <= 3000) {
      f2 = f.freq;
    }
  }

  if (f1 === null || f2 === null) return null;

  return { f1, f2 };
}
