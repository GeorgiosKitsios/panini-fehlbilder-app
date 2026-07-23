/*
 * Geometrische Grundlage fuer die Panini-Erkennung (Runde: Architektur-Fundament).
 *
 * Bewusst NICHT enthalten: 20-Felder-Klassifikation (leer/beklebt) und Teamcode-OCR.
 * Diese Datei liefert nur die geometrische Vorstufe:
 *   - detectOrientation:  0/90/180/270 Grad Korrekturrotation
 *   - detectPageBounds:   grobe, leicht gedrehte Rechteck-Kontur der Albumseite gegen den Hintergrund
 *   - computeHomography / dewarpPerspective: allgemeine 4-Punkt-Entzerrung (echte Perspektive, nicht nur Rotation)
 *
 * Arbeitet bewusst auf rohen Pixel-Puffern ({data,width,height}, RGBA Uint8ClampedArray-kompatibel),
 * nicht auf einem <canvas>-Objekt, damit die Funktionen ohne Browser/Canvas in Node/Vitest testbar sind.
 * Im Browser liefert detection/ui.js die Pixel per canvas.getContext('2d').getImageData(...).
 */
(function (global) {
  'use strict';

  function toGray(pixels) {
    const { data, width, height } = pixels;
    const gray = new Float32Array(width * height);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    return gray;
  }

  function sobelMagnitude(gray, width, height) {
    const mag = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const p = y * width + x;
        const tl = gray[p - width - 1], t = gray[p - width], tr = gray[p - width + 1];
        const l = gray[p - 1], r = gray[p + 1];
        const bl = gray[p + width - 1], b = gray[p + width], br = gray[p + width + 1];
        const gx = -tl - 2 * l - bl + tr + 2 * r + br;
        const gy = -tl - 2 * t - tr + bl + 2 * b + br;
        mag[p] = Math.hypot(gx, gy);
      }
    }
    return mag;
  }

  // ---------------------------------------------------------------------
  // Orientierung
  // ---------------------------------------------------------------------

  /**
   * Bestimmt, ob eine Vierteldrehung (90 Grad) noetig ist, damit die Doppelseite im
   * erwarteten Querformat vorliegt. Das ist rein aus dem Seitenverhaeltnis ableitbar und
   * daher immer korrekt (kein Heuristik-Raten): Querformat -> 0, Hochformat -> 90.
   *
   * WICHTIG - bewusste Einschraenkung: Diese Funktion loest NICHT die "Kopfstand"-Frage
   * (0 vs. 180, bzw. 90 vs. 270). Ob ein bereits queres Bild auf dem Kopf steht, ist ohne
   * inhaltliches Verstaendnis der Seite (Text-/Gesichtserkennung) nicht zuverlaessig rein
   * geometrisch entscheidbar - ein frueherer Versuch mit einer vermeintlich richtungssensitiven
   * Buchfalz-Heuristik erwies sich beim Nachrechnen als symmetrisch unter 180-Grad-Drehung und
   * haette nichts echtes unterschieden. Dafuer bleibt der vorhandene manuelle "Drehen"-Button
   * die Loesung, genau wie heute.
   */
  function detectOrientation(pixels) {
    return pixels.width >= pixels.height ? 0 : 90;
  }

  /**
   * Findet in einem bereits im Querformat vorliegenden Bild die plausibelste Spalte fuer den
   * Buchfalz (Steg zwischen den beiden Seiten): die vertikale Bildspalte mit der geringsten
   * lokalen Kantenaktivitaet in einem Streifen um die horizontale Bildmitte. Nuetzlich, um eine
   * Doppelseite spaeter in linke/rechte Einzelseite zu trennen. Loest NICHT die Kopfstand-Frage.
   */
  function locateSpine(pixels, options) {
    const opts = options || {};
    const searchRatio = opts.searchRatio != null ? opts.searchRatio : 0.2;
    const { width, height } = pixels;
    const gray = toGray(pixels);
    const mag = sobelMagnitude(gray, width, height);
    const y0 = Math.round(height * 0.1), y1 = Math.round(height * 0.9);
    const xCenter = width / 2;
    const xFrom = Math.max(1, Math.round(xCenter - width * searchRatio));
    const xTo = Math.min(width - 2, Math.round(xCenter + width * searchRatio));
    let bestX = Math.round(xCenter), bestScore = Infinity;
    for (let x = xFrom; x <= xTo; x++) {
      let sum = 0, count = 0;
      for (let y = y0; y < y1; y++) { sum += mag[y * width + x]; count++; }
      const score = count ? sum / count : Infinity;
      if (score < bestScore) { bestScore = score; bestX = x; }
    }
    return bestX;
  }

  // ---------------------------------------------------------------------
  // Seitenkontur gegenueber Hintergrund (Tisch/Boden), toleriert leichte Verkantung
  // ---------------------------------------------------------------------

  function estimateBackgroundColor(pixels) {
    const { data, width, height } = pixels;
    const marginX = Math.max(1, Math.round(width * 0.03));
    const marginY = Math.max(1, Math.round(height * 0.03));
    let r = 0, g = 0, b = 0, count = 0;
    function addPixel(x, y) {
      const i = (y * width + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
    }
    for (let x = 0; x < width; x += 2) { addPixel(x, 0); addPixel(x, height - 1); }
    for (let y = 0; y < height; y += 2) { addPixel(0, y); addPixel(width - 1, y); }
    for (let y = 0; y < marginY; y++) for (let x = 0; x < width; x += 3) addPixel(x, y);
    return count ? { r: r / count, g: g / count, b: b / count } : { r: 255, g: 255, b: 255 };
  }

  function rotatePoint(x, y, cx, cy, angleRad) {
    const dx = x - cx, dy = y - cy;
    const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  }

  /**
   * Findet eine grob rechteckige Kontur der Albumseite gegenueber dem Hintergrund
   * (z.B. Tisch, Boden). Toleriert eine leichte Verkantung (bis +/-15 Grad), erkennt
   * aber KEINE echte Kamera-Perspektive (Trapez durch schraeg gehaltene Kamera) --
   * dafuer ist computeHomography/dewarpPerspective zustaendig, sobald die 4 echten
   * Ecken bekannt sind (z.B. spaeter durch einen praeziseren Detektor).
   *
   * Ansatz: Inhalts-Pixel = deutlich vom geschaetzten Rand-Hintergrund abweichende Farbe
   * ODER hohe Kantenstaerke. Für einen kleinen Satz Kandidatenwinkel wird die
   * achsenausgerichtete Bounding-Box der (gedrehten) Inhaltspunkte berechnet; der Winkel
   * mit der kleinsten Flaeche gewinnt (angenaeherter minAreaRect-Ansatz ohne CV-Bibliothek).
   */
  function detectPageBounds(pixels, options) {
    const opts = options || {};
    const angleStepDeg = opts.angleStepDeg || 3;
    const maxAngleDeg = opts.maxAngleDeg != null ? opts.maxAngleDeg : 15;
    const colorThreshold = opts.colorThreshold != null ? opts.colorThreshold : 40;
    const sampleStride = opts.sampleStride || 4;

    const { data, width, height } = pixels;
    const gray = toGray(pixels);
    const mag = sobelMagnitude(gray, width, height);
    const bg = estimateBackgroundColor(pixels);

    const points = [];
    for (let y = 0; y < height; y += sampleStride) {
      for (let x = 0; x < width; x += sampleStride) {
        const i = (y * width + x) * 4;
        const dr = data[i] - bg.r, dg = data[i + 1] - bg.g, db = data[i + 2] - bg.b;
        const colorDist = Math.sqrt(dr * dr + dg * dg + db * db);
        const edge = mag[y * width + x] || 0;
        if (colorDist > colorThreshold || edge > 90) points.push({ x, y });
      }
    }

    if (!points.length) {
      return { corners: rectCorners(0, 0, width, height), angleDeg: 0, contentRatio: 0 };
    }

    const cx = width / 2, cy = height / 2;
    let bestAngleDeg = 0, bestArea = Infinity, bestBox = null;
    for (let a = -maxAngleDeg; a <= maxAngleDeg; a += angleStepDeg) {
      const rad = (a * Math.PI) / 180;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const pt of points) {
        const r = rotatePoint(pt.x, pt.y, cx, cy, -rad);
        if (r.x < minX) minX = r.x;
        if (r.y < minY) minY = r.y;
        if (r.x > maxX) maxX = r.x;
        if (r.y > maxY) maxY = r.y;
      }
      const area = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
      if (area < bestArea) {
        bestArea = area; bestAngleDeg = a; bestBox = { minX, minY, maxX, maxY };
      }
    }

    const rad = (bestAngleDeg * Math.PI) / 180;
    const localCorners = [
      { x: bestBox.minX, y: bestBox.minY },
      { x: bestBox.maxX, y: bestBox.minY },
      { x: bestBox.maxX, y: bestBox.maxY },
      { x: bestBox.minX, y: bestBox.maxY },
    ];
    const corners = localCorners.map(pt => rotatePoint(pt.x, pt.y, cx, cy, rad));
    const contentRatio = (points.length * sampleStride * sampleStride) / (width * height);

    return { corners, angleDeg: bestAngleDeg, contentRatio: Math.min(1, contentRatio) };
  }

  function rectCorners(x0, y0, x1, y1) {
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  }

  // ---------------------------------------------------------------------
  // Allgemeine 4-Punkt-Homographie und Entzerrung (echte Perspektive, nicht nur Rotation)
  // ---------------------------------------------------------------------

  function solveLinearSystem(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
      }
      if (pivot !== col) { const tmp = M[pivot]; M[pivot] = M[col]; M[col] = tmp; }
      const pivotVal = M[col][col];
      if (Math.abs(pivotVal) < 1e-12) continue;
      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const factor = M[row][col] / pivotVal;
        for (let k = col; k <= n; k++) M[row][k] -= factor * M[col][k];
      }
    }
    return M.map((row, i) => row[n] / (row[i] || 1e-12));
  }

  /**
   * Berechnet die 3x3-Homographie-Matrix (als 8 Parameter a..h, i=1), die die 4 Punkte
   * `fromPts` exakt auf die 4 Punkte `toPts` abbildet. Reihenfolge beider Listen muss
   * uebereinstimmen (z.B. TL,TR,BR,BL).
   */
  function computeHomography(fromPts, toPts) {
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
      const { x, y } = fromPts[i];
      const { x: X, y: Y } = toPts[i];
      A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
      b.push(X);
      A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
      b.push(Y);
    }
    const [a, bb, c, d, e, f, g, h] = solveLinearSystem(A, b);
    return { a, b: bb, c, d, e, f, g, h };
  }

  function applyHomography(H, x, y) {
    const denom = H.g * x + H.h * y + 1;
    return {
      x: (H.a * x + H.b * y + H.c) / denom,
      y: (H.d * x + H.e * y + H.f) / denom,
    };
  }

  /**
   * Entzerrt den Bereich `corners` (4 Punkte, Reihenfolge TL,TR,BR,BL, im Quellbild) in ein
   * neues outWidth x outHeight Pixelbild. Nutzt echte projektive Entzerrung (keine reine
   * Rotation/Affine), Nearest-Neighbor-Sampling.
   */
  function dewarpPerspective(pixels, corners, outWidth, outHeight) {
    const dest = rectCorners(0, 0, outWidth - 1, outHeight - 1);
    const H = computeHomography(dest, corners);
    const { data, width, height } = pixels;
    const out = new Uint8ClampedArray(outWidth * outHeight * 4);
    for (let y = 0; y < outHeight; y++) {
      for (let x = 0; x < outWidth; x++) {
        const src = applyHomography(H, x, y);
        const sx = Math.min(width - 1, Math.max(0, Math.round(src.x)));
        const sy = Math.min(height - 1, Math.max(0, Math.round(src.y)));
        const si = (sy * width + sx) * 4;
        const di = (y * outWidth + x) * 4;
        out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
      }
    }
    return { data: out, width: outWidth, height: outHeight };
  }

  const PaniniGeometry = {
    toGray,
    sobelMagnitude,
    detectOrientation,
    locateSpine,
    detectPageBounds,
    computeHomography,
    applyHomography,
    dewarpPerspective,
    rectCorners,
  };

  global.PaniniGeometry = PaniniGeometry;
  if (typeof module !== 'undefined' && module.exports) module.exports = PaniniGeometry;
})(typeof globalThis !== 'undefined' ? globalThis : this);
