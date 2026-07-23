/*
 * Festes 20-Slot-Template fuer die Panini-Doppelseite auf dem entzerrten
 * 1200x900-Seitenbild (siehe geometry.js: dewarpPerspective).
 *
 * Nummerierung = Lesereihenfolge (linke Seite zuerst, zeilenweise), bestaetigt
 * anhand mehrerer echter Testfotos (Marokko, Haiti, Schottland, USA, Paraguay,
 * Australien) mit sichtbaren Nummern-Beschriftungen auf den leeren Feldern.
 *
 * Position 13 ist auf jeder Seite der Mannschaftsfoto-Slot (laut Nutzer-Angabe),
 * wird aber wie jeder andere Slot behandelt: leer = Mannschaftsfoto noch nicht
 * eingeklebt, beklebt = Foto vorhanden.
 *
 * Die Koordinaten sind ein Kompromiss ueber mehrere echte Fotos, nicht pixelgenau
 * fuer jedes einzelne. detectSlotStates() arbeitet deshalb mit einem nach innen
 * verkleinerten Bereich pro Slot (siehe SHRINK), um Karten-/Feldraender zu meiden.
 */
(function (global) {
  'use strict';

  const LEFT_COLS = [30, 185, 330, 472, 600];
  const RIGHT_COLS = [600, 745, 888, 1032, 1178];
  const ROWS = [95, 300, 500, 700];

  function rect(cols, colIndex, colSpan, row) {
    const x0 = cols[colIndex], x1 = cols[colIndex + colSpan];
    return { x: x0, y: ROWS[row], w: x1 - x0, h: ROWS[row + 1] - ROWS[row] };
  }

  const SLOTS = [
    rect(LEFT_COLS, 2, 1, 0), rect(LEFT_COLS, 3, 1, 0),
    rect(LEFT_COLS, 0, 1, 1), rect(LEFT_COLS, 1, 1, 1), rect(LEFT_COLS, 2, 1, 1), rect(LEFT_COLS, 3, 1, 1),
    rect(LEFT_COLS, 0, 1, 2), rect(LEFT_COLS, 1, 1, 2), rect(LEFT_COLS, 2, 1, 2), rect(LEFT_COLS, 3, 1, 2),
    rect(RIGHT_COLS, 0, 1, 0), rect(RIGHT_COLS, 1, 1, 0), rect(RIGHT_COLS, 2, 2, 0),
    rect(RIGHT_COLS, 0, 1, 1), rect(RIGHT_COLS, 1, 1, 1), rect(RIGHT_COLS, 2, 1, 1), rect(RIGHT_COLS, 3, 1, 1),
    rect(RIGHT_COLS, 1, 1, 2), rect(RIGHT_COLS, 2, 1, 2), rect(RIGHT_COLS, 3, 1, 2),
  ];

  const SHRINK = 0.18;
  const BUCKET = 20;
  const DEFAULT_THRESHOLD = 72;

  function colorDiversity(pixels, region) {
    const mx = region.w * SHRINK, my = region.h * SHRINK;
    const x0 = Math.round(region.x + mx), y0 = Math.round(region.y + my);
    const x1 = Math.round(region.x + region.w - mx), y1 = Math.round(region.y + region.h - my);
    const set = new Set();
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) continue;
        const i = (y * pixels.width + x) * 4;
        set.add((((pixels.data[i] / BUCKET) | 0) * 10000) + (((pixels.data[i + 1] / BUCKET) | 0) * 100) + ((pixels.data[i + 2] / BUCKET) | 0));
      }
    }
    return set.size;
  }

  /**
   * Liefert fuer jeden der 20 Slots {number, empty, score} auf dem uebergebenen,
   * bereits auf 1200x900 entzerrten Seitenbild.
   *
   * Ehrlicher Stand (siehe CLAUDE_HANDOFF.md, Runde 2026-07-C): an 6 echten Fotos
   * (120 Slot-Entscheidungen) gemessen 98,3% Treffer, 0 Falsch-Positive (nie
   * "leer" bei tatsaechlich beklebtem Feld), 2 Falsch-Negative. Schwellwert wurde
   * an denselben 6 Fotos kalibriert, nicht an einem getrennten Testset.
   */
  function detectSlotStates(pixels, options) {
    const threshold = (options && options.threshold) || DEFAULT_THRESHOLD;
    return SLOTS.map((region, i) => {
      const score = colorDiversity(pixels, region);
      return { number: i + 1, empty: score < threshold, score, region };
    });
  }

  const PaniniTemplate = { SLOTS, detectSlotStates, DEFAULT_THRESHOLD };
  global.PaniniTemplate = PaniniTemplate;
  if (typeof module !== 'undefined' && module.exports) module.exports = PaniniTemplate;
})(typeof globalThis !== 'undefined' ? globalThis : this);
