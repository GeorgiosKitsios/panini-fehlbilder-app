import { describe, it, expect } from 'vitest';
import '../detection/geometry.js';

const G = globalThis.PaniniGeometry;

function makeBuffer(width, height, color) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color.r; data[i + 1] = color.g; data[i + 2] = color.b; data[i + 3] = 255;
  }
  return { data, width, height };
}

function setPixel(pixels, x, y, color) {
  if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) return;
  const i = (y * pixels.width + x) * 4;
  pixels.data[i] = color.r; pixels.data[i + 1] = color.g; pixels.data[i + 2] = color.b; pixels.data[i + 3] = 255;
}

function fillCheckerboard(pixels, cell) {
  for (let y = 0; y < pixels.height; y++) {
    for (let x = 0; x < pixels.width; x++) {
      const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      setPixel(pixels, x, y, on ? { r: 20, g: 20, b: 20 } : { r: 230, g: 230, b: 230 });
    }
  }
}

function fillVerticalStrip(pixels, xFrom, xTo, color) {
  for (let y = 0; y < pixels.height; y++) {
    for (let x = xFrom; x < xTo; x++) setPixel(pixels, x, y, color);
  }
}

function fillRotatedRect(pixels, cx, cy, w, h, angleDeg, color) {
  const rad = (-angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  for (let y = 0; y < pixels.height; y++) {
    for (let x = 0; x < pixels.width; x++) {
      const dx = x - cx, dy = y - cy;
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;
      if (Math.abs(rx) <= w / 2 && Math.abs(ry) <= h / 2) setPixel(pixels, x, y, color);
    }
  }
}

describe('detectOrientation (Viertel-Drehung nötig?)', () => {
  it('erkennt ein Querformat-Bild als bereits korrekt (0)', () => {
    expect(G.detectOrientation(makeBuffer(400, 300, { r: 0, g: 0, b: 0 }))).toBe(0);
  });

  it('erkennt ein Hochformat-Bild als drehbedürftig (90)', () => {
    expect(G.detectOrientation(makeBuffer(300, 400, { r: 0, g: 0, b: 0 }))).toBe(90);
  });

  it('behandelt ein quadratisches Bild als bereits querformatig (Grenzfall)', () => {
    expect(G.detectOrientation(makeBuffer(300, 300, { r: 0, g: 0, b: 0 }))).toBe(0);
  });
});

describe('locateSpine (Buchfalz zwischen zwei Seiten)', () => {
  it('findet eine ruhige vertikale Spalte inmitten eines unruhigen Schachbrettmusters', () => {
    const pixels = makeBuffer(400, 300, { r: 255, g: 255, b: 255 });
    fillCheckerboard(pixels, 6);
    fillVerticalStrip(pixels, 195, 205, { r: 128, g: 128, b: 128 });
    const x = G.locateSpine(pixels);
    expect(x).toBeGreaterThanOrEqual(185);
    expect(x).toBeLessThanOrEqual(215);
  });
});

describe('detectPageBounds (grobe Seitenkontur gegenüber Hintergrund)', () => {
  it('findet ein achsenparalleles Rechteck vor kontrastierendem Hintergrund', () => {
    const pixels = makeBuffer(300, 200, { r: 180, g: 150, b: 110 });
    fillRotatedRect(pixels, 150, 100, 180, 120, 0, { r: 20, g: 40, b: 200 });
    const result = G.detectPageBounds(pixels);
    expect(Math.abs(result.angleDeg)).toBeLessThanOrEqual(3);
    const xs = result.corners.map(p => p.x);
    const ys = result.corners.map(p => p.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(width).toBeGreaterThan(150);
    expect(width).toBeLessThan(210);
    expect(height).toBeGreaterThan(95);
    expect(height).toBeLessThan(145);
    expect(result.contentRatio).toBeGreaterThan(0.25);
  });

  it('erkennt den Verkantungswinkel eines leicht gedrehten Rechtecks', () => {
    const pixels = makeBuffer(300, 200, { r: 180, g: 150, b: 110 });
    fillRotatedRect(pixels, 150, 100, 160, 100, 9, { r: 20, g: 40, b: 200 });
    const result = G.detectPageBounds(pixels);
    expect(Math.abs(result.angleDeg - 9)).toBeLessThanOrEqual(3);
  });

  it('liefert bei leerem/einfarbigem Bild eine plausible Fläche statt eines Absturzes', () => {
    const pixels = makeBuffer(200, 150, { r: 255, g: 255, b: 255 });
    const result = G.detectPageBounds(pixels);
    expect(result.corners).toHaveLength(4);
    expect(Number.isFinite(result.angleDeg)).toBe(true);
  });
});

describe('computeHomography / applyHomography', () => {
  it('bildet die 4 Stützpunkte exakt auf ihre Zielpunkte ab', () => {
    const from = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const to = [{ x: 20, y: 30 }, { x: 220, y: 10 }, { x: 200, y: 180 }, { x: 10, y: 160 }];
    const H = G.computeHomography(from, to);
    from.forEach((pt, i) => {
      const mapped = G.applyHomography(H, pt.x, pt.y);
      expect(mapped.x).toBeCloseTo(to[i].x, 1);
      expect(mapped.y).toBeCloseTo(to[i].y, 1);
    });
  });

  it('reduziert sich auf die Identität, wenn Quelle und Ziel gleich sind', () => {
    const rect = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }];
    const H = G.computeHomography(rect, rect);
    const mapped = G.applyHomography(H, 25, 25);
    expect(mapped.x).toBeCloseTo(25, 1);
    expect(mapped.y).toBeCloseTo(25, 1);
  });
});

describe('dewarpPerspective', () => {
  it('entspricht einem einfachen Ausschnitt, wenn die Ecken bereits achsenparallel sind', () => {
    const pixels = makeBuffer(300, 200, { r: 255, g: 255, b: 255 });
    fillRotatedRect(pixels, 100, 85, 100, 70, 0, { r: 10, g: 200, b: 10 });
    const corners = G.rectCorners(50, 50, 150, 120);
    const out = G.dewarpPerspective(pixels, corners, 100, 70);
    // Die Mitte des Ausschnitts sollte durchgehend die Rechteckfarbe zeigen.
    const i = (35 * 100 + 50) * 4;
    expect(out.data[i]).toBe(10);
    expect(out.data[i + 1]).toBe(200);
    expect(out.data[i + 2]).toBe(10);
  });

  it('entzerrt ein echtes Trapez so, dass die Farbtrennlinie mittig im Ausgabebild landet', () => {
    const pixels = makeBuffer(300, 200, { r: 0, g: 0, b: 0 });
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 300; x++) {
        setPixel(pixels, x, y, x < 150 ? { r: 200, g: 0, b: 0 } : { r: 0, g: 0, b: 200 });
      }
    }
    // Trapez: oben schmaler als unten (typische Kamera-Perspektive), aber symmetrisch um x=150.
    const corners = [{ x: 90, y: 30 }, { x: 210, y: 30 }, { x: 240, y: 170 }, { x: 60, y: 170 }];
    const out = G.dewarpPerspective(pixels, corners, 100, 60);
    const leftIdx = (30 * 100 + 5) * 4;
    const rightIdx = (30 * 100 + 95) * 4;
    expect(out.data[leftIdx]).toBeGreaterThan(150); // rot
    expect(out.data[rightIdx + 2]).toBeGreaterThan(150); // blau
  });
});
