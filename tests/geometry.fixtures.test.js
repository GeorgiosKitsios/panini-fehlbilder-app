import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import '../detection/geometry.js';

const G = globalThis.PaniniGeometry;

// Reale Testfotos liegen ausserhalb des Repos und werden NICHT committet (siehe Auftrag,
// Abschnitt 8/12). Ordner via Env-Var ueberschreibbar, damit CI ohne die Fotos gruen bleibt.
const FIXTURES_DIR = process.env.PANINI_FIXTURES_DIR || 'C:\\panini-fehlbilder-app-fixtures';
const hasFixtures = existsSync(FIXTURES_DIR);

function listJpegs(dir) {
  return readdirSync(dir).filter(name => /\.jpe?g$/i.test(name) && !name.includes(' - Kopie'));
}

function decodeJpeg(path) {
  const raw = readFileSync(path);
  const { width, height, data } = jpeg.decode(raw, { useTArray: true, maxMemoryUsageInMB: 1024 });
  return { data, width, height };
}

// Downscale per Nearest-Neighbor, damit die O(Breite*Hoehe)-Schritte (Sobel, Winkelsuche)
// bei 4000x3000-Fotos nicht mehrere Sekunden pro Bild brauchen.
function downscale(pixels, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(pixels.width, pixels.height));
  if (scale >= 1) return pixels;
  const outW = Math.round(pixels.width * scale);
  const outH = Math.round(pixels.height * scale);
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(pixels.width - 1, Math.round(x / scale));
      const sy = Math.min(pixels.height - 1, Math.round(y / scale));
      const si = (sy * pixels.width + sx) * 4;
      const di = (y * outW + x) * 4;
      out[di] = pixels.data[si]; out[di + 1] = pixels.data[si + 1]; out[di + 2] = pixels.data[si + 2]; out[di + 3] = 255;
    }
  }
  return { data: out, width: outW, height: outH };
}

function rotateBuffer(pixels, deg) {
  const { data, width, height } = pixels;
  if (deg === 0) return pixels;
  const swap = deg === 90 || deg === 270;
  const outW = swap ? height : width;
  const outH = swap ? width : height;
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      let sx, sy;
      if (deg === 180) { sx = width - 1 - x; sy = height - 1 - y; }
      else if (deg === 90) { sx = y; sy = height - 1 - x; }
      else { sx = width - 1 - y; sy = x; }
      const si = (sy * width + sx) * 4;
      const di = (y * outW + x) * 4;
      out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
    }
  }
  return { data: out, width: outW, height: outH };
}

describe.skipIf(!hasFixtures)('Geometrie mit echten Fotos (lokal, nicht committet)', () => {
  const files = hasFixtures ? listJpegs(FIXTURES_DIR) : [];

  it('findet mindestens ein Foto im Fixture-Ordner', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    describe(file, () => {
      const pixels = downscale(decodeJpeg(join(FIXTURES_DIR, file)), 700);

      it('wird als Querformat (kein Drehbedarf) erkannt, wie fotografiert', () => {
        // Alle bisher geprueften Fixture-Fotos wurden aufrecht im Querformat aufgenommen.
        expect(pixels.width).toBeGreaterThanOrEqual(pixels.height);
        expect(G.detectOrientation(pixels)).toBe(0);
      });

      it('erkennt nach einer synthetischen 90°-Drehung korrekt Drehbedarf', () => {
        const rotated = rotateBuffer(pixels, 90);
        expect(G.detectOrientation(rotated)).toBe(90);
      });

      it('erkennt nach einer synthetischen 180°-Drehung weiterhin Querformat (Kopfstand wird bewusst nicht geprüft)', () => {
        const rotated = rotateBuffer(pixels, 180);
        expect(G.detectOrientation(rotated)).toBe(0);
      });

      it('findet eine plausible Seitenkontur (kein Absturz, sinnvolle Flächenabdeckung)', () => {
        const bounds = G.detectPageBounds(pixels);
        expect(bounds.corners).toHaveLength(4);
        expect(bounds.contentRatio).toBeGreaterThan(0.1);
        expect(Number.isFinite(bounds.angleDeg)).toBe(true);
      });
    });
  }
});

describe.skipIf(hasFixtures)('Geometrie mit echten Fotos', () => {
  it(`wird übersprungen, da ${FIXTURES_DIR} auf diesem Rechner nicht existiert`, () => {
    expect(hasFixtures).toBe(false);
  });
});
