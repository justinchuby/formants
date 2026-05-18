/**
 * Real-time spectrum display: FFT magnitude (pink fill) + LPC envelope (blue dashed)
 * with formant markers.
 */

const SPEC_PADDING = { top: 20, right: 20, bottom: 45, left: 55 };
const FREQ_MAX = 5000; // Hz
const DB_MIN = -100;
const DB_MAX = 0;

/**
 * Compute LPC frequency response magnitude in dB.
 *
 * H(f) = 1 / |A(e^{j2πf/fs})| where A(z) = 1 - a[1]z^-1 - ... - a[p]z^-p
 *
 * @param {Float64Array} a - LPC coefficients (a[0] unused, a[1..order])
 * @param {number} sampleRate
 * @param {number} numPoints - Number of frequency bins to evaluate
 * @param {number} freqMax - Maximum frequency
 * @returns {Float64Array} dB values at evenly-spaced frequencies 0..freqMax
 */
function lpcFrequencyResponse(a, sampleRate, numPoints, freqMax) {
  const order = a.length - 1;
  const result = new Float64Array(numPoints);

  for (let i = 0; i < numPoints; i++) {
    const freq = (i / (numPoints - 1)) * freqMax;
    const omega = (2 * Math.PI * freq) / sampleRate;

    // A(e^{jω}) = 1 - Σ a[k] e^{-jkω}
    let realA = 1;
    let imagA = 0;
    for (let k = 1; k <= order; k++) {
      realA -= a[k] * Math.cos(k * omega);
      imagA += a[k] * Math.sin(k * omega);
    }

    const mag = Math.sqrt(realA * realA + imagA * imagA);
    // H(f) = 1/|A|, convert to dB; add offset to align with FFT level
    result[i] = mag > 1e-10 ? -20 * Math.log10(mag) : DB_MIN;
  }

  return result;
}

/**
 * Create a spectrum renderer bound to a canvas element.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {{ draw(fftData: Float32Array, sampleRate: number, lpcCoeffs: Float64Array|null, formants: {f1:number,f2:number}|null): void }}
 */
export function createSpectrumRenderer(canvas) {
  const ctx = canvas.getContext("2d");

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();
  window.addEventListener("resize", resize);

  /** Map frequency to x pixel (CSS coords). */
  function freqToX(f, w) {
    const plotW = w - SPEC_PADDING.left - SPEC_PADDING.right;
    return SPEC_PADDING.left + (f / FREQ_MAX) * plotW;
  }

  /** Map dB to y pixel. */
  function dbToY(db, h) {
    const plotH = h - SPEC_PADDING.top - SPEC_PADDING.bottom;
    return SPEC_PADDING.top + (1 - (db - DB_MIN) / (DB_MAX - DB_MIN)) * plotH;
  }

  function drawAxes(w, h) {
    ctx.strokeStyle = "#ffffff10";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#ffffff40";
    ctx.font = "11px system-ui";

    // Frequency ticks
    ctx.textAlign = "center";
    for (let f = 0; f <= FREQ_MAX; f += 1000) {
      const x = freqToX(f, w);
      ctx.beginPath();
      ctx.moveTo(x, SPEC_PADDING.top);
      ctx.lineTo(x, h - SPEC_PADDING.bottom);
      ctx.stroke();
      ctx.fillText(`${f}`, x, h - SPEC_PADDING.bottom + 16);
    }

    // dB ticks
    ctx.textAlign = "right";
    for (let db = DB_MIN; db <= DB_MAX; db += 10) {
      const y = dbToY(db, h);
      ctx.beginPath();
      ctx.moveTo(SPEC_PADDING.left, y);
      ctx.lineTo(w - SPEC_PADDING.right, y);
      ctx.stroke();
      ctx.fillText(`${db}`, SPEC_PADDING.left - 6, y + 4);
    }

    // Axis labels
    ctx.fillStyle = "#ffffff50";
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Frequency (Hz)", w / 2, h - 4);

    ctx.save();
    ctx.translate(14, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Amplitude (dB)", 0, 0);
    ctx.restore();
  }

  /**
   * @param {Float32Array} fftData - from analyserNode.getFloatFrequencyData
   * @param {number} sampleRate
   * @param {Float64Array|null} lpcCoeffs - LPC a[] coefficients
   * @param {{ f1: number, f2: number } | null} formants
   */
  function draw(fftData, sampleRate, lpcCoeffs, formants) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "#12121a";
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 8);
    ctx.fill();

    drawAxes(w, h);

    const plotBottom = h - SPEC_PADDING.bottom;
    const binCount = fftData.length;
    const nyquist = sampleRate / 2;
    const maxBin = Math.min(binCount, Math.ceil((FREQ_MAX / nyquist) * binCount));

    // ── FFT spectrum (pink fill) ────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(freqToX(0, w), plotBottom);

    for (let i = 0; i <= maxBin; i++) {
      const freq = (i / binCount) * nyquist;
      const db = Math.max(DB_MIN, Math.min(DB_MAX, fftData[i]));
      ctx.lineTo(freqToX(freq, w), dbToY(db, h));
    }

    // Close the path along the bottom
    ctx.lineTo(freqToX((maxBin / binCount) * nyquist, w), plotBottom);
    ctx.closePath();

    ctx.fillStyle = "rgba(255, 130, 171, 0.25)";
    ctx.fill();

    // Stroke the top edge
    ctx.beginPath();
    for (let i = 0; i <= maxBin; i++) {
      const freq = (i / binCount) * nyquist;
      const db = Math.max(DB_MIN, Math.min(DB_MAX, fftData[i]));
      const x = freqToX(freq, w);
      const y = dbToY(db, h);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(255, 130, 171, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ── LPC envelope (blue dashed) ──────────────────────────────
    if (lpcCoeffs) {
      const numPoints = 256;
      const envelope = lpcFrequencyResponse(lpcCoeffs, sampleRate, numPoints, FREQ_MAX);

      // Compute offset: align LPC envelope with FFT mean level
      // Average FFT dB in 200-4000 Hz range
      let fftSum = 0;
      let fftCount = 0;
      const binLo = Math.round((200 / nyquist) * binCount);
      const binHi = Math.min(maxBin, Math.round((4000 / nyquist) * binCount));
      for (let i = binLo; i <= binHi; i++) {
        fftSum += fftData[i];
        fftCount++;
      }
      const fftMean = fftCount > 0 ? fftSum / fftCount : 0;

      let lpcSum = 0;
      let lpcCount = 0;
      const ptLo = Math.round((200 / FREQ_MAX) * (numPoints - 1));
      const ptHi = Math.round((4000 / FREQ_MAX) * (numPoints - 1));
      for (let i = ptLo; i <= ptHi; i++) {
        lpcSum += envelope[i];
        lpcCount++;
      }
      const lpcMean = lpcCount > 0 ? lpcSum / lpcCount : 0;
      const offset = fftMean - lpcMean;

      ctx.beginPath();
      ctx.setLineDash([6, 4]);
      for (let i = 0; i < numPoints; i++) {
        const freq = (i / (numPoints - 1)) * FREQ_MAX;
        const db = Math.max(DB_MIN, Math.min(DB_MAX, envelope[i] + offset));
        const x = freqToX(freq, w);
        const y = dbToY(db, h);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(96, 165, 250, 0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Formant markers ─────────────────────────────────────────
    if (formants) {
      const fList = [
        { freq: formants.f1, label: "F1" },
        { freq: formants.f2, label: "F2" },
      ];

      for (const { freq, label } of fList) {
        if (freq <= 0 || freq > FREQ_MAX) continue;
        const x = freqToX(freq, w);

        ctx.beginPath();
        ctx.moveTo(x, SPEC_PADDING.top);
        ctx.lineTo(x, plotBottom);
        ctx.strokeStyle = "rgba(74, 222, 128, 0.7)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = "rgba(74, 222, 128, 0.9)";
        ctx.font = "bold 11px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(`${label}`, x, SPEC_PADDING.top - 5);
        ctx.font = "10px system-ui";
        ctx.fillText(`${Math.round(freq)}`, x, SPEC_PADDING.top + 12);
      }
    }
  }

  return { draw };
}
