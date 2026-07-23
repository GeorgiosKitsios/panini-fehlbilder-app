(() => {
  'use strict';

  const FLAG_KEY = 'panini-labs';

  function readLabsFlag() {
    const params = new URLSearchParams(location.search);
    if (params.has('labs')) {
      const value = params.get('labs');
      if (value === '0') { localStorage.removeItem(FLAG_KEY); return false; }
      localStorage.setItem(FLAG_KEY, '1');
      return true;
    }
    return localStorage.getItem(FLAG_KEY) === '1';
  }

  const labsEnabled = readLabsFlag();
  // Ohne ?labs=1 / localStorage-Flag bleibt das Verhalten fuer alle GitHub-Pages-Besucher
  // exakt wie im ausgelieferten index.html (Button deaktiviert, "in Entwicklung").
  if (!labsEnabled) return;

  function updateOcrButton() {
    el.ocr.disabled = !image;
    el.ocr.textContent = '🔎 Fehlende Nummern vorschlagen (Labs)';
    el.ocr.title = 'Entwicklungsvorschau: schlägt fehlende Nummern anhand des Fotos vor. Bitte immer mit der echten Albumseite vergleichen, bevor du speicherst. Teamcode bitte weiterhin selbst eintragen.';
  }

  const warning = document.querySelector('.warn');
  if (warning) {
    warning.innerHTML = '<b>Labs-Modus aktiv:</b> Diese Vorschau schlägt fehlende Nummern anhand des Fotos vor (getestet an 6 echten Fotos: 98% Trefferquote, keine Falsch-Treffer, aber noch nicht auf einem Android-Gerät geprüft). Bitte den Vorschlag immer mit der echten Albumseite abgleichen, bevor du speicherst. Teamcode bitte weiterhin selbst eintragen.';
  }

  const originalSetCanvas = setCanvasFromSource;
  setCanvasFromSource = function (source, width, height) {
    originalSetCanvas(source, width, height);
    updateOcrButton();
  };

  const originalRemovePhoto = el.removePhoto.onclick;
  el.removePhoto.onclick = () => {
    originalRemovePhoto();
    updateOcrButton();
  };

  el.ocr.onclick = () => {
    if (!image) return;
    try {
      const ctx = el.canvas.getContext('2d', { willReadFrequently: true });
      const imageData = ctx.getImageData(0, 0, el.canvas.width, el.canvas.height);
      const pixels = { data: imageData.data, width: imageData.width, height: imageData.height };

      const quarterTurnNeeded = PaniniGeometry.detectOrientation(pixels);
      if (quarterTurnNeeded === 90) {
        message('Hochformat erkannt. Bitte zuerst den "↻ Drehen"-Button nutzen, damit die Doppelseite quer liegt, dann erneut versuchen.', 'err');
        return;
      }

      const bounds = PaniniGeometry.detectPageBounds(pixels);
      const page = PaniniGeometry.dewarpPerspective(pixels, bounds.corners, 1200, 900);
      const states = PaniniTemplate.detectSlotStates(page);
      const missing = states.filter(s => s.empty).map(s => s.number);

      setNumbers(missing);
      message(
        missing.length
          ? `Vorschlag: ${missing.length} möglicherweise fehlende Nummer(n): ${missing.join(', ')}. Bitte mit der echten Albumseite abgleichen und Teamcode selbst eintragen, bevor du speicherst.`
          : 'Keine fehlenden Nummern vorgeschlagen. Bitte trotzdem mit der echten Albumseite abgleichen, falls doch etwas fehlt.',
        'work'
      );
    } catch (error) {
      console.error(error);
      message('Erkennung fehlgeschlagen. Dies betrifft nur den Labs-Modus, die übrigen Funktionen bleiben unverändert. Bitte Nummern manuell über 1–20 auswählen.', 'err');
    }
  };

  updateOcrButton();
})();
