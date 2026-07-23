/*
 * Team-Flaggen-Erkennung per Farbmuster statt Text-OCR.
 *
 * Jede Team-Doppelseite zeigt die Flagge an einer festen ungefaehren Position
 * (links unter der "WE ARE X"-Ueberschrift, neben "Fédération/Association X").
 * Die Position schwankt leicht (abhaengig von der Laenge des Landesnamens im
 * Ueberschrift-Text), deshalb: grosszuegiger fester Suchbereich + Blob-Erkennung
 * zur Verfeinerung, mit Rueckfall auf eine Standardposition, wenn die
 * Blob-Erkennung kein plausibles Ergebnis liefert (haeufig bei Flaggen mit viel
 * Weiss/wenig Sattigung, z.B. Schottland, USA, Australien).
 *
 * Signatur = 3x3-Raster der dominanten Farbe je Zelle. Erfasst grobe Muster
 * (Streifen, Kreuze, Kantons) ohne Text lesen zu muessen.
 */
(function (global) {
  'use strict';

  const SEARCH = { x: 0, y: 230, w: 200, h: 140 };
  const FALLBACK_REGION = { x: 40, y: 245, w: 90, h: 60 };
  const BLOCK = 6;

  function connectedComponents(mask, cols, rows) {
    const visited = new Uint8Array(cols * rows);
    const components = [];
    for (let start = 0; start < cols * rows; start++) {
      if (!mask[start] || visited[start]) continue;
      const queue = [start];
      visited[start] = 1;
      let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1, size = 0;
      while (queue.length) {
        const idx = queue.pop();
        const bx = idx % cols, by = (idx - bx) / cols;
        minX = Math.min(minX, bx); maxX = Math.max(maxX, bx);
        minY = Math.min(minY, by); maxY = Math.max(maxY, by);
        size++;
        const neighbors = [idx - 1, idx + 1, idx - cols, idx + cols];
        for (const n of neighbors) {
          if (n < 0 || n >= cols * rows) continue;
          if (n % cols === 0 && idx % cols === cols - 1) continue;
          if (idx % cols === 0 && n % cols === cols - 1) continue;
          if (mask[n] && !visited[n]) { visited[n] = 1; queue.push(n); }
        }
      }
      components.push({ minX, minY, maxX, maxY, size });
    }
    return components;
  }

  /**
   * Sucht die Flagge im festen Suchbereich. Liefert ein plausibel-grosses,
   * quer-rechteckiges Ergebnis wenn moeglich, sonst die Rueckfallposition.
   */
  function locateFlag(pixels) {
    const { x: x0, y: y0, w, h } = SEARCH;
    const cols = Math.ceil(w / BLOCK), rows = Math.ceil(h / BLOCK);
    const mask = new Uint8Array(cols * rows);
    for (let by = 0; by < rows; by++) {
      for (let bx = 0; bx < cols; bx++) {
        let sum = 0, n = 0;
        for (let y = by * BLOCK; y < Math.min(h, (by + 1) * BLOCK); y++) {
          for (let x = bx * BLOCK; x < Math.min(w, (bx + 1) * BLOCK); x++) {
            const i = ((y0 + y) * pixels.width + (x0 + x)) * 4;
            const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const sat = max === 0 ? 0 : (max - min) / max;
            if (sat > 0.18) sum++;
            n++;
          }
        }
        mask[by * cols + bx] = (sum / n) > 0.3 ? 1 : 0;
      }
    }
    const comps = connectedComponents(mask, cols, rows);
    const candidates = comps.filter(c => {
      const cw = c.maxX - c.minX + 1, ch = c.maxY - c.minY + 1;
      const aspect = cw / ch;
      const area = cw * ch;
      return aspect > 1.15 && aspect < 2.4 && c.size >= 10 && area <= cols * rows * 0.6;
    });
    candidates.sort((a, b) => b.size - a.size);
    const best = candidates[0];
    if (best) {
      return {
        x: x0 + best.minX * BLOCK, y: y0 + best.minY * BLOCK,
        w: (best.maxX - best.minX + 1) * BLOCK, h: (best.maxY - best.minY + 1) * BLOCK,
      };
    }
    return { ...FALLBACK_REGION };
  }

  function dominantColor(pixels, x0, y0, w, h) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) continue;
        const i = (y * pixels.width + x) * 4;
        r += pixels.data[i]; g += pixels.data[i + 1]; b += pixels.data[i + 2]; n++;
      }
    }
    return n ? { r: r / n, g: g / n, b: b / n } : { r: 200, g: 200, b: 200 };
  }

  /** 3x3-Raster der Durchschnittsfarbe je Zelle innerhalb der Region. */
  function extractSignature(pixels, region) {
    const cellW = region.w / 3, cellH = region.h / 3;
    const cells = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        cells.push(dominantColor(
          pixels,
          Math.round(region.x + col * cellW), Math.round(region.y + row * cellH),
          Math.max(1, Math.round(cellW)), Math.max(1, Math.round(cellH))
        ));
      }
    }
    return cells;
  }

  function signatureDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += Math.hypot(a[i].r - b[i].r, a[i].g - b[i].g, a[i].b - b[i].b);
    }
    return sum / 9;
  }

  /**
   * Vergleicht eine Signatur gegen die Referenzdatenbank. Liefert null, wenn
   * der Abstand zum besten Treffer zu klein gegenueber dem zweitbesten ist
   * (zu unsicher, um zu raten) oder der beste Abstand insgesamt zu gross ist.
   */
  function matchFlag(signature, database, options) {
    const maxDistance = (options && options.maxDistance) || 90;
    const minGapRatio = (options && options.minGapRatio) || 1.15;
    const scored = Object.entries(database)
      .map(([code, sig]) => ({ code, distance: signatureDistance(signature, sig) }))
      .sort((a, b) => a.distance - b.distance);
    const best = scored[0];
    const second = scored[1];
    if (!best || best.distance > maxDistance) return { code: null, reason: 'kein_plausibler_treffer', best, second };
    if (second && second.distance < best.distance * minGapRatio) {
      return { code: null, reason: 'zu_unsicher', best, second };
    }
    return { code: best.code, distance: best.distance, best, second };
  }

  const PaniniFlag = { locateFlag, extractSignature, signatureDistance, matchFlag, SEARCH, FALLBACK_REGION };
  global.PaniniFlag = PaniniFlag;
  if (typeof module !== 'undefined' && module.exports) module.exports = PaniniFlag;
})(typeof globalThis !== 'undefined' ? globalThis : this);
