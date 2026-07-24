import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import '../detection/geometry.js';
import '../detection/flag.js';
import '../detection/flag-db.js';

const G = globalThis.PaniniGeometry;
const F = globalThis.PaniniFlag;
const { FLAG_DB } = globalThis.PaniniFlagDB;

const FIXTURES_DIR = process.env.PANINI_FIXTURES_DIR || 'C:\\panini-fehlbilder-app-fixtures';
const hasFixtures = existsSync(FIXTURES_DIR);

const CASES = [
  { file: '20260723_073545.jpg', code: 'MAR' },
  { file: '20260723_073550.jpg', code: 'HAI' },
  { file: '20260723_073555.jpg', code: 'SCO' },
  { file: '20260723_073559.jpg', code: 'USA' },
  { file: '20260723_073604.jpg', code: 'PAR' },
  { file: '20260723_073609.jpg', code: 'AUS' },
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

describe.skipIf(!hasFixtures)('Flaggen-Erkennung gegen echte Fotos', () => {
  for (const testCase of CASES) {
    it(`${testCase.code}: wird korrekt erkannt`, () => {
      const page = dewarpFile(testCase.file);
      const region = F.locateFlag(page);
      const sig = F.extractSignature(page, region);
      const result = F.matchFlag(sig, FLAG_DB);
      expect(result.code).toBe(testCase.code);
    });
  }
});

describe('Referenzdatenbank (Flaggen-Signaturen)', () => {
  it('enthaelt keine zwei identischen Signaturen fuer unterschiedliche Codes', () => {
    const codes = Object.keys(FLAG_DB);
    const duplicates = [];
    for (let i = 0; i < codes.length; i++) {
      for (let j = i + 1; j < codes.length; j++) {
        if (F.signatureDistance(FLAG_DB[codes[i]], FLAG_DB[codes[j]]) < 1) {
          duplicates.push([codes[i], codes[j]]);
        }
      }
    }
    // Bekannte, dokumentierte Ausnahme: TUN/SUI/TUR sind bei 3x3-Aufloesung
    // nicht unterscheidbar (roter Hintergrund + kleines helles Zentralsymbol).
    // Der Matcher markiert solche Faelle als unsicher statt zu raten.
    const known = new Set(['TUN,SUI', 'TUN,TUR', 'SUI,TUR']);
    const unexpected = duplicates.filter(([a, b]) => !known.has(`${a},${b}`));
    expect(unexpected).toEqual([]);
  });
});

describe.skipIf(hasFixtures)('Flaggen-Erkennung', () => {
  it(`wird übersprungen, da ${FIXTURES_DIR} auf diesem Rechner nicht existiert`, () => {
    expect(hasFixtures).toBe(false);
  });
});
