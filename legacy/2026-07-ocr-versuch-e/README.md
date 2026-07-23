# Versuch E: Geometrie + Kandidatenfelder + OCR (2026-07-23, Nachmittag/Abend)

Archiviert, **nicht aktiv**, nicht in `index.html`/`sw.js` eingebunden. Baut auf dem
Geometrie-Fundament (`detection/geometry.js`) der vorherigen Runde auf und versucht,
automatisch zu erkennen, welche Sticker-Positionen auf einer Doppelseite leer sind
(Teamcode + Nummer), statt nur die geometrische Vorstufe zu liefern.

## Ansatz

1. Seite entzerren (bereits vorhandene `detectPageBounds` + `dewarpPerspective`).
2. Seite in Bloecke (~100x95 px) zerlegen, pro Block die Anzahl unterschiedlicher
   Farben zaehlen (`ocr.js: colorDiversityGrid`). Fotos haben deutlich mehr Farben
   als grafische Platzhalterfelder (gemessen: ~250-320 vs. ~70 Farben pro Zelle).
3. Die N Bloecke mit der geringsten Farbvielfalt als Kandidatenregionen nehmen,
   benachbarte Bloecke zusammenfassen (`fields.js: connectedComponents`).
4. Jede Kandidatenregion mit Rand ausschneiden, in Graustufen binarisieren (`ocr.js:
   cropAndBinarize`), mit Tesseract.js per Text erkennen.
5. Im OCR-Text nach dem Muster "3 Grossbuchstaben + 1-2 Ziffern" suchen, Code gegen
   die bekannte Laenderliste pruefen (`ocr.js: parseCodeNumberPairs`).

## Was nachweislich funktioniert

- Wenn man der OCR **genau** den richtigen, bereits binarisierten Bildausschnitt
  eines einzelnen leeren Feldes gibt, liest sie den Teamcode und die Nummer korrekt
  (z.B. "AUS 14" auf dem Australien-Testfoto).
- Die Farbvielfalt-Heuristik unterscheidet Foto- von Platzhalterfeldern auf
  Zellebene klar messbar (Faktor 3-4).

## Was NICHT zuverlässig funktioniert (ehrlich gemessen, `validate-ocr.mjs`)

Test gegen alle 6 verfuegbaren echten Fotos (siehe Ground Truth im Skript):

```
GESAMT: 6/45 richtig gefunden (Recall 13%), 3 falsche Treffer
```

Konkrete Probleme:

- **Zellsegmentierung generalisiert schlecht.** Der Block-Ansatz, der auf dem
  Australien-Testfoto brauchbare Kandidaten lieferte, fand auf dem Haiti-Foto
  gar keine Kandidaten, die zu einem Treffer fuehrten. Unterschiedliche
  Seitenlayouts (Anzahl/Anordnung der Karten) brauchen unterschiedliche
  Block-/Schwellwert-Einstellungen - genau das Generalisierungsproblem, das
  schon `detector.js`/`detector-v2.js` (feste Koordinaten) zum Scheitern brachte,
  nur eine Ebene abstrakter.
- **Systematische Ziffern-Verwechslung.** Tesseract las bei einem Feld wiederholt
  (auch nach Mehrfachpruefung mit unterschiedlichem Rand/Zuschnitt, siehe
  Versuchsprotokoll in der Konversation) "19" statt korrekt "10" - kein
  Zufallsrauschen, sondern ein wiederholbarer Fehler bei dieser Schriftart/Groesse.
  Mehrheitsentscheid ueber mehrere Zuschnitt-Varianten half hier NICHT, weil der
  Fehler in mehreren Varianten gleich auftrat.
- Mit den fuer eine brauchbare Erkennung noetigen mehreren Kandidaten x mehreren
  Zuschnitt-Varianten kommen pro Foto 15-35+ einzelne OCR-Aufrufe zusammen. Bereits
  in Node.js auf einem PC spuerbar langsam; auf einem Handy im Browser (WASM) wahr-
  scheinlich zu langsam bzw. genau das Performance-/Absturzrisiko, das schon beim
  lokalen KI-Modell (Versuch D) das Problem war.

## Einschaetzung fuer die naechste Runde

Nicht einfach wieder aktivieren. Bevor das produktiv wird, braucht es mindestens:

1. Eine robustere, seitenlayout-unabhaengige Zellsegmentierung (z.B. echte
   Gitterlinien-/Kartenrand-Erkennung statt Farbvielfalt-Bloecke), validiert auf
   deutlich mehr als 6 Fotos.
2. Eine bessere Ziffern-Erkennung fuer diese spezifische Schriftart - generisches
   Tesseract verwechselt Ziffern systematisch. Ein kleiner, auf Ziffern 1-20 in
   genau dieser Schriftart trainierter Klassifikator waere vermutlich zuverlaessiger
   als generisches OCR.
3. Eine Laufzeitmessung auf einem echten Android-Handy, bevor mehr als eine
   Handvoll OCR-Aufrufe pro Foto in Betracht kommen.

## Ausfuehren

```bash
npm install jpeg-js tesseract.js   # tesseract.js ist nicht in package.json, nur hier gebraucht
node legacy/2026-07-ocr-versuch-e/validate-ocr.mjs
```

Erwartet den Fixture-Ordner unter `C:\panini-fehlbilder-app-fixtures` (oder
`PANINI_FIXTURES_DIR`), nicht im Repository enthalten.
