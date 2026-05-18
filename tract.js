/**
 * Vocal tract renderer — Pink Trombone-style polar arc visualization.
 *
 * Closely follows the drawing approach from Neil Thapen's Pink Trombone:
 * polar coordinate system where 44 segments curve from glottis (bottom)
 * around to lips (left), with outer wall (palate/pharynx) and inner wall
 * (tongue surface) enclosing the pink-filled cavity.
 *
 * API:  createTractRenderer(canvas) → { update(tongueIndex, tongueDiameter), reset() }
 *
 * tongueIndex:    12 (front) … 40 (back) — position along the arc
 * tongueDiameter: 1.0 (high/close) … 3.5 (low/open) — tube narrowing
 */

// ── Tract geometry constants ─────────────────────────────────────
const N = 44;                 // number of tract segments
const BLADE_START = 10;
const TIP_START = 32;
const LIP_START = 39;
const NOSE_START = 17;
const NOSE_LENGTH = 28;
const NOSE_OFFSET = 0.8;     // how far above oral tract the nose sits

// ── Canvas dimensions ────────────────────────────────────────────
const W = 600;
const H = 500;

// ── Polar layout (matches Pink Trombone's TractUI) ───────────────
const ORIGIN = { x: 340, y: 460 };
const RADIUS = 298;           // base radius of the arc
const SCALE = 60;             // diameter→pixel scaling
const ANGLE_SCALE = 0.64;
const ANGLE_OFFSET = -0.25;

// ── Colour palette ───────────────────────────────────────────────
const BG              = "#fafafa";
const CAVITY_FILL     = "rgba(232, 87, 138, 0.15)";  // light pink cavity
const PALATE_STROKE   = "#a855f7";                     // purple outer wall
const TONGUE_STROKE   = "#e8578a";                     // pink inner wall
const TONGUE_DOT      = "#e8578a";                     // tongue position
const NOSE_FILL       = "rgba(168, 85, 247, 0.08)";   // very light purple
const NOSE_STROKE     = "rgba(168, 85, 247, 0.45)";   // lighter purple
const TONGUE_CTRL_BG  = "#ffeef5";                     // pale pink tongue zone
const TONGUE_CTRL_DOT = "rgba(168, 85, 247, 0.3)";    // orchid grid dots
const LABEL_COLOUR    = "rgba(120, 120, 120, 0.45)";

// ── Rest diameters for 44 segments ───────────────────────────────

function restDiameters() {
  const d = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    if (i < 7 - 0.5)       d[i] = 0.6;
    else if (i < 12)        d[i] = 1.1;
    else                    d[i] = 1.5;
  }
  // Lip flare
  d[N - 1] = 1.5;
  return d;
}

const REST = restDiameters();

function noseRestDiameters() {
  const d = new Float64Array(NOSE_LENGTH);
  for (let i = 0; i < NOSE_LENGTH; i++) {
    d[i] = Math.min(1.9, 0.4 + 1.6 * (i / NOSE_LENGTH));
  }
  d[0] = 0.4;
  return d;
}

const NOSE_REST = noseRestDiameters();

/** Compute tract diameters with tongue shaping applied. */
function targetDiameters(tongueIndex, tongueDiameter) {
  const d = new Float64Array(N);
  for (let i = 0; i < N; i++) d[i] = REST[i];

  for (let i = BLADE_START; i < LIP_START; i++) {
    const t = (1.1 * Math.PI * (tongueIndex - i)) / (TIP_START - BLADE_START);
    const fixed = REST[i];
    let curve = (1.5 - fixed + tongueDiameter) * Math.cos(t);
    if (i === BLADE_START - 1 || i === LIP_START) curve *= 0.8;
    if (i === BLADE_START || i === LIP_START - 1) curve *= 0.94;
    d[i] = Math.max(0, fixed + curve);
  }
  return d;
}

// ── Polar coordinate helpers (same math as Pink Trombone) ────────

function getAngle(index) {
  return ANGLE_OFFSET + (index * ANGLE_SCALE * Math.PI) / (LIP_START - 1);
}

function getRadius(diameter) {
  return RADIUS - SCALE * (3.5 - diameter);
}

function toXY(index, diameter) {
  const angle = getAngle(index);
  const r = getRadius(diameter);
  return {
    x: ORIGIN.x - r * Math.cos(angle),
    y: ORIGIN.y - r * Math.sin(angle),
  };
}

function noseXY(noseIndex, noseDiam) {
  return toXY(noseIndex + NOSE_START, -NOSE_OFFSET - noseDiam * 0.9);
}

function noseFloorXY(noseIndex) {
  return toXY(noseIndex + NOSE_START, -NOSE_OFFSET);
}

// ── Smooth path via quadratic bezier between midpoints ───────────

function drawSmoothPath(ctx, pts, isMove) {
  if (pts.length < 2) return;
  if (isMove !== false) ctx.moveTo(pts[0].x, pts[0].y);
  else ctx.lineTo(pts[0].x, pts[0].y);

  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    return;
  }

  let mx = (pts[0].x + pts[1].x) / 2;
  let my = (pts[0].y + pts[1].y) / 2;
  ctx.lineTo(mx, my);

  for (let i = 1; i < pts.length - 1; i++) {
    const nx = (pts[i].x + pts[i + 1].x) / 2;
    const ny = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, nx, ny);
  }

  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}

// ── Main renderer ────────────────────────────────────────────────

export function createTractRenderer(canvas) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  let curIndex = 20;
  let curDiam = 2.0;

  // Tongue control zone boundaries (Pink Trombone style)
  const tongueMinIdx = 12;
  const tongueMaxIdx = 40;
  const tongueMinDiam = 2.05;
  const tongueMaxDiam = 3.5;
  const tongueCenterIdx = (tongueMinIdx + tongueMaxIdx) / 2;

  function draw(tIdx, tDiam) {
    const diam = targetDiameters(tIdx, tDiam);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // ── 1. Tongue control zone (pale pink background region) ─────
    drawTongueControl(ctx, tIdx, tDiam);

    // ── 2. Collect wall points ───────────────────────────────────
    const outer = [];  // palate/pharynx wall (diameter = 0)
    const inner = [];  // tongue/inner wall
    for (let i = 1; i < N; i++) {
      outer.push(toXY(i, 0));
      inner.push(toXY(i, diam[i]));
    }

    // ── 3. Cavity fill (between walls) ──────────────────────────
    ctx.beginPath();
    drawSmoothPath(ctx, outer, true);
    const innerRev = [...inner].reverse();
    ctx.lineTo(innerRev[0].x, innerRev[0].y);
    drawSmoothPath(ctx, innerRev, false);
    ctx.closePath();
    ctx.fillStyle = CAVITY_FILL;
    ctx.fill();

    // ── 4. Nasal cavity ─────────────────────────────────────────
    drawNasalCavity(ctx, diam);

    // ── 5. Outer wall stroke (purple) — split at velum opening ──
    const velumAngle = NOSE_REST[0] * 4;
    const prePts = [];
    const postPts = [];
    for (let i = 2; i < N; i++) {
      const p = toXY(i, 0);
      if (i <= NOSE_START - 2) prePts.push(p);
      else if (i >= NOSE_START + Math.ceil(velumAngle)) postPts.push(p);
    }

    ctx.strokeStyle = PALATE_STROKE;
    ctx.lineWidth = 3;

    ctx.beginPath();
    drawSmoothPath(ctx, prePts, true);
    ctx.stroke();

    ctx.beginPath();
    drawSmoothPath(ctx, postPts, true);
    ctx.stroke();

    // ── 6. Inner wall / tongue stroke (pink) ────────────────────
    ctx.beginPath();
    drawSmoothPath(ctx, inner, true);
    ctx.strokeStyle = TONGUE_STROKE;
    ctx.lineWidth = 3;
    ctx.stroke();

    // ── 7. Tongue position dot ──────────────────────────────────
    drawTongueDot(ctx, tIdx, tDiam);

    // ── 8. Labels ───────────────────────────────────────────────
    drawLabels(ctx, diam);
  }

  function drawTongueControl(ctx, tIdx, tDiam) {
    // Pale pink background zone for tongue control (like Pink Trombone)
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = TONGUE_CTRL_BG;
    ctx.fillStyle = TONGUE_CTRL_BG;
    ctx.globalAlpha = 1.0;
    ctx.lineWidth = 45;

    ctx.beginPath();
    let p = toXY(tongueMinIdx, tongueMinDiam);
    ctx.moveTo(p.x, p.y);
    for (let i = tongueMinIdx + 1; i <= tongueMaxIdx; i++) {
      p = toXY(i, tongueMinDiam);
      ctx.lineTo(p.x, p.y);
    }
    p = toXY(tongueCenterIdx, tongueMaxDiam);
    ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();

    // Grid dots
    ctx.fillStyle = TONGUE_CTRL_DOT;
    ctx.globalAlpha = 0.4;
    const offsets = [0, -4.25, -8.5, 4.25, 8.5, -6.1, 6.1, 0, 0];
    offsets.forEach((off, idx) => {
      const d = idx < 5 ? tongueMinDiam : idx < 7 ? (tongueMinDiam + tongueMaxDiam) / 2 : tongueMaxDiam;
      const pt = toXY(tongueCenterIdx + off, d);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Tongue control circle (outline around current tongue position)
    const tp = toXY(tIdx, tDiam);
    ctx.strokeStyle = PALATE_STROKE;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = PALATE_STROKE;
    ctx.fill();

    ctx.restore();
  }

  function drawNasalCavity(ctx, diam) {
    // Nasal cavity shape
    const nFloor = [];
    const nCeil = [];
    for (let i = 1; i < NOSE_LENGTH; i++) {
      nFloor.push(noseFloorXY(i));
      nCeil.push(noseXY(i, NOSE_REST[i]));
    }

    // Fill
    ctx.beginPath();
    drawSmoothPath(ctx, nFloor, true);
    const nCeilRev = [...nCeil].reverse();
    ctx.lineTo(nCeilRev[0].x, nCeilRev[0].y);
    drawSmoothPath(ctx, nCeilRev, false);
    ctx.closePath();
    ctx.fillStyle = NOSE_FILL;
    ctx.fill();

    // Velum connection
    const velumAngle = NOSE_REST[0] * 4;
    const v0 = toXY(NOSE_START - 2, 0);
    const v1 = noseFloorXY(0);
    const v2 = noseFloorXY(Math.floor(velumAngle));
    const v3 = toXY(NOSE_START + Math.floor(velumAngle) - 2, 0);

    ctx.beginPath();
    ctx.moveTo(v0.x, v0.y);
    ctx.lineTo(v1.x, v1.y);
    ctx.lineTo(v2.x, v2.y);
    ctx.lineTo(v3.x, v3.y);
    ctx.closePath();
    ctx.fillStyle = NOSE_FILL;
    ctx.fill();

    // Nose outlines (lighter purple)
    ctx.strokeStyle = NOSE_STROKE;
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    drawSmoothPath(ctx, nCeil, true);
    ctx.stroke();

    ctx.beginPath();
    drawSmoothPath(ctx, nFloor, true);
    ctx.stroke();

    // Velum lines
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(v0.x, v0.y);
    ctx.lineTo(v1.x, v1.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(v3.x, v3.y);
    ctx.lineTo(v2.x, v2.y);
    ctx.stroke();
  }

  function drawTongueDot(ctx, tIdx, tDiam) {
    const tp = toXY(tIdx, tDiam);

    // Soft glow
    const grad = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, 20);
    grad.addColorStop(0, "rgba(232, 87, 138, 0.3)");
    grad.addColorStop(1, "rgba(232, 87, 138, 0)");
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 20, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Solid dot
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = TONGUE_DOT;
    ctx.fill();
  }

  function drawLabels(ctx, diam) {
    ctx.save();
    ctx.fillStyle = LABEL_COLOUR;
    ctx.font = "13px system-ui, sans-serif";
    ctx.textAlign = "center";

    // Rotated labels along the tract
    function arcLabel(index, diameter, text) {
      const angle = getAngle(index);
      const r = getRadius(diameter);
      const x = ORIGIN.x - r * Math.cos(angle);
      const y = ORIGIN.y - r * Math.sin(angle);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle - Math.PI / 2);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    arcLabel(N * 0.1, 0.5, "throat");
    arcLabel(N * 0.95, 0.8 + 0.8 * diam[N - 1], "lips");

    ctx.font = "14px system-ui, sans-serif";
    arcLabel(N * 0.6, 1.0, "oral");
    arcLabel(N * 0.7, 1.0, "cavity");

    ctx.font = "13px system-ui, sans-serif";
    arcLabel(N * 0.71, -1.7, "nasal");
    arcLabel(N * 0.71, -1.25, "cavity");

    ctx.restore();
  }

  // ── Public interface ──────────────────────────────────────────

  function update(tongueIndex, tongueDiameter) {
    tongueIndex = Math.max(12, Math.min(40, tongueIndex));
    tongueDiameter = Math.max(1.0, Math.min(3.5, tongueDiameter));

    curIndex += (tongueIndex - curIndex) * 0.3;
    curDiam += (tongueDiameter - curDiam) * 0.3;

    draw(curIndex, curDiam);
  }

  function reset() {
    curIndex = 20;
    curDiam = 2.0;
    draw(curIndex, curDiam);
  }

  // Initial draw
  draw(curIndex, curDiam);

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
