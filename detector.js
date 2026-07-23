(() => {
  'use strict';

  const BASE_W = 1536;
  const BASE_H = 1152;
  const HALF_W = 70 / BASE_W;
  const HALF_H = 90 / BASE_H;
  const CENTERS = {
    1:[460,250],2:[625,250],3:[165,485],4:[330,485],5:[495,485],6:[665,485],
    7:[165,715],8:[330,715],9:[500,715],10:[665,715],11:[895,250],12:[1060,250],
    13:[1260,250],14:[895,485],15:[1060,485],16:[1230,485],17:[1400,485],
    18:[1060,715],19:[1230,715],20:[1400,715]
  };

  const COUNTRY_WORDS = {
    SWEDEN:'SWE',SVERIGE:'SWE',
    TUNISIA:'TUN',TUNISIE:'TUN',TUNISIAH:'TUN',
    JAPAN:'JPN',
    ECUADOR:'ECU',
    CURACAO:'CUW',CURACAOAO:'CUW',
    NETHERLANDS:'NED',HOLLAND:'NED',
    AUSTRALIA:'AUS',
    TURKEY:'TUR',TURKIYE:'TUR',TURKIYE:'TUR',
    MEXICO:'MEX',
    SOUTHAFRICA:'RSA',
    KOREA:'KOR',
    CZECHIA:'CZE',
    CANADA:'CAN',
    QATAR:'QAT',
    SWITZERLAND:'SUI',
    BRAZIL:'BRA',
    MOROCCO:'MAR',
    SCOTLAND:'SCO',
    PARAGUAY:'PAR',
    GERMANY:'GER',
    ARGENTINA:'ARG',
    AUSTRIA:'AUT',
    PORTUGAL:'POR',
    COLOMBIA:'COL',
    ENGLAND:'ENG',
    CROATIA:'CRO',
    GHANA:'GHA',
    PANAMA:'PAN'
  };

  // Logistic classifier trained only on anonymous image features from the supplied album pages.
  const MEAN = [35.86274347, 0.18822743, 86.13667021, 149.56106, 34.17270463];
  const SCALE = [7.97792671, 0.06266038, 25.71020591, 20.05058236, 11.62719658];
  const COEF = [-0.11048085, -2.81585962, -1.23803045, 1.25249674, -0.51035484];
  const INTERCEPT = -2.31635466;
  const EMPTY_LIMIT = 0.65;
  const UNCERTAIN_LIMIT = 0.35;

  let cleanPhoto = null;

  function cloneCanvas(source) {
    const c = document.createElement('canvas');
    c.width = source.width;
    c.height = source.height;
    c.getContext('2d', {alpha:false}).drawImage(source, 0, 0);
    return c;
  }

  function rotateCanvas(source, degrees) {
    if (!degrees) return cloneCanvas(source);
    const swap = degrees === 90 || degrees === 270;
    const c = document.createElement('canvas');
    c.width = swap ? source.height : source.width;
    c.height = swap ? source.width : source.height;
    const x = c.getContext('2d', {alpha:false});
    x.fillStyle = '#fff';
    x.fillRect(0, 0, c.width, c.height);
    x.translate(c.width / 2, c.height / 2);
    x.rotate(degrees * Math.PI / 180);
    x.drawImage(source, -source.width / 2, -source.height / 2);
    return c;
  }

  function canonicalPhoto() {
    let source = cleanPhoto ? cloneCanvas(cleanPhoto) : cloneCanvas(el.canvas);
    if (source.height > source.width) source = rotateCanvas(source, 90);
    return source;
  }

  function patchFeatures(canvas, number) {
    const [baseX, baseY] = CENTERS[number];
    const cx = baseX / BASE_W * canvas.width;
    const cy = baseY / BASE_H * canvas.height;
    const hw = HALF_W * canvas.width;
    const hh = HALF_H * canvas.height;
    const x0 = Math.max(0, Math.round(cx - hw));
    const y0 = Math.max(0, Math.round(cy - hh));
    const w = Math.min(canvas.width - x0, Math.max(8, Math.round(hw * 2)));
    const h = Math.min(canvas.height - y0, Math.max(8, Math.round(hh * 2)));
    const data = canvas.getContext('2d', {willReadFrequently:true}).getImageData(x0, y0, w, h).data;
    const count = w * h;
    const gray = new Float32Array(count);
    let graySum = 0, graySq = 0, satSum = 0, valSum = 0, valSq = 0;

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max * 255;
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      gray[p] = y;
      graySum += y;
      graySq += y * y;
      satSum += saturation;
      valSum += max;
      valSq += max * max;
    }

    let edgeCount = 0, edgeTotal = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        const tl = gray[p - w - 1], t = gray[p - w], tr = gray[p - w + 1];
        const l = gray[p - 1], r = gray[p + 1];
        const bl = gray[p + w - 1], b = gray[p + w], br = gray[p + w + 1];
        const gx = -tl - 2 * l - bl + tr + 2 * r + br;
        const gy = -tl - 2 * t - tr + bl + 2 * b + br;
        if (Math.hypot(gx, gy) > 80) edgeCount++;
        edgeTotal++;
      }
    }

    const grayMean = graySum / count;
    const valMean = valSum / count;
    return {
      box:{x:x0,y:y0,w,h},
      values:[
        Math.sqrt(Math.max(0, graySq / count - grayMean * grayMean)),
        edgeTotal ? edgeCount / edgeTotal : 0,
        satSum / count,
        valMean,
        Math.sqrt(Math.max(0, valSq / count - valMean * valMean))
      ]
    };
  }

  function probability(values) {
    let z = INTERCEPT;
    for (let i = 0; i < values.length; i++) z += COEF[i] * ((values[i] - MEAN[i]) / SCALE[i]);
    return 1 / (1 + Math.exp(-z));
  }

  function classify(canvas) {
    const results = [];
    for (let n = 1; n <= 20; n++) {
      const feature = patchFeatures(canvas, n);
      results.push({number:n, probability:probability(feature.values), box:feature.box});
    }
    return results;
  }

  function showMarkedPhoto(source, results) {
    el.canvas.width = source.width;
    el.canvas.height = source.height;
    const x = el.canvas.getContext('2d', {alpha:false});
    x.drawImage(source, 0, 0);
    x.lineWidth = Math.max(4, source.width / 300);
    x.font = `bold ${Math.max(22, source.width / 45)}px system-ui`;
    x.textBaseline = 'top';

    for (const result of results) {
      if (result.probability < UNCERTAIN_LIMIT) continue;
      const certain = result.probability >= EMPTY_LIMIT;
      x.strokeStyle = certain ? '#00a65a' : '#ff9800';
      x.fillStyle = certain ? '#00a65a' : '#ff9800';
      x.strokeRect(result.box.x, result.box.y, result.box.w, result.box.h);
      const label = `${result.number}`;
      const width = x.measureText(label).width + 14;
      x.fillRect(result.box.x, result.box.y, width, Math.max(30, source.width / 34));
      x.fillStyle = '#fff';
      x.fillText(label, result.box.x + 7, result.box.y + 2);
    }
    image = {width:el.canvas.width,height:el.canvas.height};
  }

  function compactText(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z]/g, '');
  }

  async function detectTeamCode(source) {
    let worker;
    try {
      await loadOCR();
      worker = await Tesseract.createWorker('eng');
      await worker.setParameters({
        tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        preserve_interword_spaces:'1',
        tessedit_pageseg_mode:'11'
      });
      const scores = {};
      for (const deg of [0, 90, 180, 270]) {
        const result = await worker.recognize(rotateCanvas(source, deg));
        const text = String(result.data?.text || '').toUpperCase();
        const compact = compactText(text);

        for (const code of VALID_CODES) {
          const matches = text.match(new RegExp(`\\b${code}\\b`, 'g'));
          if (matches) scores[code] = (scores[code] || 0) + matches.length * 4;
        }

        for (const [word, code] of Object.entries(COUNTRY_WORDS)) {
          if (compact.includes(word)) scores[code] = (scores[code] || 0) + 3;
        }
      }
      const best = Object.entries(scores).sort((a,b) => b[1] - a[1])[0];
      return best ? best[0] : '';
    } catch (error) {
      console.warn('Teamcode OCR failed', error);
      return '';
    } finally {
      if (worker) await worker.terminate();
    }
  }

  const originalSetCanvas = setCanvasFromSource;
  setCanvasFromSource = function(source, width, height) {
    originalSetCanvas(source, width, height);
    cleanPhoto = cloneCanvas(el.canvas);
    el.country.value = '';
    el.code.value = '';
    setNumbers([]);
  };

  const originalRotate = el.rotate.onclick;
  el.rotate.onclick = () => {
    originalRotate();
    cleanPhoto = cloneCanvas(el.canvas);
  };

  const originalRemove = el.removePhoto.onclick;
  el.removePhoto.onclick = () => {
    originalRemove();
    cleanPhoto = null;
    el.country.value = '';
    el.code.value = '';
    setNumbers([]);
  };

  if (image && el.canvas.width) cleanPhoto = cloneCanvas(el.canvas);

  el.ocr.textContent = '🔎 Leere Felder erkennen';
  const warning = document.querySelector('.warn');
  if (warning) warning.innerHTML = '<b>Automatische Bilderkennung:</b> Die App prüft die 20 festen Stickerpositionen auf leere Felder und liest anschließend Land beziehungsweise Teamcode. Grün bedeutet erkannt, Orange bedeutet unsicher. Bitte kurz kontrollieren.';

  el.ocr.onclick = async () => {
    if (!image) return;
    el.ocr.disabled = true;
    message('Prüfe Stickerfelder und Land …', 'work');
    try {
      const source = canonicalPhoto();
      const ratio = source.width / source.height;
      if (Math.abs(ratio - 4 / 3) > 0.22) {
        message('Das Foto ist nicht vollständig im erwarteten Doppelseiten-Format. Bitte die ganze Doppelseite möglichst gerade fotografieren.', 'err');
        return;
      }
      const results = classify(source);
      const missing = results.filter(r => r.probability >= EMPTY_LIMIT).map(r => r.number);
      const uncertain = results.filter(r => r.probability >= UNCERTAIN_LIMIT && r.probability < EMPTY_LIMIT).map(r => r.number);
      showMarkedPhoto(source, results);
      setNumbers(missing);

      const code = await detectTeamCode(source);
      if (code) {
        el.code.value = code;
        el.country.value = NAMES[code] || '';
      }

      const countryNote = code ? `${NAMES[code] || code} (${code}) erkannt.` : 'Land nicht sicher erkannt; bitte Land und Code manuell auswählen.';
      if (!missing.length) {
        message(`Keine leeren Felder sicher erkannt. ${countryNote}`, 'err');
      } else if (uncertain.length) {
        message(`Erkannt: ${missing.join(', ')}. Unsicher: ${uncertain.join(', ')}. ${countryNote}`);
      } else {
        message(`Erkannt: ${missing.join(', ')}. ${countryNote}`);
      }
    } catch (error) {
      console.error(error);
      message('Die Bilderkennung konnte nicht ausgeführt werden. Bitte das Foto erneut aufnehmen.', 'err');
    } finally {
      el.ocr.disabled = false;
    }
  };
})();
