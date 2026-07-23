(() => {
  'use strict';

  function disableRecognition() {
    el.ocr.disabled = true;
    el.ocr.textContent = 'Automatische Erkennung pausiert';
    el.ocr.title = 'Die automatische Bilderkennung ist wegen unzuverlässiger Ergebnisse vorübergehend deaktiviert.';
  }

  const originalSetCanvas = setCanvasFromSource;
  setCanvasFromSource = function(source, width, height) {
    originalSetCanvas(source, width, height);
    el.country.value = '';
    el.code.value = '';
    setNumbers([]);
    disableRecognition();
    message('Foto geladen. Bitte Land, Code und fehlende Nummern manuell auswählen.', 'work');
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
    warning.innerHTML = '<b>Automatische Erkennung pausiert:</b> Die bisherigen Ergebnisse waren bei gedrehten oder schrägen Fotos nicht zuverlässig genug. Nutze vorerst Land/Code und die Schnellauswahl 1–20. Bereits gespeicherte Listen und die Ländergruppierung bleiben erhalten.';
  }

  disableRecognition();
})();
