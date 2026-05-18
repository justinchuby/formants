import { VOWELS, findNearestVowel } from "./vowels.js";
import { extractFormants, getLPCCoefficients } from "./lpc.js";
import { createTractRenderer, formantsToTongue } from "./tract.js";
import { createSpectrumRenderer } from "./spectrum.js";

// ── Chart configuration ──────────────────────────────────────────
const CANVAS_W = 520;
const CANVAS_H = 480;
const PADDING = { top: 40, right: 40, bottom: 50, left: 60 };

const F1_MIN = 200;
const F1_MAX = 800;
const F2_MIN = 600;
const F2_MAX = 2500;

const MAX_TRACE_POINTS = 200;
const TRACE_LINE_WIDTH = 2;

// ── Colours (warm pink theme) ────────────────────────────────────
const CHART_BG = "#fafafa";
const GRID_LINE = "rgba(0, 0, 0, 0.05)";
const GRID_TEXT = "rgba(0, 0, 0, 0.3)";
const AXIS_LABEL = "rgba(0, 0, 0, 0.4)";
const REGION_LABEL = "rgba(0, 0, 0, 0.12)";
const VOWEL_DOT = "#888888";
const VOWEL_LABEL = "rgba(0, 0, 0, 0.5)";
const ACCENT = "#e8578a";
const ACCENT_TRACE = (a) => `rgba(232, 87, 138, ${a})`;

// ── State ────────────────────────────────────────────────────────
let audioCtx = null;
let analyserNode = null;
let sourceNode = null;
let stream = null;
let isRecording = false;
let animFrameId = null;

let currentFormants = null;
let tracePoints = [];

// ── DOM elements ─────────────────────────────────────────────────
const canvas = document.getElementById("chart");
const ctx = canvas.getContext("2d");
const dpr = window.devicePixelRatio || 1;
canvas.width = CANVAS_W * dpr;
canvas.height = CANVAS_H * dpr;
canvas.style.width = CANVAS_W + 'px';
canvas.style.height = CANVAS_H + 'px';
ctx.scale(dpr, dpr);

const symbolEl = document.getElementById("vowel-symbol");
const nameEl = document.getElementById("vowel-name");
const f1ValueEl = document.getElementById("f1-value");
const f2ValueEl = document.getElementById("f2-value");
const f3ValueEl = document.getElementById("f3-value");
const btnRecord = document.getElementById("btn-record");
const btnClear = document.getElementById("btn-clear");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");

// ── Modal ────────────────────────────────────────────────────────
const modalOverlay = document.getElementById("modal-overlay");
const btnInfo = document.getElementById("btn-info");
const modalClose = document.getElementById("modal-close");

btnInfo.addEventListener("click", () => modalOverlay.classList.add("visible"));
modalClose.addEventListener("click", () => modalOverlay.classList.remove("visible"));
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) modalOverlay.classList.remove("visible");
});

// ── Auto-start ────────────────────────────────────────────────────
const startOverlay = document.getElementById("start-overlay");
let hasStarted = false;
let isPaused = false;

// Auto-start recording on page load (user interaction still needed for mic permission)
async function autoStart() {
  if (hasStarted) return;
  hasStarted = true;
  if (startOverlay) {
    startOverlay.classList.add("hidden");
    setTimeout(() => { startOverlay.style.display = "none"; }, 300);
  }
  await startRecording();
}
autoStart();

// ── Coordinate mapping ──────────────────────────────────────────
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

  ctx.fillStyle = CHART_BG;
  ctx.beginPath();
  ctx.roundRect(0, 0, CANVAS_W, CANVAS_H, 8);
  ctx.fill();

  drawGrid();
  drawVowelPositions();
  drawTrace();
  drawCurrentPoint();
}

function drawGrid() {
  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth = 1;

  for (let f2 = 800; f2 <= 2400; f2 += 400) {
    const x = f2ToX(f2);
    ctx.beginPath();
    ctx.moveTo(x, PADDING.top);
    ctx.lineTo(x, CANVAS_H - PADDING.bottom);
    ctx.stroke();

    ctx.fillStyle = GRID_TEXT;
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(`${f2}`, x, CANVAS_H - PADDING.bottom + 18);
  }

  for (let f1 = 200; f1 <= 800; f1 += 200) {
    const y = f1ToY(f1);
    ctx.beginPath();
    ctx.moveTo(PADDING.left, y);
    ctx.lineTo(CANVAS_W - PADDING.right, y);
    ctx.stroke();

    ctx.fillStyle = GRID_TEXT;
    ctx.font = "11px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(`${f1}`, PADDING.left - 10, y + 4);
  }

  ctx.fillStyle = AXIS_LABEL;
  ctx.font = "12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("F2 (Hz) →", CANVAS_W / 2, CANVAS_H - 6);

  ctx.save();
  ctx.translate(14, CANVAS_H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("F1 (Hz) →", 0, 0);
  ctx.restore();

  ctx.fillStyle = REGION_LABEL;
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

    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = VOWEL_DOT;
    ctx.fill();

    ctx.fillStyle = VOWEL_LABEL;
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
    const age = (now - curr.time) / 1000;
    const alpha = Math.max(0.03, 1 - age / 8);

    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(curr.x, curr.y);
    ctx.strokeStyle = ACCENT_TRACE(alpha * 0.6);
    ctx.lineWidth = TRACE_LINE_WIDTH * alpha + 0.5;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  for (let i = 0; i < tracePoints.length; i++) {
    const pt = tracePoints[i];
    const age = (now - pt.time) / 1000;
    const alpha = Math.max(0.02, 1 - age / 8);

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 1.5 * alpha + 0.5, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT_TRACE(alpha * 0.5);
    ctx.fill();
  }
}

function drawCurrentPoint() {
  if (!currentFormants) return;

  const x = f2ToX(currentFormants.f2);
  const y = f1ToY(currentFormants.f1);

  const grad = ctx.createRadialGradient(x, y, 0, x, y, 20);
  grad.addColorStop(0, "rgba(232, 87, 138, 0.4)");
  grad.addColorStop(1, "rgba(232, 87, 138, 0)");
  ctx.beginPath();
  ctx.arc(x, y, 20, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fillStyle = ACCENT;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

// ── Audio processing ────────────────────────────────────────────
const FRAME_SIZE = 1024;
const timeDomainBuffer = new Float32Array(FRAME_SIZE * 2);

let smoothF1 = 0;
let smoothF2 = 0;
const SMOOTH_ALPHA = 0.35;

function processAudio() {
  if (!isRecording) return;
  try {

  analyserNode.getFloatTimeDomainData(timeDomainBuffer);

  let rms = 0;
  for (let i = 0; i < timeDomainBuffer.length; i++) {
    rms += timeDomainBuffer[i] * timeDomainBuffer[i];
  }
  rms = Math.sqrt(rms / timeDomainBuffer.length);
  const isSilent = rms < 0.006; // ~-45 dB threshold

  if (!fftBuffer) fftBuffer = new Float32Array(analyserNode.frequencyBinCount);
  analyserNode.getFloatFrequencyData(fftBuffer);

  const result = isSilent ? null : extractFormants(timeDomainBuffer, audioCtx.sampleRate);

  // Clear median history during silence to prevent stale values
  if (isSilent) {
    window._f1History = [];
    window._f2History = [];
  }

  if (!window._f1History) window._f1History = [];
  if (!window._f2History) window._f2History = [];
  const MEDIAN_LEN = 5;

  if (result) {
    window._f1History.push(result.f1);
    window._f2History.push(result.f2);
    if (window._f1History.length > MEDIAN_LEN) window._f1History.shift();
    if (window._f2History.length > MEDIAN_LEN) window._f2History.shift();

    const sorted1 = [...window._f1History].sort((a, b) => a - b);
    const sorted2 = [...window._f2History].sort((a, b) => a - b);
    const mid = Math.floor(sorted1.length / 2);
    result.f1 = sorted1[mid];
    result.f2 = sorted2[mid];
  }

  const lpcCoeffs = getLPCCoefficients(timeDomainBuffer, audioCtx.sampleRate);

  if (result) {
    if (smoothF1 === 0) {
      smoothF1 = result.f1;
      smoothF2 = result.f2;
    } else {
      smoothF1 = smoothF1 * SMOOTH_ALPHA + result.f1 * (1 - SMOOTH_ALPHA);
      smoothF2 = smoothF2 * SMOOTH_ALPHA + result.f2 * (1 - SMOOTH_ALPHA);
    }

    currentFormants = { f1: smoothF1, f2: smoothF2, f3: result.f3 || null };

    const x = f2ToX(smoothF1 > 0 ? smoothF2 : 0);
    const y = f1ToY(smoothF1);
    tracePoints.push({ x, y, f1: smoothF1, f2: smoothF2, time: performance.now() });
    if (tracePoints.length > MAX_TRACE_POINTS) {
      tracePoints.shift();
    }

    const { vowel } = findNearestVowel(smoothF1, smoothF2, result.f3 || null);
    symbolEl.textContent = vowel.symbol;
    symbolEl.classList.remove("silent");
    nameEl.textContent = vowel.name;
    f1ValueEl.textContent = `${Math.round(smoothF1)} Hz`;
    f2ValueEl.textContent = `${Math.round(smoothF2)} Hz`;
    if (f3ValueEl) f3ValueEl.textContent = result.f3 ? `${Math.round(result.f3)} Hz` : "—";

    const tongue = formantsToTongue(smoothF1, smoothF2);
    tractRenderer.update(tongue.tongueIndex, tongue.tongueDiameter);
  } else {
    currentFormants = null;
    symbolEl.classList.add("silent");
  }

  drawChart();
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
    await audioCtx.resume();
    sourceNode = audioCtx.createMediaStreamSource(stream);

    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = FRAME_SIZE * 2;
    sourceNode.connect(analyserNode);
    const silentGain = audioCtx.createGain();
    silentGain.gain.value = 0;
    analyserNode.connect(silentGain);
    silentGain.connect(audioCtx.destination);

    isRecording = true;
    isPaused = false;
    smoothF1 = 0;
    smoothF2 = 0;

    btnRecord.textContent = "Pause";
    btnRecord.classList.add("active");
    statusDot.classList.add("live");
    statusText.textContent = "Listening…";

    setTimeout(() => {
      animFrameId = requestAnimationFrame(processAudio);
    }, 500);
  } catch (err) {
    statusText.textContent = `Mic error: ${err.message}`;
  }
}

function pauseRecording() {
  isPaused = true;
  isRecording = false;
  if (animFrameId) cancelAnimationFrame(animFrameId);
  animFrameId = null;

  currentFormants = null;
  btnRecord.textContent = "Resume";
  btnRecord.classList.remove("active");
  statusDot.classList.remove("live");
  statusText.textContent = "Paused";
  symbolEl.classList.add("silent");

  drawChart();
}

function resumeRecording() {
  if (!audioCtx || !analyserNode) return;
  isPaused = false;
  isRecording = true;
  smoothF1 = 0;
  smoothF2 = 0;

  btnRecord.textContent = "Pause";
  btnRecord.classList.add("active");
  statusDot.classList.add("live");
  statusText.textContent = "Listening…";

  animFrameId = requestAnimationFrame(processAudio);
}

btnRecord.addEventListener("click", () => {
  if (!hasStarted) return;
  if (isRecording) {
    pauseRecording();
  } else {
    resumeRecording();
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
let fftBuffer = null;

// ── Initial draw ────────────────────────────────────────────────
drawChart();
