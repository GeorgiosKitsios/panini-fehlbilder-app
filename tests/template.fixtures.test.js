import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import '../detection/geometry.js';
import '../detection/template.js';

const G = globalThis.PaniniGeometry;
const T = globalThis.PaniniTemplate;

const FIXTURES_DIR = process.env.PANINI_FIXTURES_DIR || 'C:\\panini-fehlbilder-app-fixtures';
const hasFixtures = existsSync(FIXTURES_DIR);

// Ground Truth per Sichtpruefung der Fixture-Fotos (siehe Konversation, Runde 2026-07-C).
const CASES = [
  { file: '20260723_073545.jpg', code: 'MAR', missing: [5, 6, 10, 13, 15, 20] },
  { file: '20260723_073550.jpg', code: 'HAI', missing: [4, 11, 14, 15, 16, 17, 18, 19, 20] },
  { file: '20260723_073555.jpg', code: 'SCO', missing: [1, 2, 3, 9, 12, 18] },
  { file: '20260723_073559.jpg', code: 'USA', missing: [1, 2, 4, 6, 9, 10, 16] },
  { file: '20260723_073604.jpg', code: 'PAR', missing: [5, 10, 13, 15, 17, 18, 20] },
  { file: '20260723_073609.jpg', code: 'AUS', missing: [1, 4, 6, 7, 9, 10, 13, 14, 15] },
];

function decode(path) { return jpeg.decode(readFileSync(path), { useTArray: true, maxMemoryUsageInMB: 1024 }); }

function downscale(pixels, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(pixels.width, pixels.height));
  if (scale >= 1) return pixels;
  const outW = Math.round(pixels.width * scale), outH = Math.round(pixels.height * scale);
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    const sx = Math.min(pixels.width - 1, Math.round(x / scale)), sy = Math.min(pixels.height - 1, Math.round(y / scale));
    const si = (sy * pixels.width + sx) * 4, di = (y * outW + x) * 4;
    out[di] = pixels.data[si]; out[di + 1] = pixels.data[si + 1]; out[di + 2] = pixels.data[si + 2]; out[di + 3] = 255;
  }
  return { data: out, width: outW, height: outH };
}

function dewarpFile(file) {
  const full = decode(join(FIXTURES_DIR, file));
  const small = downscale(full, 900);
  const bounds = G.detectPageBounds(small);
  const scaleBack = full.width / small.width;
  const cornersFull = bounds.corners.map(p => ({ x: p.x * scaleBack, y: p.y * scaleBack }));
  return G.dewarpPerspective(full, cornersFull, 1200, 900);
}

describe.skipIf(!hasFixtures)('Slot-Klassifikation (leer/beklebt) gegen echte Fotos', () => {
  it('erkennt >= 95% aller 120 Slot-Zustaende korrekt, ohne Falsch-Positive', () => {
    let correct = 0, total = 0, falsePositives = 0, falseNegatives = 0;
    for (const testCase of CASES) {
      const page = dewarpFile(testCase.file);
      const states = T.detectSlotStates(page);
      for (const state of states) {
        total++;
        const actuallyEmpty = testCase.missing.includes(state.number);
        if (state.empty === actuallyEmpty) correct++;
        else if (state.empty && !actuallyEmpty) falsePositives++;
        else falseNegatives++;
      }
    }
    expect(total).toBe(CASES.length * 20);
    expect(falsePositives).toBe(0);
    expect(correct / total).toBeGreaterThanOrEqual(0.95);
  });

  for (const testCase of CASES) {
    it(`${testCase.code}: findet die tatsaechlich fehlenden Nummern ohne Falsch-Positive`, () => {
      const page = dewarpFile(testCase.file);
      const states = T.detectSlotStates(page);
      const detectedEmpty = states.filter(s => s.empty).map(s => s.number);
      const falsePositives = detectedEmpty.filter(n => !testCase.missing.includes(n));
      expect(falsePositives).toEqual([]);
    });
  }
});

describe.skipIf(hasFixtures)('Slot-Klassifikation (leer/beklebt)', () => {
  it(`wird übersprungen, da ${FIXTURES_DIR} auf diesem Rechner nicht existiert`, () => {
    expect(hasFixtures).toBe(false);
  });
});
