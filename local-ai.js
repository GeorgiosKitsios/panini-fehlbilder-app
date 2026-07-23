(() => {
  'use strict';

  const MODEL_NOTE = 'Lokale KI: Das Modell wird beim ersten Einsatz einmal auf dieses Handy geladen. Fotos bleiben auf dem Gerät und werden nicht hochgeladen.';
  let worker = null;
  let modelReady = false;
  let busy = false;
  let pendingResolve = null;
  let pendingReject = null;

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker('./local-ai-worker.js?v=11', { type: 'module' });
    worker.onmessage = (event) => {
      const data = event.data || {};
      if (data.status === 'progress') {
        const progress = Number(data.event?.progress);
        if (Number.isFinite(progress)) {
          message(`Lokales KI-Modell wird geladen … ${Math.round(progress)} %`, 'work');
        } else {
          message('Lokales KI-Modell wird geladen …', 'work');
        }
      } else if (data.status === 'ready') {
        modelReady = true;
        if (pendingResolve) pendingResolve(data);
        pendingResolve = pendingReject = null;
      } else if (data.status === 'analysing') {
        message('Die lokale KI prüft alle 20 Stickerfelder …', 'work');
      } else if (data.status === 'complete') {
        if (pendingResolve) pendingResolve(data.output);
        pendingResolve = pendingReject = null;
      } else if (data.status === 'error') {
        if (pendingReject) pendingReject(new Error(data.error || 'Unbekannter KI-Fehler'));
        pendingResolve = pendingReject = null;
      }
    };
    worker.onerror = (event) => {
      if (pendingReject) pendingReject(new Error(event.message || 'Das lokale KI-Modell konnte nicht gestartet werden.'));
      pendingResolve = pendingReject = null;
    };
    return worker;
  }

  function waitFor(type, payload) {
    return new Promise((resolve, reject) => {
      pendingResolve = resolve;
      pendingReject = reject;
      ensureWorker().postMessage({ type, ...payload });
    });
  }

  async function loadModel() {
    if (modelReady) return;
    message('Lokales KI-Modell wird erstmals auf das Handy geladen. Das kann einige Minuten dauern …', 'work');
    await waitFor('load', {});
  }

  function canvasForAI() {
    const source = el.canvas;
    const maxSide = 1280;
    const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.84);
  }

  function extractJSON(text) {
    const cleaned = String(text || '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const candidates = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = 0; index < cleaned.length; index++) {
      const char = cleaned[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        if (depth === 0) start = index;
        depth++;
      } else if (char === '}' && depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) {
          candidates.push(cleaned.slice(start, index + 1));
          start = -1;
        }
      }
    }

    for (let index = candidates.length - 1; index >= 0; index--) {
      try {
        const value = JSON.parse(candidates[index]);
        if (value && typeof value === 'object' && value.code && value.positions) return value;
      } catch {}
    }
    throw new Error('Die KI-Antwort konnte nicht als vollständiges JSON gelesen werden.');
  }

  function validateResult(value) {
    const code = String(value.code || '').trim().toUpperCase();
    if (!VALID_CODES.has(code)) throw new Error(`Der Teamcode ${code || 'ist leer'} wurde nicht sicher erkannt.`);

    const positions = value.positions;
    if (!positions || typeof positions !== 'object' || Array.isArray(positions)) {
      throw new Error('Die KI hat keine gültige Positionsliste geliefert. Bitte erneut versuchen.');
    }
    const positionKeys = Object.keys(positions);
    if (positionKeys.length !== 20 || positionKeys.some((key) => !/^(?:[1-9]|1\d|20)$/.test(key))) {
      throw new Error(`Die KI hat keine vollständige 1–20-Positionsliste geliefert (${positionKeys.length}/20). Bitte erneut versuchen.`);
    }

    const missing = [];
    const uncertain = [];
    let seen = 0;

    for (let number = 1; number <= 20; number++) {
      const status = String(positions[String(number)] || '').trim().toLowerCase();
      if (!status) throw new Error(`Die KI hat Feld ${number} nicht bewertet (nur ${seen}/20 Felder geliefert). Bitte erneut versuchen oder manuell eintragen.`);
      if (status === 'empty') missing.push(number);
      else if (status === 'unclear') uncertain.push(number);
      else if (status !== 'filled') throw new Error(`Unbekannter Status "${status}" bei Feld ${number}. Bitte erneut versuchen oder manuell eintragen.`);
      seen++;
    }

    return { code, missing, uncertain };
  }

  function setIdleButton() {
    el.ocr.textContent = 'KI lokal auswerten';
    el.ocr.disabled = !image || busy;
    el.ocr.title = MODEL_NOTE;
  }

  const originalSetCanvas = setCanvasFromSource;
  setCanvasFromSource = function(source, width, height) {
    originalSetCanvas(source, width, height);
    el.country.value = '';
    el.code.value = '';
    setNumbers([]);
    setIdleButton();
    message('Foto geladen. Jetzt mit der lokalen KI auswerten.', 'ok');
  };

  const originalRemovePhoto = el.removePhoto.onclick;
  el.removePhoto.onclick = () => {
    originalRemovePhoto();
    el.country.value = '';
    el.code.value = '';
    setNumbers([]);
    setIdleButton();
  };

  const warning = document.querySelector('.warn');
  if (warning) warning.innerHTML = `<b>Lokale KI auf dem Handy:</b> ${MODEL_NOTE} Die Erkennung läuft ohne Cloud-Server. Bitte das Ergebnis vor dem Speichern kurz kontrollieren.`;

  el.ocr.onclick = async () => {
    if (!image || busy) return;
    busy = true;
    setIdleButton();
    el.ocr.textContent = 'KI arbeitet …';
    el.country.value = '';
    el.code.value = '';
    setNumbers([]);

    try {
      if (!navigator.gpu) throw new Error('Dieses Android-Gerät unterstützt WebGPU nicht. Bitte Chrome aktualisieren.');
      await loadModel();
      const output = await waitFor('analyse', { image: canvasForAI() });
      console.debug('[local-ai] Rohantwort:', output);
      const result = validateResult(extractJSON(output));
      el.code.value = result.code;
      el.country.value = NAMES[result.code] || result.code;
      setNumbers(result.missing);
      const uncertainText = result.uncertain.length ? ` Unsicher: ${result.uncertain.join(', ')}.` : '';
      message(`${el.country.value} (${result.code}) erkannt. Fehlend: ${result.missing.length ? result.missing.join(', ') : 'keine'}.${uncertainText} Bitte kurz kontrollieren.`, result.uncertain.length ? 'work' : 'ok');
    } catch (error) {
      console.error(error);
      message(error instanceof Error ? error.message : 'Die lokale KI konnte das Foto nicht auswerten.', 'err');
    } finally {
      busy = false;
      setIdleButton();
    }
  };

  setIdleButton();
})();
