// tract.js — Pink Trombone-style vocal tract renderer
// Coordinate system and drawing logic replicated from Pink Trombone's TractUI.js

const TRACT_LENGTH = 44;
const NOSE_START = 17;
const NOSE_LENGTH = 28;
const NOSE_OFFSET = 0.8;

const ORIGIN = { x: 340, y: 460 };
const RADIUS = 298;
const SCALE = 60;
const ANGLE_SCALE = 0.64;
const ANGLE_OFFSET = -0.25;

const FILL_COLOR = 'pink';
const STROKE_COLOR = '#C070C6';
const LABEL_COLOR = '#888';
const LINE_WIDTH = 5;

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
  return ANGLE_OFFSET + (index * ANGLE_SCALE * Math.PI) / (TRACT_LENGTH - 1);
}

function getRadius(diameter) {
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
  for (let i = 0; i < TRACT_LENGTH; i++) {
    if (i < 7) d[i] = 0.6;
    else if (i < 12) d[i] = 1.1;
    else d[i] = 1.5;
  }
  for (let i = 0; i < TRACT_LENGTH; i++) {
    const dist = Math.abs(i - tongueIndex);
    const influence = Math.max(0, 1 - dist / 8);
    const gaussian = influence * influence;
    d[i] = d[i] + (tongueDiameter - d[i]) * gaussian;
  }
  d[TRACT_LENGTH - 1] = 1.5;
  return d;
}

function drawTract(ctx, diameters) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 1. Cavity fill (pink)
  ctx.beginPath();
  // Start at index=1, outer wall (diameter=0)
  let a = getAngle(1);
  let r = getRadius(0);
  ctx.moveTo(getX(a, r), getY(a, r));
  // Forward: inner wall (diameter[i])
  for (let i = 1; i < TRACT_LENGTH; i++) {
    a = getAngle(i);
    r = getRadius(diameters[i]);
    ctx.lineTo(getX(a, r), getY(a, r));
  }
  // Backward: outer wall (diameter=0)
  for (let i = TRACT_LENGTH - 1; i >= 1; i--) {
    a = getAngle(i);
    r = getRadius(0);
    ctx.lineTo(getX(a, r), getY(a, r));
  }
  ctx.closePath();
  ctx.fillStyle = FILL_COLOR;
  ctx.fill();

  // 2. Nasal cavity fill (pink)
  ctx.beginPath();
  // Nose attaches at noseStart on the outer wall, going outward (negative diameter direction)
  for (let i = 0; i < NOSE_LENGTH; i++) {
    const tractIndex = NOSE_START + i;
    a = getAngle(tractIndex);
    // Nose goes outward from outer wall: radius increases (diameter negative = outward)
    r = getRadius(-NOSE_OFFSET);
    const noseR = getRadius(-NOSE_OFFSET - NOSE_DIAMETERS[i]);
    if (i === 0) {
      ctx.moveTo(getX(a, noseR), getY(a, noseR));
    } else {
      ctx.lineTo(getX(a, noseR), getY(a, noseR));
    }
  }
  // Back along the base of the nose
  for (let i = NOSE_LENGTH - 1; i >= 0; i--) {
    const tractIndex = NOSE_START + i;
    a = getAngle(tractIndex);
    r = getRadius(-NOSE_OFFSET);
    ctx.lineTo(getX(a, r), getY(a, r));
  }
  ctx.closePath();
  ctx.fillStyle = FILL_COLOR;
  ctx.fill();

  // 3. Outer wall outline (purple)
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

  // 4. Inner wall / tongue outline (purple)
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

  // Nose outline (purple)
  // Outer edge of nose
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
  // Inner edge of nose (base)
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

  // 5. Labels
  ctx.font = '16px sans-serif';
  ctx.fillStyle = LABEL_COLOR;
  ctx.textAlign = 'center';

  // "throat" — near index 2
  let la = getAngle(2);
  let lr = getRadius(diameters[2] * 0.5);
  ctx.fillText('throat', getX(la, lr), getY(la, lr));

  // "lip" — near the end
  la = getAngle(TRACT_LENGTH - 2);
  lr = getRadius(diameters[TRACT_LENGTH - 2] * 0.5);
  ctx.fillText('lip', getX(la, lr), getY(la, lr));

  // "oral cavity" — middle of tract
  la = getAngle(22);
  lr = getRadius(diameters[22] * 0.5);
  ctx.fillText('oral cavity', getX(la, lr), getY(la, lr));

  // "nasal cavity" — middle of nose
  const nMid = Math.floor(NOSE_LENGTH / 2);
  la = getAngle(NOSE_START + nMid);
  lr = getRadius(-NOSE_OFFSET - NOSE_DIAMETERS[nMid] * 0.5);
  ctx.fillText('nasal cavity', getX(la, lr), getY(la, lr));
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
  // F1 → tongueDiameter: low F1 = tongue high (small diameter), high F1 = tongue low (large diameter)
  const tongueDiameter = 1.0 + ((f1 - 270) / (730 - 270)) * (3.5 - 1.0);
  // F2 → tongueIndex: high F2 = tongue front (low index), low F2 = tongue back (high index)
  const tongueIndex = 40 - ((f2 - 870) / (2290 - 870)) * (40 - 12);
  return {
    tongueDiameter: Math.max(1.0, Math.min(3.5, tongueDiameter)),
    tongueIndex: Math.max(12, Math.min(40, tongueIndex)),
  };
}
