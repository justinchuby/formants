// tract.js — Pink Trombone-style vocal tract renderer
// Faithfully reproduces the coordinate system from TractUI.js / yacavone's version
// Mouth on left, throat on right

const TRACT_LENGTH = 44;
const LIP_START = 39;
const NOSE_START = 17; // Tract.n - noseLength + 1 = 44 - 28 + 1
const NOSE_LENGTH = 28;
const NOSE_OFFSET = 0.8;

// Yacavone coordinate system: origin on right side, +cos goes left toward mouth
const ORIGIN_X = 260; // 600 - 340
const ORIGIN_Y = 449;
const RADIUS = 298;
const SCALE = 60;
const ANGLE_SCALE = 0.64;
const ANGLE_OFFSET = -0.24;

const FILL_COLOR = 'pink';
const STROKE_COLOR = '#C070C6';
const LINE_WIDTH = 5;

// Tongue control bounds (same as Pink Trombone)
const TONGUE_INDEX_MIN = 12;  // bladeStart + 2
const TONGUE_INDEX_MAX = 29;  // tipStart - 3
const TONGUE_DIAMETER_MIN = 0.4;
const TONGUE_DIAMETER_MAX = 2.8;

// Fixed nose diameters (precomputed from Pink Trombone formula)
const NOSE_DIAMETERS = new Float64Array(NOSE_LENGTH);
(() => {
  for (let i = 0; i < NOSE_LENGTH; i++) {
    const d = 2 * (i / NOSE_LENGTH);
    let diameter;
    if (d < 1) diameter = 0.4 + 1.6 * d;
    else diameter = 0.5 + 1.5 * (2 - d);
    diameter = Math.min(diameter, 1.9);
    NOSE_DIAMETERS[i] = diameter;
  }
  NOSE_DIAMETERS[0] = 0.4; // velum closed by default
})();

function getAngle(index) {
  return ANGLE_OFFSET + (index * ANGLE_SCALE * Math.PI) / (LIP_START - 1);
}

function getRadius(diameter) {
  return RADIUS - SCALE * diameter;
}

function getX(angle, radius) {
  return ORIGIN_X + radius * Math.cos(angle);
}

function getY(angle, radius) {
  return ORIGIN_Y - radius * Math.sin(angle);
}

// Compute tract diameters from tongue position
function computeDiameters(tongueIndex, tongueDiameter) {
  const d = new Float64Array(TRACT_LENGTH);

  // Rest diameter (from Pink Trombone setRestDiameter logic)
  for (let i = 0; i < TRACT_LENGTH; i++) {
    if (i < 7) {
      // Throat/glottis region: fixed narrow
      d[i] = 1.0;
    } else if (i < 11) {
      // Epiglottis transition
      d[i] = 1.2;
    } else {
      d[i] = 1.5;
    }
  }

  // Tongue influence (gaussian-ish, same as Pink Trombone)
  // Pink Trombone uses: diameter = fixedDiameter + tongueCurve
  // where tongueCurve is based on distance from tongueIndex
  const tongueWidth = 8; // approximate influence width
  for (let i = TONGUE_INDEX_MIN - 4; i < TRACT_LENGTH; i++) {
    if (i === 0) continue;
    const dist = Math.abs(i - tongueIndex);
    if (dist < tongueWidth) {
      const t = 1 - dist / tongueWidth;
      const influence = t * t; // quadratic falloff
      d[i] = d[i] + (tongueDiameter - d[i]) * influence;
    }
  }

  // Tip: smooth toward lip
  const lipIndex = Math.floor((TRACT_LENGTH + LIP_START) / 2);
  const lipConst = 4 / ((TRACT_LENGTH - LIP_START + 2) * (TRACT_LENGTH - LIP_START + 2));
  for (let i = LIP_START; i < TRACT_LENGTH; i++) {
    const t = (i - lipIndex) * (i - lipIndex) * lipConst;
    // Lip area tapers
    d[i] = Math.max(d[i], 1.0 + t * 0.5);
  }

  // Clamp: tongue cannot cross outer wall (diameter >= small positive)
  for (let i = 0; i < TRACT_LENGTH; i++) {
    d[i] = Math.max(0.05, Math.min(MAX_DIAMETER, d[i]));
  }

  return d;
}

const MAX_DIAMETER = 3.5;

function drawTract(ctx, diameters, canvasWidth, canvasHeight) {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const velum = NOSE_DIAMETERS[0];
  const velumAngle = velum * 4;

  // === 1. Pink fill: main tract cavity ===
  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = FILL_COLOR;
  ctx.fillStyle = FILL_COLOR;

  // Start at index=1, diameter=0 (outer wall)
  let a = getAngle(1);
  let r = getRadius(0);
  ctx.moveTo(getX(a, r), getY(a, r));

  // Inner wall (tongue side) forward — shows the cavity opening
  for (let i = 1; i < TRACT_LENGTH; i++) {
    a = getAngle(i);
    r = getRadius(diameters[i]);
    ctx.lineTo(getX(a, r), getY(a, r));
  }

  // Outer wall (palate) backward — diameter=0
  for (let i = TRACT_LENGTH - 1; i >= 2; i--) {
    a = getAngle(i);
    r = getRadius(0);
    ctx.lineTo(getX(a, r), getY(a, r));
  }

  ctx.closePath();
  ctx.stroke();
  ctx.fill();

  // === 2. Nose fill ===
  ctx.beginPath();
  ctx.fillStyle = FILL_COLOR;
  // Inner nose wall (further from origin)
  moveTo(ctx, NOSE_START, -NOSE_OFFSET);
  for (let i = 1; i < NOSE_LENGTH; i++) {
    lineTo(ctx, i + NOSE_START, -NOSE_OFFSET - NOSE_DIAMETERS[i] * 0.9);
  }
  // Outer nose wall (closer to main tract)
  for (let i = NOSE_LENGTH - 1; i >= 1; i--) {
    lineTo(ctx, i + NOSE_START, -NOSE_OFFSET);
  }
  ctx.closePath();
  ctx.fill();

  // === 3. Velum connection ===
  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = FILL_COLOR;
  ctx.fillStyle = FILL_COLOR;
  moveTo(ctx, NOSE_START - 2, 0);
  lineTo(ctx, NOSE_START, -NOSE_OFFSET);
  lineTo(ctx, NOSE_START + velumAngle, -NOSE_OFFSET);
  lineTo(ctx, NOSE_START + velumAngle - 2, 0);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();

  // === 4. Labels ===
  ctx.fillStyle = 'white';
  ctx.font = '20px Arial';
  ctx.textAlign = 'center';
  ctx.globalAlpha = 1.0;
  drawText(ctx, TRACT_LENGTH * 0.10, 0.425, 'throat');
  drawText(ctx, TRACT_LENGTH * 0.71, -1.8, 'nasal');
  drawText(ctx, TRACT_LENGTH * 0.71, -1.3, 'cavity');
  ctx.font = '22px Arial';
  drawText(ctx, TRACT_LENGTH * 0.60, 0.9, 'oral');
  drawText(ctx, TRACT_LENGTH * 0.70, 0.9, 'cavity');

  // === 5. Purple outlines — inner wall (tongue) ===
  ctx.beginPath();
  ctx.lineWidth = LINE_WIDTH;
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  moveTo(ctx, 1, diameters[0]);
  for (let i = 2; i < TRACT_LENGTH; i++) {
    lineTo(ctx, i, diameters[i]);
  }

  // Outer wall (palate) — with velum gap
  moveTo(ctx, 1, 0);
  for (let i = 2; i <= NOSE_START - 2; i++) {
    lineTo(ctx, i, 0);
  }
  moveTo(ctx, NOSE_START + velumAngle - 2, 0);
  for (let i = NOSE_START + Math.ceil(velumAngle) - 2; i < TRACT_LENGTH; i++) {
    lineTo(ctx, i, 0);
  }
  ctx.stroke();

  // === 6. Nose outlines ===
  ctx.beginPath();
  ctx.lineWidth = LINE_WIDTH;
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineJoin = 'round';

  // Inner nose wall
  moveTo(ctx, NOSE_START, -NOSE_OFFSET);
  for (let i = 1; i < NOSE_LENGTH; i++) {
    lineTo(ctx, i + NOSE_START, -NOSE_OFFSET - NOSE_DIAMETERS[i] * 0.9);
  }

  // Outer nose wall
  moveTo(ctx, NOSE_START + velumAngle, -NOSE_OFFSET);
  for (let i = Math.ceil(velumAngle); i < NOSE_LENGTH; i++) {
    lineTo(ctx, i + NOSE_START, -NOSE_OFFSET);
  }
  ctx.stroke();

  // Velum outline
  ctx.globalAlpha = velum * 5;
  ctx.beginPath();
  moveTo(ctx, NOSE_START - 2, 0);
  lineTo(ctx, NOSE_START, -NOSE_OFFSET);
  lineTo(ctx, NOSE_START + velumAngle, -NOSE_OFFSET);
  lineTo(ctx, NOSE_START + velumAngle - 2, 0);
  ctx.stroke();
  ctx.globalAlpha = 1.0;

  // === 7. Lip label ===
  ctx.fillStyle = 'orchid';
  ctx.font = '20px Arial';
  ctx.textAlign = 'center';
  ctx.globalAlpha = 0.7;
  drawText(ctx, TRACT_LENGTH * 0.95, 0.8 + 0.8 * diameters[TRACT_LENGTH - 1], ' lip');
  ctx.globalAlpha = 1.0;

  // === 8. Draw lip (mouth opening) ===
  drawLip(ctx, diameters);
}

// Helper: moveTo using tract coordinates
function moveTo(ctx, index, diameter) {
  const a = getAngle(index);
  const r = getRadius(diameter);
  ctx.moveTo(getX(a, r), getY(a, r));
}

// Helper: lineTo using tract coordinates
function lineTo(ctx, index, diameter) {
  const a = getAngle(index);
  const r = getRadius(diameter);
  ctx.lineTo(getX(a, r), getY(a, r));
}

// Helper: draw rotated text
function drawText(ctx, index, diameter, text) {
  const a = getAngle(index);
  const r = getRadius(diameter);
  ctx.save();
  ctx.translate(getX(a, r), getY(a, r) + 2);
  ctx.rotate(-a + Math.PI / 2);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// Draw lip at the mouth end (left side of canvas)
function drawLip(ctx, diameters) {
  const lastIdx = TRACT_LENGTH - 1;
  const lipDiam = diameters[lastIdx];

  // The lip is simply the endpoint of the tract
  // Draw a small circle/arc to indicate the mouth opening
  const aOuter = getAngle(lastIdx);
  const rOuter = getRadius(0);
  const rInner = getRadius(lipDiam);

  const outerX = getX(aOuter, rOuter);
  const outerY = getY(aOuter, rOuter);
  const innerX = getX(aOuter, rInner);
  const innerY = getY(aOuter, rInner);

  // Draw lip as two short arcs extending from the tract endpoints
  const lipExtend = 8;
  const cosA = Math.cos(aOuter);
  const sinA = Math.sin(aOuter);
  // Direction along the tract (tangent)
  const tx = cosA;
  const ty = -sinA;

  ctx.lineWidth = LINE_WIDTH + 1;
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineCap = 'round';

  // Upper lip
  ctx.beginPath();
  ctx.moveTo(outerX, outerY);
  ctx.lineTo(outerX + tx * lipExtend, outerY + ty * lipExtend);
  ctx.stroke();

  // Lower lip
  ctx.beginPath();
  ctx.moveTo(innerX, innerY);
  ctx.lineTo(innerX + tx * lipExtend, innerY + ty * lipExtend);
  ctx.stroke();

  // Opening line between tips
  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.4;
  ctx.moveTo(outerX + tx * lipExtend, outerY + ty * lipExtend);
  ctx.lineTo(innerX + tx * lipExtend, innerY + ty * lipExtend);
  ctx.stroke();
  ctx.globalAlpha = 1.0;
}

export function createTractRenderer(canvas) {
  canvas.width = 600;
  canvas.height = 500;
  const ctx = canvas.getContext('2d');

  let currentDiameters = computeDiameters(20.5, 2.43); // neutral vowel position

  function render() {
    drawTract(ctx, currentDiameters, canvas.width, canvas.height);
  }

  render();

  return {
    update(tongueIndex, tongueDiameter) {
      // Clamp to valid tongue range
      const idx = Math.max(TONGUE_INDEX_MIN, Math.min(TONGUE_INDEX_MAX, tongueIndex));
      const diam = Math.max(TONGUE_DIAMETER_MIN, Math.min(TONGUE_DIAMETER_MAX, tongueDiameter));
      currentDiameters = computeDiameters(idx, diam);
      render();
    },
    reset() {
      currentDiameters = computeDiameters(20.5, 2.43);
      render();
    }
  };
}

/**
 * Map F1/F2 formant values to tongue position parameters.
 * Based on approximate vowel space mapping:
 * - F1 (openness): higher F1 → more open → lower tongueDiameter (tongue lower)
 * - F2 (frontness): higher F2 → more front → higher tongueIndex
 *
 * Ranges (approximate adult male):
 *   F1: 270 Hz (close /i/) – 730 Hz (open /a/)
 *   F2: 870 Hz (back /u/) – 2290 Hz (front /i/)
 */
export function formantsToTongue(f1, f2) {
  // F1 maps inversely to tongue diameter (high F1 = open = low diameter)
  // diameter range: 2.05 (open, low tongue) to 3.5 (close, high tongue)
  const f1Norm = Math.max(0, Math.min(1, (f1 - 270) / (730 - 270)));
  const tongueDiameter = TONGUE_DIAMETER_MIN + f1Norm * (TONGUE_DIAMETER_MAX - TONGUE_DIAMETER_MIN);

  // F2 maps to tongue index (high F2 = front = high index)
  const f2Norm = Math.max(0, Math.min(1, (f2 - 870) / (2290 - 870)));
  const tongueIndex = TONGUE_INDEX_MIN + f2Norm * (TONGUE_INDEX_MAX - TONGUE_INDEX_MIN);

  return {
    tongueIndex: Math.round(tongueIndex * 10) / 10,
    tongueDiameter: Math.round(tongueDiameter * 100) / 100,
  };
}
