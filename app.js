import { VOWELS, findNearestVowel } from "./vowels.js";
import { extractFormants, getLPCCoefficients } from "./lpc.js";
import { createTractRenderer, formantsToTongue } from "./tract.js";
import { createSpectrumRenderer } from "./spectrum.js";

// ── Chart configuration ──────────────────────────────────────────
const CANVAS_W = 520;
const CANVAS_H = 480;
const PADDING = { top: 40, right: 40, bottom: 50, left: 60 };

// Formant axis ranges (note: F2 is reversed on x-axis, F1 on y-axis)
const F1_MIN = 200;
const F1_MAX = 800;
const F2_MIN = 600;
const F2_MAX = 2500;

// Trace settings
const MAX_TRACE_POINTS = 200;
const TRACE_LINE_WIDTH = 2;

// ── State ────────────────────────────────────────────────────────
let audioCtx = null;
let analyserNode = null;
let sourceNode = null;
let stream = null;
let isRecording = false;
let animFrameId = null;

let currentFormants = null;
let tracePoints = []; // Array of { x, y, f1, f2, time }

// ── DOM elements ─────────────────────────────────────────────────
const canvas = document.getElementById("chart");
const ctx = canvas.getContext("2d");
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

const symbolEl = document.getElementById("vowel-symbol");
const nameEl = document.getElementById("vowel-name");
const f1ValueEl = document.getElementById("f1-value");
const f2ValueEl = document.getElementById("f2-value");
const btnRecord = document.getElementById("btn-record");
const btnClear = document.getElementById("btn-clear");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");

// ── Coordinate mapping ──────────────────────────────────────────
// Vowel chart: F2 (high→low) on x-axis, F1 (low→high) on y-axis
function f2ToX(f2) {
  const plotW = CANVAS_W - PADDING.left - PADDING.right;
  return PADDING.left + (1 - (f2 - F2_MIN) / (F2_MAX - F2_MIN)) * plotW;
}

function f1ToY(f1) {
  const plotH = CANVAS_H - PADDING.top - PADDING.bottom;
  return PADDING.top + ((f1 - F1_MIN) / (F1_MAX - F1_MIN)) * plotH;
}

// ── Drawing ─────────────────────────────────────────────────────
function drawChart() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Background
  ctx.fillStyle = "#12121a";
  ctx.beginPath();
  ctx.roundRect(0, 0, CANVAS_W, CANVAS_H, 8);
  ctx.fill();

  drawGrid();
  drawVowelPositions();
  drawTrace();
  drawCurrentPoint();
}

function drawGrid() {
  ctx.strokeStyle = "#ffffff08";
  ctx.lineWidth = 1;

  // F2 axis lines (vertical)
  for (let f2 = 800; f2 <= 2400; f2 += 400) {
    const x = f2ToX(f2);
    ctx.beginPath();
    ctx.moveTo(x, PADDING.top);
    ctx.lineTo(x, CANVAS_H - PADDING.bottom);
    ctx.stroke();

    ctx.fillStyle = "#ffffff30";
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(`${f2}`, x, CANVAS_H - PADDING.bottom + 18);
  }

  // F1 axis lines (horizontal)
  for (let f1 = 200; f1 <= 800; f1 += 200) {
    const y = f1ToY(f1);
    ctx.beginPath();
    ctx.moveTo(PADDING.left, y);
    ctx.lineTo(CANVAS_W - PADDING.right, y);
    ctx.stroke();

    ctx.fillStyle = "#ffffff30";
    ctx.font = "11px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(`${f1}`, PADDING.left - 10, y + 4);
  }

  // Axis labels
  ctx.fillStyle = "#ffffff50";
  ctx.font = "12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("F2 (Hz) →", CANVAS_W / 2, CANVAS_H - 6);

  ctx.save();
  ctx.translate(14, CANVAS_H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("F1 (Hz) →", 0, 0);
  ctx.restore();

  // "Front" / "Back" / "Close" / "Open" labels
  ctx.fillStyle = "#ffffff18";
  ctx.font = "11px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Front", f2ToX(2200), PADDING.top - 10);
  ctx.fillText("Back", f2ToX(900), PADDING.top - 10);
  ctx.textAlign = "right";
  ctx.fillText("Close", PADDING.left - 10, PADDING.top - 6);
  ctx.fillText("Open", PADDING.left - 10, CANVAS_H - PADDING.bottom + 36);
}

function drawVowelPositions() {
  for (const v of VOWELS) {
    const x = f2ToX(v.f2);
    const y = f1ToY(v.f1);

    // Dot
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff25";
    ctx.fill();

    // Label
    ctx.fillStyle = "#ffffff60";
    ctx.font = "16px serif";
    ctx.textAlign = "center";
    ctx.fillText(v.symbol, x, y - 10);
  }
}

function drawTrace() {
  if (tracePoints.length < 2) return;

  const now = performance.now();

  for (let i = 1; i < tracePoints.length; i++) {
    const prev = tracePoints[i - 1];
    const curr = tracePoints[i];
    const age = (now - curr.time) / 1000; // seconds
    const alpha = Math.max(0.03, 1 - age / 8); // Fade over 8 seconds

    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(curr.x, curr.y);
    ctx.strokeStyle = `rgba(110, 231, 183, ${alpha * 0.6})`;
    ctx.lineWidth = TRACE_LINE_WIDTH * alpha + 0.5;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  // Draw small dots along trace
  for (let i = 0; i < tracePoints.length; i++) {
    const pt = tracePoints[i];
    const age = (now - pt.time) / 1000;
    const alpha = Math.max(0.02, 1 - age / 8);

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 1.5 * alpha + 0.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(110, 231, 183, ${alpha * 0.5})`;
    ctx.fill();
  }
}

function drawCurrentPoint() {
  if (!currentFormants) return;

  const x = f2ToX(currentFormants.f2);
  const y = f1ToY(currentFormants.f1);

  // Glow
  const grad = ctx.createRadialGradient(x, y, 0, x, y, 20);
  grad.addColorStop(0, "rgba(110, 231, 183, 0.4)");
  grad.addColorStop(1, "rgba(110, 231, 183, 0)");
  ctx.beginPath();
  ctx.arc(x, y, 20, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Main dot
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#6ee7b7";
  ctx.fill();

  // White center
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

// ── Audio processing ────────────────────────────────────────────
const FRAME_SIZE = 1024; // ~23ms at 44100Hz
const timeDomainBuffer = new Float32Array(FRAME_SIZE * 2);

// Smoothing for formant values (simple exponential)
let smoothF1 = 0;
let smoothF2 = 0;
const SMOOTH_ALPHA = 0.35; // 0 = no smoothing, 1 = no change

function processAudio() {
  if (!isRecording) return;
  try {

  analyserNode.getFloatTimeDomainData(timeDomainBuffer);

  // Skip if signal is too quiet (noise floor)
  let rms = 0;
  for (let i = 0; i < timeDomainBuffer.length; i++) {
    rms += timeDomainBuffer[i] * timeDomainBuffer[i];
  }
  rms = Math.sqrt(rms / timeDomainBuffer.length);
  const isSilent = rms < 0.01; // ~-40 dB threshold

  // Get FFT frequency data for spectrum display
  if (!fftBuffer) fftBuffer = new Float32Array(analyserNode.frequencyBinCount);
  analyserNode.getFloatFrequencyData(fftBuffer);

  const result = isSilent ? null : extractFormants(timeDomainBuffer, audioCtx.sampleRate);

  // Get LPC coefficients for spectrum envelope
  const lpcCoeffs = getLPCCoefficients(timeDomainBuffer, audioCtx.sampleRate);


  if (result) {
    // Apply smoothing
    if (smoothF1 === 0) {
      smoothF1 = result.f1;
      smoothF2 = result.f2;
    } else {
      smoothF1 = smoothF1 * SMOOTH_ALPHA + result.f1 * (1 - SMOOTH_ALPHA);
      smoothF2 = smoothF2 * SMOOTH_ALPHA + result.f2 * (1 - SMOOTH_ALPHA);
    }

    currentFormants = { f1: smoothF1, f2: smoothF2 };

    // Add to trace
    const x = f2ToX(smoothF1 > 0 ? smoothF2 : 0);
    const y = f1ToY(smoothF1);
    tracePoints.push({ x, y, f1: smoothF1, f2: smoothF2, time: performance.now() });
    if (tracePoints.length > MAX_TRACE_POINTS) {
      tracePoints.shift();
    }

    // Update UI
    const { vowel } = findNearestVowel(smoothF1, smoothF2);
    symbolEl.textContent = vowel.symbol;
    symbolEl.classList.remove("silent");
    nameEl.textContent = vowel.name;
    f1ValueEl.textContent = `${Math.round(smoothF1)} Hz`;
    f2ValueEl.textContent = `${Math.round(smoothF2)} Hz`;

    // Update vocal tract
    const tongue = formantsToTongue(smoothF1, smoothF2);
    tractRenderer.update(tongue.tongueIndex, tongue.tongueDiameter);
  } else {
    currentFormants = null;
    symbolEl.classList.add("silent");
    // Keep last tongue position during silence
  }

  drawChart();

  // Update spectrum display
  spectrumRenderer.draw(fftBuffer, audioCtx.sampleRate, lpcCoeffs, currentFormants);

  } catch (err) {
    if (!window._errorLogged) {
      console.error('[Formants] processAudio error:', err);
      window._errorLogged = true;
    }
  }
  animFrameId = requestAnimationFrame(processAudio);
}

// ── Controls ────────────────────────────────────────────────────
async function startRecording() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
      },
    });

    audioCtx = new AudioContext();
    await audioCtx.resume(); // Chrome autoplay policy requires explicit resume
    sourceNode = audioCtx.createMediaStreamSource(stream);
    
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = FRAME_SIZE * 2;
    // timeDomainBuffer must match fftSize
    sourceNode.connect(analyserNode);
    // Some browsers require connection to destination for processing
    // Use a silent gain node to avoid feedback
    const silentGain = audioCtx.createGain();
    silentGain.gain.value = 0;
    analyserNode.connect(silentGain);
    silentGain.connect(audioCtx.destination);

    isRecording = true;
    smoothF1 = 0;
    smoothF2 = 0;

    btnRecord.textContent = "Stop";
    btnRecord.classList.add("active");
    statusDot.classList.add("live");
    statusText.textContent = "Listening…";

    // Delay start to let audio pipeline warm up
    setTimeout(() => {
      animFrameId = requestAnimationFrame(processAudio);
    }, 500);
  } catch (err) {
    statusText.textContent = `Mic error: ${err.message}`;
  }
}

function stopRecording() {
  isRecording = false;
  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  if (audioCtx) audioCtx.close();

  currentFormants = null;
  btnRecord.textContent = "Start";
  btnRecord.classList.remove("active");
  statusDot.classList.remove("live");
  statusText.textContent = "Ready";
  symbolEl.classList.add("silent");
  tractRenderer.reset();

  drawChart(); // Final redraw showing trace
}

btnRecord.addEventListener("click", () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

btnClear.addEventListener("click", () => {
  tracePoints = [];
  currentFormants = null;
  smoothF1 = 0;
  smoothF2 = 0;
  symbolEl.textContent = "·";
  symbolEl.classList.add("silent");
  nameEl.textContent = "";
  f1ValueEl.textContent = "—";
  f2ValueEl.textContent = "—";
  tractRenderer.reset();
  drawChart();
});

// ── Tract renderer ──────────────────────────────────────────────
const tractCanvas = document.getElementById("tract");
const tractRenderer = createTractRenderer(tractCanvas);

// ── Spectrum renderer ───────────────────────────────────────────
const spectrumCanvas = document.getElementById("spectrum");
const spectrumRenderer = createSpectrumRenderer(spectrumCanvas);
let fftBuffer = null; // Allocated on start

// ── Initial draw ────────────────────────────────────────────────
drawChart();
