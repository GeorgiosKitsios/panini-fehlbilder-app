/*
 * Generische Hilfsfunktion: Connected-Components auf einem booleschen Block-Gitter.
 * Wird von detection/ocr.js genutzt, um benachbarte Kandidatenbloecke (siehe dort)
 * zu einer zusammenhaengenden Region zusammenzufassen.
 */
(function (global) {
  'use strict';

  function connectedComponents(mask, cols, rows) {
    const visited = new Uint8Array(cols * rows);
    const components = [];
    for (let start = 0; start < cols * rows; start++) {
      if (!mask[start] || visited[start]) continue;
      const queue = [start];
      visited[start] = 1;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, size = 0;
      while (queue.length) {
        const idx = queue.pop();
        const bx = idx % cols, by = (idx - bx) / cols;
        minX = Math.min(minX, bx); maxX = Math.max(maxX, bx);
        minY = Math.min(minY, by); maxY = Math.max(maxY, by);
        size++;
        const neighbors = [idx - 1, idx + 1, idx - cols, idx + cols];
        for (const n of neighbors) {
          if (n < 0 || n >= cols * rows) continue;
          if (n % cols === 0 && idx % cols === cols - 1) continue; // Zeilenumbruch links
          if (idx % cols === 0 && n % cols === cols - 1) continue; // Zeilenumbruch rechts
          if (mask[n] && !visited[n]) { visited[n] = 1; queue.push(n); }
        }
      }
      components.push({ minX, minY, maxX, maxY, size });
    }
    return components;
  }

  const PaniniFields = { connectedComponents };
  global.PaniniFields = PaniniFields;
  if (typeof module !== 'undefined' && module.exports) module.exports = PaniniFields;
})(typeof globalThis !== 'undefined' ? globalThis : this);
