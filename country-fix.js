(() => {
  'use strict';

  const BASE_W = 1536;
  const BASE_H = 1152;
  const CENTERS = {
    1:[460,250],2:[625,250],3:[165,485],4:[330,485],5:[495,485],6:[665,485],
    7:[165,715],8:[330,715],9:[500,715],10:[665,715],11:[895,250],12:[1060,250],
    13:[1260,250],14:[895,485],15:[1060,485],16:[1230,485],17:[1400,485],
    18:[1060,715],19:[1230,715],20:[1400,715]
  };

  const COUNTRY_TITLES = {
    JAPAN:'JPN', SWEDEN:'SWE', SVERIGE:'SWE', TUNISIA:'TUN', TUNISIE:'TUN',
    ECUADOR:'ECU', CURACAO:'CUW', NETHERLANDS:'NED', HOLLAND:'NED',
    AUSTRALIA:'AUS', TURKEY:'TUR', TURKIYE:'TUR', MEXICO:'MEX',
    SOUTHAFRICA:'RSA', KOREA:'KOR', CZECHIA:'CZE', CANADA:'CAN', QATAR:'QAT',
    SWITZERLAND:'SUI', BRAZIL:'BRA', MOROCCO:'MAR', SCOTLAND:'SCO',
    PARAGUAY:'PAR', GERMANY:'GER', ARGENTINA:'ARG', AUSTRIA:'AUT',
    PORTUGAL:'POR', COLOMBIA:'COL', ENGLAND:'ENG', CROATIA:'CRO',
    GHANA:'GHA', PANAMA:'PAN', NEWZEALAND:'NZL', SPAIN:'ESP', FRANCE:'FRA',
    SENEGAL:'SEN', NORWAY:'NOR', ALGERIA:'ALG', BELGIUM:'BEL', EGYPT:'EGY',
    IRAN:'IRN', HAITI:'HAI', SAUDIARABIA:'KSA', URUGUAY:'URU'
  };

  function cloneCanvas(source) {
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext('2d', {alpha:false}).drawImage(source, 0, 0);
    return canvas;
  }

  function rotateCanvas(source, degrees) {
    if (!degrees) return cloneCanvas(source);
    const swap = degrees === 90 || degrees === 270;
    const canvas = document.createElement('canvas');
    canvas.width = swap ? source.height : source.width;
    canvas.height = swap ? source.width : source.height;
    const context = canvas.getContext('2d', {alpha:false});
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(degrees * Math.PI / 180);
    context.drawImage(source, -source.width / 2, -source.height / 2);
    return canvas;
  }

  function cropCanvas(source, x, y, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    canvas.getContext('2d', {alpha:false}).drawImage(
      source, x, y, width, height, 0, 0, canvas.width, canvas.height
    );
    return canvas;
  }

  function canonicalCanvas(source) {
    let canvas = source.height > source.width ? rotateCanvas(source, 90) : cloneCanvas(source);
    const targetRatio = 4 / 3;
    const ratio = canvas.width / canvas.height;
    if (ratio > targetRatio) {
      const width = canvas.height * targetRatio;
      canvas = cropCanvas(canvas, (canvas.width - width) / 2, 0, width, canvas.height);
    } else if (ratio < targetRatio) {
      const height = canvas.width / targetRatio;
      canvas = cropCanvas(canvas, 0, (canvas.height - height) / 2, canvas.width, height);
    }
    return canvas;
  }

  function compact(text) {
    return String(text || '').toUpperCase().replace(/[^A-Z]/g, '');
  }

  function titleCode(text) {
    const joined = compact(text);
    for (const [title, code] of Object.entries(COUNTRY_TITLES)) {
      if (joined.includes(title)) return code;
    }
    return '';
  }

  function validCodesIn(text) {
    const upper = String(text || '').toUpperCase();
    const compacted = compact(upper);
    const found = [];
    for (const code of VALID_CODES) {
      if (new RegExp(`\\b${code}\\b`).test(upper) || compacted.includes(code)) found.push(code);
    }
    return found;
  }

  function emptyFieldCrop(source, number) {
    const center = CENTERS[number];
    if (!center) return null;
    const cx = center[0] / BASE_W * source.width;
    const cy = center[1] / BASE_H * source.height;
    const width = source.width * 0.115;
    const height = source.height * 0.19;
    return cropCanvas(source, cx - width / 2, cy - height / 2, width, height);
  }

  function prepareField(source) {
    const scale = Math.min(4, 720 / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const context = canvas.getContext('2d', {alpha:false, willReadFrequently:true});
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const value = Math.max(0, Math.min(255, (gray - 128) * 1.8 + 128));
      data[i] = data[i + 1] = data[i + 2] = value;
    }
    context.putImageData(image, 0, 0);
    return canvas;
  }

  async function recognizeCountry(source, missingNumbers) {
    let worker;
    try {
      await loadOCR();
      worker = await Tesseract.createWorker('eng');
      await worker.setParameters({
        tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        preserve_interword_spaces:'1',
        tessedit_pageseg_mode:'11'
      });

      const canonical = canonicalCanvas(source);

      // First read the large country title on the outer halves of the spread.
      for (const degrees of [0, 180]) {
        const oriented = rotateCanvas(canonical, degrees);
        const sideWidth = oriented.width * 0.44;
        const regions = [
          cropCanvas(oriented, 0, 0, sideWidth, oriented.height),
          cropCanvas(oriented, oriented.width - sideWidth, 0, sideWidth, oriented.height)
        ];
        for (const region of regions) {
          const result = await worker.recognize(region);
          const code = titleCode(result.data?.text);
          if (code) return code;
        }
      }

      // Then read the repeated three-letter code inside the detected empty fields.
      const votes = {};
      const candidates = missingNumbers.length ? missingNumbers : Array.from({length:20}, (_, index) => index + 1);
      await worker.setParameters({
        tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        preserve_interword_spaces:'1',
        tessedit_pageseg_mode:'6'
      });

      for (const number of candidates.slice(0, 10)) {
        const field = emptyFieldCrop(canonical, number);
        if (!field) continue;
        const result = await worker.recognize(prepareField(field));
        for (const code of validCodesIn(result.data?.text)) {
          votes[code] = (votes[code] || 0) + 1;
          if (votes[code] >= 2) return code;
        }
      }

      const bestVote = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
      if (bestVote && bestVote[1] >= 1) return bestVote[0];

      // Final fallback: a code must occur repeatedly on the full page.
      const fullScores = {};
      await worker.setParameters({
        tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        preserve_interword_spaces:'1',
        tessedit_pageseg_mode:'11'
      });
      for (const degrees of [0, 180]) {
        const result = await worker.recognize(rotateCanvas(canonical, degrees));
        const upper = String(result.data?.text || '').toUpperCase();
        for (const code of VALID_CODES) {
          const count = (upper.match(new RegExp(`\\b${code}\\b`, 'g')) || []).length;
          if (count >= 2) fullScores[code] = (fullScores[code] || 0) + count;
        }
      }
      return Object.entries(fullScores).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    } catch (error) {
      console.warn('Country recognition failed', error);
      return '';
    } finally {
      if (worker) await worker.terminate();
    }
  }

  const previousRecognition = el.ocr.onclick;
  el.ocr.onclick = async () => {
    if (!image) return;
    const originalPhoto = cloneCanvas(el.canvas);
    await previousRecognition();

    el.ocr.disabled = true;
    el.country.value = '';
    el.code.value = '';
    message('Land und Teamcode werden gezielt geprüft …', 'work');

    const missingNumbers = nums(el.numbers.value);
    const code = await recognizeCountry(originalPhoto, missingNumbers);
    if (code) {
      el.code.value = code;
      el.country.value = NAMES[code] || '';
      message(`Erkannt: ${el.numbers.value || 'keine sicheren Nummern'}. ${NAMES[code] || code} (${code}) erkannt.`);
    } else {
      message(`Erkannt: ${el.numbers.value || 'keine sicheren Nummern'}. Land nicht sicher erkannt; bitte Land und Code ergänzen.`, 'err');
    }
    el.ocr.disabled = false;
  };
})();
