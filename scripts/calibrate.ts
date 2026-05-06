/**
 * Apply a linear correction to every bbox in public/sample.schema.json.
 *
 * Tweak the constants at the top, run `npx tsx scripts/calibrate.ts`,
 * and reload the browser. Call this as many times as needed — each run
 * reads the file, applies the transform, and writes it back.
 *
 * Use the in-app calibration overlay (Cmd/Ctrl-Click any spot on the PDF
 * with DevTools open) to capture true coordinates and back-fit constants.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// === Corrections (apply: new = old * scale + offset) ===
const X_OFFSET = 0;
const X_SCALE = 1.0;
const WIDTH_SCALE = 1.0;
const HEIGHT_SCALE = 1.0;

// Piecewise y correction: anything above the pivot is left alone. Pivot is
// just above mobileNumber (atmCardFor at 0.411 is good; mobileNumber at
// 0.467 starts the drift). Fields below get pulled up, more so the lower
// they are.
const Y_PIVOT = 0.45;
const Y_BELOW_PIVOT_SCALE = 0.90;
const Y_OFFSET = 0;

const PATH = resolve(import.meta.dirname, '../public/sample.schema.json');

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const data = JSON.parse(readFileSync(PATH, 'utf8')) as {
  fields: { id: string; bbox?: { x: number; y: number; width: number; height: number } }[];
};

let touched = 0;
for (const f of data.fields) {
  if (!f.bbox) continue;
  const newX = clamp01(f.bbox.x * X_SCALE + X_OFFSET);
  const yIn = f.bbox.y;
  const yScaled =
    yIn > Y_PIVOT
      ? Y_PIVOT + (yIn - Y_PIVOT) * Y_BELOW_PIVOT_SCALE
      : yIn + Y_OFFSET;
  const newY = clamp01(yScaled);
  const newW = clamp01(f.bbox.width * WIDTH_SCALE);
  const newH = clamp01(f.bbox.height * HEIGHT_SCALE);
  f.bbox = { x: round(newX), y: round(newY), width: round(newW), height: round(newH) };
  touched++;
}

writeFileSync(PATH, JSON.stringify(data, null, 2) + '\n');
console.log(`Calibrated ${touched} fields. Reload the browser.`);

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
