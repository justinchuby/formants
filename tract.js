// tract.js — Pink Trombone-style vocal tract renderer
// Mouth on left, throat on bottom-right, arc curving left
// Outer wall (palate) is fixed; inner wall (tongue) deforms but never crosses outer

const TRACT_LENGTH = 44;
const NOSE_START = 17;
const NOSE_LENGTH = 28;
const NOSE_OFFSET = 0.8;

// Origin shifted right so the arc sweeps leftward toward the mouth
const ORIGIN = { x: 340, y: 460 };
const RADIUS = 298;
const SCALE = 60;
const ANGLE_SCALE = 0.64;
// Angle offset: mouth ends up on the left side
const ANGLE_OFFSET = Math.PI - 0.25;

const FILL_COLOR = 'pink';
const STROKE_COLOR = '#C070C6';
const LABEL_COLOR = '#888';
const LINE_WIDTH = 5;
const LIP_COLOR = '#C05080';

// Minimum cavity — tongue can never fully close the tract
const MIN_CAVITY = 0.12;
const MAX_DIAMETER = 3.5;

// Fixed nose diameters (28 segments)
const NOSE_DIAMETERS = new Float64Array(NOSE_LENGTH);
(() => {
  NOSE_DIAMETERS[0] = 0;
  for (let i = 1; i < NOSE_LENGTH; i++) {
    const t = i / (NOSE_LENGTH - 1);
    if (t < 0.15) NOSE_DIAMETERS[i] = 1.0 + (t / 0.15) * 0.3;
    else if (t < 0.85) NOSE_DIAMETERS[i] = 1.3 + ((t - 0.15) / 0.7) * 0.1;
    else NOSE_DIAMETERS[i] = 1.4 - ((t - 0.85) / 0.15) * 0.4;
  }
})();

function getAngle(index) {
  // Sweeps from throat (index=0, right-bottom) to lip (index=N-1, left)
  return ANGLE_OFFSET - (index * ANGLE_SCALE * Math.PI) / (TRACT_LENGTH - 1);
}

function getRadius(diameter) {
  // Outer wall = diameter 0 → RADIUS
  // Inner wall = diameter d → RADIUS - SCALE*d (closer to origin)
  return RADIUS - SCALE * diameter;
}

function getX(angle, r) {
  return ORIGIN.x - r * Math.cos(angle);
}

function getY(angle, r) {
  return ORIGIN.y - r * Math.sin(angle);
}

function computeDiameters(tongueIndex, tongueDiameter) {
  const d = new Float64Array(TRACT_LENGTH);
  // Base shape
  for (let i = 0; i < TRACT_LENGTH; i++) {
    if (i < 7) d[i] = 0.6;        // glottis/throat
    else if (i < 12) d[i] = 1.1;   // transition
    else d[i] = 1.5;               // oral cavity
  }
  // Tongue influence on oral segments
  for (let i = 12; i < TRACT_LENGTH - 1; i++) {
    const dist = Math.abs(i - tongueIndex);
    const influence = Math.max(0, 1 - dist / 8);
    const gaussian = influence * influence;
    d[i] = d[i] + (tongueDiameter - d[i]) * gaussian;
  }
  d[TRACT_LENGTH - 1] = 1.5; // lip segment base

  // CLAMP: prevent tongue from crossing outer wall
  for (let i = 0; i < TRACT_LENGTH; i++) {
    d[i] = Math.max(MIN_CAVITY, Math.min(MAX_DIAMETER, d[i]));
  }
  return d;
}

function drawTract(ctx, diameters) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 1. Cavity fill (pink) — area between outer wall and inner wall (tongue)
  ctx.beginPath();
  let a = getAngle(1);
  let r = getRadius(0);
  ctx.moveTo(getX(a, r), getY(a, r));
  // Outer wall forward (palate — fixed)
  for (let i = 2; i < TRACT_LENGTH; i++) {
    a = getAngle(i);
    r = getRadius(0);
    ctx.lineTo(getX(a, r), getY(a, r));
  }
  // Inner wall backward (tongue — deforms)
  for (let i = TRACT_LENGTH - 1; i >= 1; i--) {
    a = getAngle(i);
    r = getRadius(diameters[i]);
    ctx.lineTo(getX(a, r), getY(a, r));
  }
  ctx.closePath();
  ctx.fillStyle = FILL_COLOR;
  ctx.fill();

  // 2. Nasal cavity fill
  ctx.beginPath();
  for (let i = 0; i < NOSE_LENGTH; i++) {
    const tractIndex = NOSE_START + i;
    a = getAngle(tractIndex);
    r = getRadius(-NOSE_OFFSET - NOSE_DIAMETERS[i]);
    if (i === 0) ctx.moveTo(getX(a, r), getY(a, r));
    else ctx.lineTo(getX(a, r), getY(a, r));
  }
  for (let i = NOSE_LENGTH - 1; i >= 0; i--) {
    const tractIndex = NOSE_START + i;
    a = getAngle(tractIndex);
    r = getRadius(-NOSE_OFFSET);
    ctx.lineTo(getX(a, r), getY(a, r));
  }
  ctx.closePath();
  ctx.fillStyle = FILL_COLOR;
  ctx.fill();

  // 3. Outer wall stroke (palate — purple, fixed arc)
  ctx.beginPath();
  for (let i = 1; i < TRACT_LENGTH; i++) {
    a = getAngle(i);
    r = getRadius(0);
    if (i === 1) ctx.moveTo(getX(a, r), getY(a, r));
    else ctx.lineTo(getX(a, r), getY(a, r));
  }
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth = LINE_WIDTH;
  ctx.stroke();

  // 4. Inner wall stroke (tongue — deforms)
  ctx.beginPath();
  for (let i = 1; i < TRACT_LENGTH; i++) {
    a = getAngle(i);
    r = getRadius(diameters[i]);
    if (i === 1) ctx.moveTo(getX(a, r), getY(a, r));
    else ctx.lineTo(getX(a, r), getY(a, r));
  }
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth = LINE_WIDTH;
  ctx.stroke();

  // 5. Nose outlines
  ctx.beginPath();
  for (let i = 0; i < NOSE_LENGTH; i++) {
    const tractIndex = NOSE_START + i;
    a = getAngle(tractIndex);
    r = getRadius(-NOSE_OFFSET - NOSE_DIAMETERS[i]);
    if (i === 0) ctx.moveTo(getX(a, r), getY(a, r));
    else ctx.lineTo(getX(a, r), getY(a, r));
  }
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth = LINE_WIDTH;
  ctx.stroke();

  ctx.beginPath();
  for (let i = 0; i < NOSE_LENGTH; i++) {
    const tractIndex = NOSE_START + i;
    a = getAngle(tractIndex);
    r = getRadius(-NOSE_OFFSET);
    if (i === 0) ctx.moveTo(getX(a, r), getY(a, r));
    else ctx.lineTo(getX(a, r), getY(a, r));
  }
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth = LINE_WIDTH;
  ctx.stroke();

  // 6. LIP — draw at the mouth end (last segments)
  drawLip(ctx, diameters);

  // 7. Labels
  ctx.font = '16px sans-serif';
  ctx.fillStyle = LABEL_COLOR;
  ctx.textAlign = 'center';

  let la = getAngle(3);
  let lr = getRadius(diameters[3] * 0.5);
  ctx.fillText('throat', getX(la, lr), getY(la, lr));

  la = getAngle(TRACT_LENGTH - 4);
  lr = getRadius(diameters[TRACT_LENGTH - 4] * 0.5);
  ctx.fillText('lip', getX(la, lr), getY(la, lr));

  la = getAngle(22);
  lr = getRadius(diameters[22] * 0.5);
  ctx.fillText('oral cavity', getX(la, lr), getY(la, lr));

  const nMid = Math.floor(NOSE_LENGTH / 2);
  la = getAngle(NOSE_START + nMid);
  lr = getRadius(-NOSE_OFFSET - NOSE_DIAMETERS[nMid] * 0.5);
  ctx.fillText('nasal cavity', getX(la, lr), getY(la, lr));
}

function drawLip(ctx, diameters) {
  // Lip at the end of the tract (mouth opening)
  const lipIdx = TRACT_LENGTH - 1;
  const lipDiameter = diameters[lipIdx];
  const lipOpening = lipDiameter * SCALE * 0.5; // half-opening in pixels

  const a = getAngle(lipIdx);
  const outerR = getRadius(0);
  const innerR = getRadius(lipDiameter);
  const midR = (outerR + innerR) / 2;

  // Lip end points (outer and inner wall endpoints)
  const outerX = getX(a, outerR);
  const outerY = getY(a, outerR);
  const innerX = getX(a, innerR);
  const innerY = getY(a, innerR);

  // Lip extends outward from the tract end
  // Direction perpendicular to the radial line at this angle
  const lipExtend = 12; // pixels outward
  const cosA = Math.cos(a);
  const sinA = Math.sin(a);
  // Tangent direction (perpendicular to radius)
  const tx = -sinA;
  const ty = -cosA;

  // Upper lip (outer wall side) — short arc curving outward
  ctx.beginPath();
  ctx.moveTo(outerX, outerY);
  const upperTipX = outerX + tx * lipExtend;
  const upperTipY = outerY + ty * lipExtend;
  // Control point for a nice curve
  const ucpX = outerX + tx * lipExtend * 0.6 + cosA * 4;
  const ucpY = outerY + ty * lipExtend * 0.6 - sinA * 4;
  ctx.quadraticCurveTo(ucpX, ucpY, upperTipX, upperTipY);
  ctx.strokeStyle = LIP_COLOR;
  ctx.lineWidth = LINE_WIDTH + 1;
  ctx.stroke();

  // Lower lip (inner wall side)
  ctx.beginPath();
  ctx.moveTo(innerX, innerY);
  const lowerTipX = innerX + tx * lipExtend;
  const lowerTipY = innerY + ty * lipExtend;
  const lcpX = innerX + tx * lipExtend * 0.6 - cosA * 4;
  const lcpY = innerY + ty * lipExtend * 0.6 + sinA * 4;
  ctx.quadraticCurveTo(lcpX, lcpY, lowerTipX, lowerTipY);
  ctx.strokeStyle = LIP_COLOR;
  ctx.lineWidth = LINE_WIDTH + 1;
  ctx.stroke();

  // Lip opening indicator — a short line connecting the tips
  ctx.beginPath();
  ctx.moveTo(upperTipX, upperTipY);
  ctx.lineTo(lowerTipX, lowerTipY);
  ctx.strokeStyle = LIP_COLOR;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1.0;
}

export function createTractRenderer(canvas) {
  canvas.width = 600;
  canvas.height = 500;
  const ctx = canvas.getContext('2d');

  let currentDiameters = computeDiameters(26, 2.0);

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawTract(ctx, currentDiameters);
  }

  render();

  return {
    update(tongueIndex, tongueDiameter) {
      currentDiameters = computeDiameters(tongueIndex, tongueDiameter);
      render();
    },
    reset() {
      currentDiameters = computeDiameters(26, 2.0);
      render();
    }
  };
}

/**
 * Map F1/F2 formant values to tongue position parameters.
 */
export function formantsToTongue(f1, f2) {
  const tongueDiameter = 1.0 + ((f1 - 270) / (730 - 270)) * (3.5 - 1.0);
  const tongueIndex = 12 + ((f2 - 870) / (2290 - 870)) * (40 - 12);
  return {
    tongueDiameter: Math.max(1.0, Math.min(3.5, tongueDiameter)),
    tongueIndex: Math.max(12, Math.min(40, tongueIndex)),
  };
}
