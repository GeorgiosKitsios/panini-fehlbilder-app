/*
 * Feld-basierte Team-Code/Nummer-Erkennung auf einem bereits entzerrten Seitenbild.
 *
 * Ehrlicher Stand (siehe CLAUDE_HANDOFF.md, Runde 2026-07-B): findet auf einem
 * Testfoto (Australien, 9 tatsaechlich leere Felder) 3-4 von 9 korrekt, ohne
 * Falschtreffer bei Einzel-Durchlauf; Mehrfachpruefung (Konsens) reduziert Rauschen,
 * verhindert aber NICHT systematische Ziffern-Verwechslungen (z.B. 0 vs. 9) bei
 * einzelnen Feldern. Deshalb: Ergebnis ist ein VORSCHLAG, kein bestaetigtes Ergebnis.
 * Es wird nichts automatisch gespeichert; der Nutzer muss die Vorauswahl pruefen.
 */
(function (global) {
  'use strict';

  function colorDiversityGrid(pixels, blockW, blockH, bucket) {
    const bkt = bucket || 20;
    const cols = Math.ceil(pixels.width / blockW), rows = Math.ceil(pixels.height / blockH);
    const score = new Float32Array(cols * rows);
    for (let by = 0; by < rows; by++) {
      for (let bx = 0; bx < cols; bx++) {
        const x0 = bx * blockW, y0 = by * blockH;
        const x1 = Math.min(pixels.width, x0 + blockW), y1 = Math.min(pixels.height, y0 + blockH);
        const set = new Set();
        for (let y = y0; y < y1; y += 2) {
          for (let x = x0; x < x1; x += 2) {
            const i = (y * pixels.width + x) * 4;
            set.add((((pixels.data[i] / bkt) | 0) * 10000) + (((pixels.data[i + 1] / bkt) | 0) * 100) + ((pixels.data[i + 2] / bkt) | 0));
          }
        }
        score[by * cols + bx] = set.size;
      }
    }
    return { score, cols, rows };
  }

  /**
   * Liefert Kandidatenregionen fuer leere Platzhalterfelder (grafische Textfelder statt
   * Fotos) als {x,y,w,h}[] in Pixelkoordinaten des uebergebenen (entzerrten) Bildes.
   * TOP_N waehlt die N Bloecke mit der geringsten Farbvielfalt statt eines festen
   * Schwellwerts, damit die Kandidatenzahl (und damit die OCR-Laufzeit) begrenzt bleibt.
   */
  function findCandidateRegions(pixels, options) {
    const opts = options || {};
    const blockW = opts.blockW || 100, blockH = opts.blockH || 95;
    const topN = opts.topN || 25;
    const margin = opts.margin != null ? opts.margin : 0.4;

    const { score, cols, rows } = colorDiversityGrid(pixels, blockW, blockH);
    const order = [...score.keys()].sort((a, b) => score[a] - score[b]);
    const mask = new Uint8Array(cols * rows);
    for (let i = 0; i < Math.min(topN, order.length); i++) mask[order[i]] = 1;

    const comps = global.PaniniFields.connectedComponents(mask, cols, rows);
    return comps.map(c => {
      const x0 = c.minX * blockW, y0 = c.minY * blockH;
      const w = (c.maxX - c.minX + 1) * blockW, h = (c.maxY - c.minY + 1) * blockH;
      const mx = w * margin, my = h * margin;
      return {
        x: Math.max(0, Math.round(x0 - mx)),
        y: Math.max(0, Math.round(y0 - my)),
        w: Math.min(pixels.width, Math.round(w + 2 * mx)),
        h: Math.min(pixels.height, Math.round(h + 2 * my)),
      };
    });
  }

  /**
   * Binarisiert einen Bildausschnitt (dunkle Pixel schwarz, helle weiss) und
   * vergroessert ihn, um Tesseract eine bessere Grundlage zu geben.
   */
  function cropAndBinarize(pixels, region, scale, threshold) {
    const sc = scale || 3, th = threshold != null ? threshold : 150;
    const x0 = Math.max(0, region.x), y0 = Math.max(0, region.y);
    const w = Math.max(1, Math.min(pixels.width - x0, region.w));
    const h = Math.max(1, Math.min(pixels.height - y0, region.h));
    const outW = w * sc, outH = h * sc;
    const out = new Uint8ClampedArray(outW * outH * 4);
    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        const sx = x0 + Math.floor(x / sc), sy = y0 + Math.floor(y / sc);
        const si = (sy * pixels.width + sx) * 4;
        const gray = 0.299 * pixels.data[si] + 0.587 * pixels.data[si + 1] + 0.114 * pixels.data[si + 2];
        const v = gray < th ? 0 : 255;
        const di = (y * outW + x) * 4;
        out[di] = v; out[di + 1] = v; out[di + 2] = v; out[di + 3] = 255;
      }
    }
    return { data: out, width: outW, height: outH };
  }

  /**
   * Extrahiert (Teamcode, Nummer)-Paare aus OCR-Rohtext: 3 Grossbuchstaben direkt
   * gefolgt (mit wenig Zwischenraum) von 1-2 Ziffern zwischen 1 und 20, Code muss in
   * validCodes enthalten sein.
   */
  function parseCodeNumberPairs(text, validCodes) {
    const upper = String(text || '').toUpperCase();
    const pairs = [];
    const re = /\b([A-Z]{3})\b[^A-Z0-9]{0,6}(\d{1,2})\b/g;
    let m;
    while ((m = re.exec(upper))) {
      const code = m[1], num = Number(m[2]);
      if (validCodes.has(code) && num >= 1 && num <= 20) pairs.push({ code, num });
    }
    return pairs;
  }

  const PaniniOcr = { findCandidateRegions, cropAndBinarize, parseCodeNumberPairs };
  global.PaniniOcr = PaniniOcr;
  if (typeof module !== 'undefined' && module.exports) module.exports = PaniniOcr;
})(typeof globalThis !== 'undefined' ? globalThis : this);
