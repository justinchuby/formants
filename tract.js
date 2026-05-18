/**
 * Vocal tract sagittal cross-section renderer.
 *
 * Inspired by Pink Trombone (Neil Thapen) — uses smooth bezier curves,
 * nasal cavity outline, and warm pink/flesh colour scheme.
 *
 * Parameters from formant frequencies:
 *   tongueIndex    – front/back position  (12 = front, 40 = back)
 *   tongueDiameter – height / openness    (1.0 = high/close, 3.5 = low/open)
 */

// ── Constants ────────────────────────────────────────────────────
const TRACT_W = 300;
const TRACT_H = 300;

const N = 44;
const BLADE_START = 10;
const TIP_START = 32;
const LIP_START = 39;
const NOSE_START = 17;
const NOSE_LENGTH = 28;

// ── Colour scheme (warm pink / flesh tones) ─────────────────────
const BG = "#fafafa";
const CAVITY_FILL = "rgba(252, 228, 236, 0.6)";     // light pink fill
const OUTLINE_COLOUR = "#c070c6";                     // Purple-pink (like Pink Trombone)
const TONGUE_COLOUR = "#e8578a";                      // accent pink
const TONGUE_FILL = "rgba(232, 87, 138, 0.15)";
const NOSE_FILL = "rgba(252, 228, 236, 0.4)";
const NOSE_OUTLINE = "rgba(192, 112, 198, 0.6)";
const LABEL_COLOUR = "rgba(0, 0, 0, 0.2)";
const TONGUE_LABEL_COLOUR = "rgba(232, 87, 138, 0.4)";

// ── Polar layout (same geometry as Pink Trombone) ────────────────
const ANGLE_OFFSET = -0.24;
const ANGLE_SCALE = 0.64;
const ORIGIN_X = 0.46;
const ORIGIN_Y = 0.82;
const RADIUS_FRAC = 0.55;
const SCALE_FRAC = 0.115;
const NOSE_OFFSET = 0.8;

// ── Geometry helpers ─────────────────────────────────────────────

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

/** Nose rest diameters (simplified from Pink Trombone). */
function noseRestDiameters() {
  const d = new Float64Array(NOSE_LENGTH);
  for (let i = 0; i < NOSE_LENGTH; i++) {
    const frac = i / NOSE_LENGTH;
    d[i] = Math.min(1.9, 0.4 + 1.6 * frac);
  }
  d[0] = 0.4; // velum opening
  return d;
}

const NOSE_REST = noseRestDiameters();

function targetDiameters(tongueIndex, tongueDiameter) {
  const d = new Float64Array(N);
  for (let i = 0; i < N; i++) d[i] = REST[i];

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

// ── Polar → Cartesian ────────────────────────────────────────────

function polarToXY(i, d, w, h) {
  const angle = ANGLE_OFFSET + (i * ANGLE_SCALE * Math.PI) / (LIP_START - 1);
  const radius = RADIUS_FRAC * h;
  const scale = SCALE_FRAC * h;
  const r = radius - scale * d;
  return {
    x: ORIGIN_X * w + r * Math.cos(angle),
    y: ORIGIN_Y * h - r * Math.sin(angle),
  };
}

/** Get polar coords for nose segments (offset above the oral tract). */
function noseToXY(i, d, w, h) {
  return polarToXY(i + NOSE_START, -NOSE_OFFSET - d * 0.9, w, h);
}

// ── Smoothed path drawing (quadratic bezier between midpoints) ───

/**
 * Draw a smooth curve through an array of {x, y} points using
 * quadratic bezier segments between midpoints.
 */
function smoothPath(ctx, points) {
  if (points.length < 2) return;
  if (points.length === 2) {
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    return;
  }

  ctx.moveTo(points[0].x, points[0].y);

  // First segment: line to midpoint of first two points
  let midX = (points[0].x + points[1].x) / 2;
  let midY = (points[0].y + points[1].y) / 2;
  ctx.lineTo(midX, midY);

  // Middle segments: quadratic bezier with control point at each data point
  for (let i = 1; i < points.length - 1; i++) {
    const nextMidX = (points[i].x + points[i + 1].x) / 2;
    const nextMidY = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, nextMidX, nextMidY);
  }

  // Last segment: line to final point
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
}

// ── Public API ───────────────────────────────────────────────────

export function createTractRenderer(canvas) {
  canvas.width = TRACT_W;
  canvas.height = TRACT_H;
  const ctx = canvas.getContext("2d");

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
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // ── Collect points for smooth curves ──
    const outerPoints = [];  // palate / pharynx (diameter=0)
    const innerPoints = [];  // tongue / inner wall
    for (let i = 1; i < N; i++) {
      outerPoints.push(polarToXY(i, 0, w, h));
      innerPoints.push(polarToXY(i, diam[i], w, h));
    }

    // ── Cavity fill (between outer and inner walls) ──
    ctx.beginPath();
    smoothPath(ctx, outerPoints);
    // Reverse inner points to close the shape
    const innerRev = [...innerPoints].reverse();
    ctx.lineTo(innerRev[0].x, innerRev[0].y);
    smoothPath(ctx, innerRev);
    ctx.closePath();
    ctx.fillStyle = CAVITY_FILL;
    ctx.fill();

    // ── Nasal cavity fill ──
    const noseOuterPoints = [];
    const noseInnerPoints = [];
    for (let i = 1; i < NOSE_LENGTH; i++) {
      noseOuterPoints.push(noseToXY(i, NOSE_REST[i], w, h));
      noseInnerPoints.push(polarToXY(i + NOSE_START, -NOSE_OFFSET, w, h));
    }

    ctx.beginPath();
    smoothPath(ctx, noseInnerPoints);
    const noseOuterRev = [...noseOuterPoints].reverse();
    ctx.lineTo(noseOuterRev[0].x, noseOuterRev[0].y);
    smoothPath(ctx, noseOuterRev);
    ctx.closePath();
    ctx.fillStyle = NOSE_FILL;
    ctx.fill();

    // ── Velum connection (oral cavity to nasal) ──
    const velumOral = polarToXY(NOSE_START - 1, 0, w, h);
    const velumNose = polarToXY(NOSE_START, -NOSE_OFFSET, w, h);
    const velumEnd = polarToXY(NOSE_START + 3, -NOSE_OFFSET, w, h);
    const velumOralEnd = polarToXY(NOSE_START + 2, 0, w, h);

    ctx.beginPath();
    ctx.moveTo(velumOral.x, velumOral.y);
    ctx.lineTo(velumNose.x, velumNose.y);
    ctx.lineTo(velumEnd.x, velumEnd.y);
    ctx.lineTo(velumOralEnd.x, velumOralEnd.y);
    ctx.closePath();
    ctx.fillStyle = NOSE_FILL;
    ctx.fill();

    // ── Outer wall stroke (palate / pharynx) ──
    // Split at velum opening
    const outerPre = [];
    const outerPost = [];
    for (let i = 1; i < N; i++) {
      const p = polarToXY(i, 0, w, h);
      if (i <= NOSE_START - 2) outerPre.push(p);
      else if (i >= NOSE_START + 3) outerPost.push(p);
    }

    ctx.beginPath();
    smoothPath(ctx, outerPre);
    ctx.strokeStyle = OUTLINE_COLOUR;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.beginPath();
    smoothPath(ctx, outerPost);
    ctx.strokeStyle = OUTLINE_COLOUR;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // ── Nasal cavity outlines ──
    ctx.beginPath();
    smoothPath(ctx, noseOuterPoints);
    ctx.strokeStyle = NOSE_OUTLINE;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    smoothPath(ctx, noseInnerPoints);
    ctx.strokeStyle = NOSE_OUTLINE;
    ctx.lineWidth = 2;
    ctx.stroke();

    // ── Velum lines ──
    ctx.beginPath();
    ctx.moveTo(velumOral.x, velumOral.y);
    ctx.lineTo(velumNose.x, velumNose.y);
    ctx.moveTo(velumOralEnd.x, velumOralEnd.y);
    ctx.lineTo(velumEnd.x, velumEnd.y);
    ctx.strokeStyle = NOSE_OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ── Tongue / inner wall stroke (smooth bezier) ──
    ctx.beginPath();
    smoothPath(ctx, innerPoints);
    ctx.strokeStyle = TONGUE_COLOUR;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // ── Tongue fill (below the tongue curve) ──
    ctx.beginPath();
    smoothPath(ctx, innerPoints);
    const lastInner = innerPoints[innerPoints.length - 1];
    const pEnd = polarToXY(N - 1, diam[N - 1] + 2, w, h);
    const pStart = polarToXY(1, diam[0] + 2, w, h);
    ctx.lineTo(pEnd.x, pEnd.y);
    ctx.lineTo(pStart.x, pStart.y);
    ctx.closePath();
    ctx.fillStyle = TONGUE_FILL;
    ctx.fill();

    // ── Tongue position dot ──
    const tp = polarToXY(tIndex, tDiam, w, h);
    const grad = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, 14);
    grad.addColorStop(0, "rgba(232, 87, 138, 0.35)");
    grad.addColorStop(1, "rgba(232, 87, 138, 0)");
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = TONGUE_COLOUR;
    ctx.fill();

    // ── Labels ──
    ctx.fillStyle = LABEL_COLOUR;
    ctx.font = "10px system-ui";
    ctx.textAlign = "center";

    const lipP = polarToXY(N - 1, -0.5, w, h);
    ctx.fillText("lips", lipP.x, lipP.y);

    const throatP = polarToXY(3, -0.8, w, h);
    ctx.fillText("pharynx", throatP.x, throatP.y);

    // Palate label along the outer wall
    const palateP = polarToXY(Math.floor(N * 0.75), -0.4, w, h);
    ctx.fillText("palate", palateP.x, palateP.y);

    // Nasal label
    const nasalP = noseToXY(Math.floor(NOSE_LENGTH * 0.5), NOSE_REST[Math.floor(NOSE_LENGTH * 0.5)] + 0.3, w, h);
    ctx.fillText("nasal", nasalP.x, nasalP.y);

    // Tongue label
    ctx.fillStyle = TONGUE_LABEL_COLOUR;
    ctx.font = "10px system-ui";
    const tongueLabel = polarToXY(
      (BLADE_START + TIP_START) / 2,
      tDiam + 0.8,
      w,
      h,
    );
    ctx.fillText("tongue", tongueLabel.x, tongueLabel.y);
  }

  function update(tongueIndex, tongueDiameter) {
    tongueIndex = Math.max(12, Math.min(40, tongueIndex));
    tongueDiameter = Math.max(1.0, Math.min(3.5, tongueDiameter));

    curIndex += (tongueIndex - curIndex) * 0.3;
    curDiam += (tongueDiameter - curDiam) * 0.3;

    drawTract(curIndex, curDiam);
  }

  function reset() {
    curIndex = 20;
    curDiam = 2.0;
    drawTract(curIndex, curDiam);
  }

  drawTract(curIndex, curDiam);

  return { update, reset };
}

// ── F1/F2 → tongue parameter mapping ────────────────────────────

function clampedLerp(value, inMin, inMax, outMin, outMax) {
  const t = Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));
  return outMin + t * (outMax - outMin);
}

export function formantsToTongue(f1, f2) {
  return {
    tongueDiameter: clampedLerp(f1, 270, 730, 1.0, 3.5),
    tongueIndex: clampedLerp(f2, 870, 2290, 40, 12),
  };
}
