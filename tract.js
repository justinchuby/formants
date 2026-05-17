/**
 * Simplified vocal tract sagittal cross-section renderer.
 *
 * Draws a fixed oral cavity outline (palate, pharynx, lips) and a
 * deformable tongue surface whose shape is controlled by two parameters
 * derived from formant frequencies:
 *
 *   tongueIndex    – front/back position  (12 = front, 40 = back)
 *   tongueDiameter – height / openness    (1.0 = high/close, 3.5 = low/open)
 *
 * Mapping from F1/F2:
 *   diameter = lerp(F1, [270,730], [1.0, 3.5])
 *   index    = lerp(F2, [870,2290], [40, 12])
 */

// ── Constants ────────────────────────────────────────────────────
const TRACT_W = 300;
const TRACT_H = 300;

// Tract simulation parameters (from Pink Trombone)
const N = 44; // number of tract segments
const BLADE_START = 10;
const TIP_START = 32;
const LIP_START = 39;

// ── Colour scheme (matches formant chart dark theme) ─────────────
const BG = "#12121a";
const CAVITY_FILL = "rgba(110, 231, 183, 0.08)";
const OUTLINE_COLOUR = "rgba(110, 231, 183, 0.5)";
const TONGUE_COLOUR = "rgba(110, 231, 183, 0.85)";
const TONGUE_FILL = "rgba(110, 231, 183, 0.15)";
const LABEL_COLOUR = "rgba(255, 255, 255, 0.25)";

// ── Geometry helpers ─────────────────────────────────────────────

/**
 * Compute the rest diameter for each tract section (simplified from
 * Pink Trombone's Tract.init).
 */
function restDiameters() {
  const d = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    if (i < (7 * N) / 44 - 0.5) d[i] = 0.6;
    else if (i < (12 * N) / 44) d[i] = 1.1;
    else d[i] = 1.5;
  }
  return d;
}

const REST = restDiameters();

/**
 * Build target diameters given tongue position.  Closely follows
 * TractUI.setRestDiameter in the Pink Trombone source.
 */
function targetDiameters(tongueIndex, tongueDiameter) {
  const d = new Float64Array(N);
  for (let i = 0; i < N; i++) d[i] = REST[i];

  // Tongue shape (gaussian-ish influence)
  for (let i = BLADE_START; i < LIP_START; i++) {
    const t = (1.1 * Math.PI * (tongueIndex - i)) / (TIP_START - BLADE_START);
    const fixedDiam = REST[i];
    let curve = (1.5 - fixedDiam + tongueDiameter) * Math.cos(t);
    if (i === BLADE_START - 1 || i === LIP_START) curve *= 0.8;
    if (i === BLADE_START || i === LIP_START - 1) curve *= 0.94;
    d[i] = Math.max(0, fixedDiam + curve);
  }
  return d;
}

// ── Polar → Cartesian (same layout as Pink Trombone) ─────────────
const ANGLE_OFFSET = -0.24;
const ANGLE_SCALE = 0.64;
const ORIGIN_X = 0.46; // fraction of canvas width
const ORIGIN_Y = 0.82; // fraction of canvas height
const RADIUS_FRAC = 0.55; // fraction of canvas height
const SCALE_FRAC = 0.115; // diameter → pixel scale (fraction of h)

function polarToXY(i, d, w, h) {
  const angle =
    ANGLE_OFFSET + (i * ANGLE_SCALE * Math.PI) / (LIP_START - 1);
  const radius = RADIUS_FRAC * h;
  const scale = SCALE_FRAC * h;
  const r = radius - scale * d;
  return {
    x: ORIGIN_X * w + r * Math.cos(angle),
    y: ORIGIN_Y * h - r * Math.sin(angle),
  };
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Initialise a tract renderer on the given canvas element.
 * Returns an object with an `update(tongueIndex, tongueDiameter)` method.
 */
export function createTractRenderer(canvas) {
  canvas.width = TRACT_W;
  canvas.height = TRACT_H;
  const ctx = canvas.getContext("2d");

  // Current animated values (for smoothing)
  let curIndex = 20;
  let curDiam = 2.0;

  function drawTract(tIndex, tDiam) {
    const w = TRACT_W;
    const h = TRACT_H;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = BG;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 8);
    ctx.fill();

    const diam = targetDiameters(tIndex, tDiam);

    // ── Draw cavity fill ──
    ctx.beginPath();
    ctx.fillStyle = CAVITY_FILL;
    let p = polarToXY(1, 0, w, h);
    ctx.moveTo(p.x, p.y);
    for (let i = 1; i < N; i++) {
      p = polarToXY(i, diam[i], w, h);
      ctx.lineTo(p.x, p.y);
    }
    for (let i = N - 1; i >= 1; i--) {
      p = polarToXY(i, 0, w, h);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();

    // ── Draw outer wall (palate / pharynx) ──
    ctx.beginPath();
    ctx.strokeStyle = OUTLINE_COLOUR;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    p = polarToXY(1, 0, w, h);
    ctx.moveTo(p.x, p.y);
    for (let i = 2; i < N; i++) {
      p = polarToXY(i, 0, w, h);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // ── Draw tongue / inner wall ──
    ctx.beginPath();
    ctx.strokeStyle = TONGUE_COLOUR;
    ctx.fillStyle = TONGUE_FILL;
    ctx.lineWidth = 2.5;
    p = polarToXY(1, diam[0], w, h);
    ctx.moveTo(p.x, p.y);
    for (let i = 2; i < N; i++) {
      p = polarToXY(i, diam[i], w, h);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // Fill below tongue
    ctx.beginPath();
    p = polarToXY(1, diam[0], w, h);
    ctx.moveTo(p.x, p.y);
    for (let i = 2; i < N; i++) {
      p = polarToXY(i, diam[i], w, h);
      ctx.lineTo(p.x, p.y);
    }
    // close back to glottis via bottom
    const pEnd = polarToXY(N - 1, diam[N - 1] + 2, w, h);
    ctx.lineTo(pEnd.x, pEnd.y);
    const pStart = polarToXY(1, diam[0] + 2, w, h);
    ctx.lineTo(pStart.x, pStart.y);
    ctx.closePath();
    ctx.fillStyle = TONGUE_FILL;
    ctx.fill();

    // ── Tongue position indicator (dot) ──
    const tp = polarToXY(tIndex, tDiam, w, h);
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = TONGUE_COLOUR;
    ctx.fill();

    // Glow around tongue dot
    const grad = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, 14);
    grad.addColorStop(0, "rgba(110, 231, 183, 0.35)");
    grad.addColorStop(1, "rgba(110, 231, 183, 0)");
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // ── Labels ──
    ctx.fillStyle = LABEL_COLOUR;
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";

    // "lips" near the end
    const lipP = polarToXY(N - 1, -0.5, w, h);
    ctx.fillText("lips", lipP.x, lipP.y);

    // "throat" near the start
    const throatP = polarToXY(3, -0.8, w, h);
    ctx.fillText("throat", throatP.x, throatP.y);

    // "tongue" label
    ctx.fillStyle = "rgba(110, 231, 183, 0.4)";
    ctx.font = "10px system-ui";
    const tongueLabel = polarToXY(
      (BLADE_START + TIP_START) / 2,
      tDiam + 0.8,
      w,
      h,
    );
    ctx.fillText("tongue", tongueLabel.x, tongueLabel.y);
  }

  /**
   * Update the tract display.
   * @param {number} tongueIndex  – 12 (front) to 40 (back)
   * @param {number} tongueDiameter – 1.0 (high/close) to 3.5 (low/open)
   */
  function update(tongueIndex, tongueDiameter) {
    // Clamp
    tongueIndex = Math.max(12, Math.min(40, tongueIndex));
    tongueDiameter = Math.max(1.0, Math.min(3.5, tongueDiameter));

    // Light smoothing for animation
    curIndex += (tongueIndex - curIndex) * 0.3;
    curDiam += (tongueDiameter - curDiam) * 0.3;

    drawTract(curIndex, curDiam);
  }

  /** Reset to neutral position. */
  function reset() {
    curIndex = 20;
    curDiam = 2.0;
    drawTract(curIndex, curDiam);
  }

  // Initial draw
  drawTract(curIndex, curDiam);

  return { update, reset };
}

// ── F1/F2 → tongue parameter mapping ────────────────────────────

function clampedLerp(value, inMin, inMax, outMin, outMax) {
  const t = Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));
  return outMin + t * (outMax - outMin);
}

/**
 * Convert F1/F2 frequencies to tongue parameters.
 * @param {number} f1 – First formant in Hz
 * @param {number} f2 – Second formant in Hz
 * @returns {{ tongueIndex: number, tongueDiameter: number }}
 */
export function formantsToTongue(f1, f2) {
  return {
    tongueDiameter: clampedLerp(f1, 270, 730, 1.0, 3.5),
    tongueIndex: clampedLerp(f2, 870, 2290, 40, 12),
  };
}
