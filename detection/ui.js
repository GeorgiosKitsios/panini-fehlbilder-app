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
    el.ocr.textContent = '🔎 Geometrie prüfen (Labs)';
    el.ocr.title = 'Entwicklungsvorschau: zeigt nur erkannte Rotation und Seitenkontur, noch keine Nummern- oder Teamcode-Erkennung.';
  }

  const warning = document.querySelector('.warn');
  if (warning) {
    warning.innerHTML = '<b>Labs-Modus aktiv:</b> Diese Vorschau zeigt nur die geometrische Grundlage (Rotation, Seitenkontur) zu Testzwecken. Es werden keine Nummern oder Teamcodes erkannt und nichts automatisch gespeichert.';
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
      const bounds = PaniniGeometry.detectPageBounds(pixels);
      const contentPercent = Math.round(bounds.contentRatio * 100);
      const turnNote = quarterTurnNeeded === 90
        ? 'Hochformat erkannt – bitte den vorhandenen "↻ Drehen"-Button nutzen.'
        : 'Querformat erkannt.';
      message(
        `Geometrie-Vorschau: ${turnNote} Kontur-Winkel ${bounds.angleDeg}°, ${contentPercent}% Bildinhalt erkannt. Ob das Bild auf dem Kopf steht, wird noch nicht geprüft – bitte im Zweifel manuell drehen. Nummern- und Teamcode-Erkennung folgen erst in einer späteren, auf echten Fotos getesteten Runde.`,
        'work'
      );
    } catch (error) {
      console.error(error);
      message('Geometrie-Vorschau fehlgeschlagen. Dies betrifft nur den Labs-Modus, die übrigen Funktionen bleiben unverändert.', 'err');
    }
  };

  updateOcrButton();
})();
