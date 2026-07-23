(() => {
  'use strict';

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
    IRAN:'IRN', HAITI:'HAI'
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

  function repeatedCode(text) {
    const scores = [];
    for (const code of VALID_CODES) {
      const count = (String(text || '').toUpperCase().match(new RegExp(`\\b${code}\\b`, 'g')) || []).length;
      if (count >= 2) scores.push([code, count]);
    }
    scores.sort((a, b) => b[1] - a[1]);
    return scores[0]?.[0] || '';
  }

  async function recognizeCountry(source) {
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
      for (const degrees of [0, 180]) {
        const oriented = rotateCanvas(canonical, degrees);
        const sideWidth = oriented.width * 0.46;
        const titleRegions = [
          cropCanvas(oriented, 0, 0, sideWidth, oriented.height),
          cropCanvas(oriented, oriented.width - sideWidth, 0, sideWidth, oriented.height)
        ];
        for (const region of titleRegions) {
          const result = await worker.recognize(region);
          const code = titleCode(result.data?.text);
          if (code) return code;
        }
      }

      const codeScores = {};
      for (const degrees of [0, 180]) {
        const result = await worker.recognize(rotateCanvas(canonical, degrees));
        const text = String(result.data?.text || '').toUpperCase();
        for (const code of VALID_CODES) {
          const count = (text.match(new RegExp(`\\b${code}\\b`, 'g')) || []).length;
          if (count >= 2) codeScores[code] = (codeScores[code] || 0) + count;
        }
      }
      return Object.entries(codeScores).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    } catch (error) {
      console.warn('Stronger country recognition failed', error);
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

    el.country.value = '';
    el.code.value = '';
    message('Land wird nochmals gezielt geprüft …', 'work');
    const code = await recognizeCountry(originalPhoto);
    if (code) {
      el.code.value = code;
      el.country.value = NAMES[code] || '';
      message(`Erkannt: ${el.numbers.value || 'keine sicheren Nummern'}. ${NAMES[code] || code} (${code}) erkannt.`);
    } else {
      message(`Erkannt: ${el.numbers.value || 'keine sicheren Nummern'}. Land nicht sicher erkannt; bitte Land und Code ergänzen.`, 'err');
    }
  };
})();
