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
    worker = new Worker('./local-ai-worker.js?v=12', { type: 'module' });
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

  function parseCompactResult(text) {
    const raw = String(text || '').toUpperCase();
    const codeMatches = [...raw.matchAll(/\bCODE\s*[:=]\s*([A-Z]{3})\b/g)];
    const stateMatches = [...raw.matchAll(/\bSTATE\s*[:=]\s*([^\r\n]+)/g)];
    const code = codeMatches.at(-1)?.[1] || '';

    let state = '';
    for (let index = stateMatches.length - 1; index >= 0; index--) {
      const candidate = stateMatches[index][1].replace(/[^FEU]/g, '');
      if (candidate.length === 20) {
        state = candidate;
        break;
      }
    }

    if (!code || !state) {
      throw new Error('Die KI-Antwort war unvollständig. Bitte die Auswertung noch einmal starten.');
    }
    if (!VALID_CODES.has(code)) {
      throw new Error(`Der Teamcode ${code} wurde nicht sicher erkannt.`);
    }

    const missing = [];
    const uncertain = [];
    for (let index = 0; index < state.length; index++) {
      if (state[index] === 'E') missing.push(index + 1);
      else if (state[index] === 'U') uncertain.push(index + 1);
    }
    return { code, missing, uncertain, state };
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
      const result = parseCompactResult(output);
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
