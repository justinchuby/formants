/**
 * Real-time spectrum display: FFT magnitude (pink fill) + LPC envelope (blue dashed)
 * with formant markers. Warm cream/pink colour scheme.
 */

const SPEC_PADDING = { top: 20, right: 20, bottom: 45, left: 55 };
const FREQ_MAX = 5000;
const DB_MIN = -100;
const DB_MAX = 0;

// ── Colours ──────────────────────────────────────────────────────
const SPEC_BG = "#fafafa";
const GRID_STROKE = "rgba(0, 0, 0, 0.06)";
const GRID_TEXT = "rgba(0, 0, 0, 0.3)";
const AXIS_LABEL = "rgba(0, 0, 0, 0.4)";
const FFT_FILL = "rgba(232, 87, 138, 0.2)";
const FFT_STROKE = "rgba(232, 87, 138, 0.65)";
const LPC_STROKE = "rgba(74, 144, 217, 0.9)";
const FORMANT_LINE = "rgba(232, 87, 138, 0.7)";
const FORMANT_TEXT = "rgba(232, 87, 138, 0.9)";

function lpcFrequencyResponse(a, sampleRate, numPoints, freqMax) {
  const order = a.length - 1;
  const result = new Float64Array(numPoints);

  for (let i = 0; i < numPoints; i++) {
    const freq = (i / (numPoints - 1)) * freqMax;
    const omega = (2 * Math.PI * freq) / sampleRate;

    let realA = 1;
    let imagA = 0;
    for (let k = 1; k <= order; k++) {
      realA -= a[k] * Math.cos(k * omega);
      imagA += a[k] * Math.sin(k * omega);
    }

    const mag = Math.sqrt(realA * realA + imagA * imagA);
    result[i] = mag > 1e-10 ? -20 * Math.log10(mag) : DB_MIN;
  }

  return result;
}

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

  function freqToX(f, w) {
    const plotW = w - SPEC_PADDING.left - SPEC_PADDING.right;
    return SPEC_PADDING.left + (f / FREQ_MAX) * plotW;
  }

  function dbToY(db, h) {
    const plotH = h - SPEC_PADDING.top - SPEC_PADDING.bottom;
    return SPEC_PADDING.top + (1 - (db - DB_MIN) / (DB_MAX - DB_MIN)) * plotH;
  }

  function drawAxes(w, h) {
    ctx.strokeStyle = GRID_STROKE;
    ctx.lineWidth = 1;
    ctx.fillStyle = GRID_TEXT;
    ctx.font = "11px system-ui";

    ctx.textAlign = "center";
    for (let f = 0; f <= FREQ_MAX; f += 1000) {
      const x = freqToX(f, w);
      ctx.beginPath();
      ctx.moveTo(x, SPEC_PADDING.top);
      ctx.lineTo(x, h - SPEC_PADDING.bottom);
      ctx.stroke();
      ctx.fillText(`${f}`, x, h - SPEC_PADDING.bottom + 16);
    }

    ctx.textAlign = "right";
    for (let db = DB_MIN; db <= DB_MAX; db += 10) {
      const y = dbToY(db, h);
      ctx.beginPath();
      ctx.moveTo(SPEC_PADDING.left, y);
      ctx.lineTo(w - SPEC_PADDING.right, y);
      ctx.stroke();
      ctx.fillText(`${db}`, SPEC_PADDING.left - 6, y + 4);
    }

    ctx.fillStyle = AXIS_LABEL;
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Frequency (Hz)", w / 2, h - 4);

    ctx.save();
    ctx.translate(14, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Amplitude (dB)", 0, 0);
    ctx.restore();
  }

  function draw(fftData, sampleRate, lpcCoeffs, formants) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = SPEC_BG;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 8);
    ctx.fill();

    drawAxes(w, h);

    const plotBottom = h - SPEC_PADDING.bottom;
    const binCount = fftData.length;
    const nyquist = sampleRate / 2;
    const maxBin = Math.min(binCount, Math.ceil((FREQ_MAX / nyquist) * binCount));

    // ── FFT spectrum fill ───────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(freqToX(0, w), plotBottom);

    for (let i = 0; i <= maxBin; i++) {
      const freq = (i / binCount) * nyquist;
      const db = Math.max(DB_MIN, Math.min(DB_MAX, fftData[i]));
      ctx.lineTo(freqToX(freq, w), dbToY(db, h));
    }

    ctx.lineTo(freqToX((maxBin / binCount) * nyquist, w), plotBottom);
    ctx.closePath();
    ctx.fillStyle = FFT_FILL;
    ctx.fill();

    // FFT stroke
    ctx.beginPath();
    for (let i = 0; i <= maxBin; i++) {
      const freq = (i / binCount) * nyquist;
      const db = Math.max(DB_MIN, Math.min(DB_MAX, fftData[i]));
      const x = freqToX(freq, w);
      const y = dbToY(db, h);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = FFT_STROKE;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ── LPC envelope (blue dashed) ──────────────────────────────
    if (lpcCoeffs) {
      const numPoints = 256;
      const envelope = lpcFrequencyResponse(lpcCoeffs, sampleRate, numPoints, FREQ_MAX);

      const binLo = Math.round((100 / nyquist) * binCount);
      const binHi = Math.min(maxBin, Math.round((4000 / nyquist) * binCount));
      let fftMax = -Infinity;
      for (let i = binLo; i <= binHi; i++) {
        if (fftData[i] > fftMax) fftMax = fftData[i];
      }

      let lpcMax = -Infinity;
      for (let i = 0; i < numPoints; i++) {
        if (envelope[i] > lpcMax) lpcMax = envelope[i];
      }
      const offset = fftMax - lpcMax;

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
      ctx.strokeStyle = LPC_STROKE;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Formant markers ─────────────────────────────────────────
    if (formants) {
      const fList = [
        { freq: formants.f1, label: "F1" },
        { freq: formants.f2, label: "F2" },
        ...(formants.f3 ? [{ freq: formants.f3, label: "F3" }] : []),
      ];

      for (const { freq, label } of fList) {
        if (freq <= 0 || freq > FREQ_MAX) continue;
        const x = freqToX(freq, w);

        ctx.beginPath();
        ctx.moveTo(x, SPEC_PADDING.top);
        ctx.lineTo(x, plotBottom);
        ctx.strokeStyle = FORMANT_LINE;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = FORMANT_TEXT;
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
