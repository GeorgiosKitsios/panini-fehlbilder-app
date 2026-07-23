(() => {
  'use strict';

  function disableRecognition() {
    el.ocr.disabled = true;
    el.ocr.textContent = 'Lokale KI deaktiviert';
    el.ocr.title = 'Das lokale KI-Modell wurde deaktiviert, weil es auf dem Handy instabil war und falsche Ergebnisse geliefert hat.';
  }

  const originalSetCanvas = setCanvasFromSource;
  setCanvasFromSource = function(source, width, height) {
    originalSetCanvas(source, width, height);
    el.country.value = '';
    el.code.value = '';
    setNumbers([]);
    disableRecognition();
    message('Foto geladen. Die instabile lokale KI wird nicht mehr gestartet.', 'work');
  };

  const originalRemovePhoto = el.removePhoto.onclick;
  el.removePhoto.onclick = () => {
    originalRemovePhoto();
    el.country.value = '';
    el.code.value = '';
    setNumbers([]);
    disableRecognition();
  };

  const warning = document.querySelector('.warn');
  if (warning) {
    warning.innerHTML = '<b>Sicherheitsmodus:</b> Das lokale KI-Modell wurde entfernt, weil es auf diesem Gerät zu falschen Ergebnissen und Abstürzen geführt hat. Es wird nichts mehr im Hintergrund geladen oder ausgeführt. Listen, Ländergruppen, Sicherung und CSV-Export bleiben erhalten.';
  }

  disableRecognition();
})();
