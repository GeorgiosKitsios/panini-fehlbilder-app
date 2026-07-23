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
    el.ocr.textContent = '🔎 Nummern & Land vorschlagen (Labs)';
    el.ocr.title = 'Entwicklungsvorschau: schlägt fehlende Nummern und (falls die Flagge erkannt wird) das Land vor. Bitte immer mit der echten Albumseite vergleichen, bevor du speicherst.';
  }

  const warning = document.querySelector('.warn');
  if (warning) {
    warning.innerHTML = '<b>Labs-Modus aktiv:</b> Diese Vorschau schlägt fehlende Nummern (getestet an 6 echten Fotos: 98% Trefferquote, keine Falsch-Treffer) und das Land per Flaggenfarbe vor (nur 6 von ~46 Ländern an echten Fotos getestet, Rest aus Flaggendesign abgeleitet und ungeprüft). Bitte den Vorschlag immer mit der echten Albumseite abgleichen, bevor du speicherst.';
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

      let countryNote = 'Land nicht erkannt – bitte selbst eintragen.';
      try {
        const flagRegion = PaniniFlag.locateFlag(page);
        const flagSig = PaniniFlag.extractSignature(page, flagRegion);
        const flagResult = PaniniFlag.matchFlag(flagSig, PaniniFlagDB.FLAG_DB);
        if (flagResult.code) {
          el.code.value = flagResult.code;
          el.country.value = NAMES[flagResult.code] || flagResult.code;
          const tested = PaniniFlagDB.VALIDATED_CODES.has(flagResult.code);
          countryNote = `Land-Vorschlag: ${el.country.value} (${flagResult.code})${tested ? '' : ' – ungeprüfter Vorschlag, bitte besonders sorgfältig prüfen'}.`;
        } else {
          countryNote = 'Land nicht sicher erkannt (zu unsicher zwischen mehreren Kandidaten) – bitte selbst eintragen.';
        }
      } catch (flagError) {
        console.error(flagError);
      }

      message(
        (missing.length
          ? `Vorschlag: ${missing.length} möglicherweise fehlende Nummer(n): ${missing.join(', ')}. `
          : 'Keine fehlenden Nummern vorgeschlagen. ') +
        countryNote + ' Bitte alles mit der echten Albumseite abgleichen, bevor du speicherst.',
        'work'
      );
    } catch (error) {
      console.error(error);
      message('Erkennung fehlgeschlagen. Dies betrifft nur den Labs-Modus, die übrigen Funktionen bleiben unverändert. Bitte Nummern manuell über 1–20 auswählen.', 'err');
    }
  };

  updateOcrButton();
})();
