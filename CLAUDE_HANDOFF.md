# Technische Übergabe: Panini Fehlbilder

Stand: 23. Juli 2026  
Repository: `GeorgiosKitsios/panini-fehlbilder-app`  
Branch: `main`  
GitHub Pages: `https://georgioskitsios.github.io/panini-fehlbilder-app/`  
Aktive App-Version laut Service Worker: `appv=10`

## 1. Ziel der App

Eine installierbare Android-PWA soll eine fotografierte Panini-Team-Doppelseite aus dem Album „Road to FIFA World Cup 2026“ analysieren und automatisch liefern:

- Land beziehungsweise Team
- dreistelligen Teamcode
- fehlende Stickernummern 1 bis 20
- anschließend lokale Speicherung, Gruppierung nach Ländern und CSV-Export

Vorgabe des Nutzers:

- keine zusätzlichen Konten
- kein eigener Cloud-Server
- Fotos sollen möglichst auf dem Gerät bleiben
- die automatische Erkennung ist der Kernzweck; reine manuelle Eingabe ist keine akzeptable Endlösung

## 2. Speicherort und Deployment

Die Anwendung liegt als öffentliches Repository auf GitHub:

- Repository: `GeorgiosKitsios/panini-fehlbilder-app`
- Standardbranch: `main`
- Hosting: GitHub Pages
- PWA-URL: `https://georgioskitsios.github.io/panini-fehlbilder-app/`

Es gibt derzeit keinen aktiven Backend- oder Cloud-Dienst. Ein kurzzeitig vorbereiteter Cloudflare/Gemini-Worker wurde wieder aus dem Repository gelöscht.

## 3. Aktuell aktive Architektur

Der Service Worker `sw.js` bestimmt, welche Zusatzskripte aktiv geladen werden. In Version 10 injiziert er ausschließlich:

1. `list-groups.js?v=10`
2. `local-ai.js?v=10`

Der lokale KI-Worker ist:

3. `local-ai-worker.js?v=10`

Die früheren Erkennungsskripte liegen teilweise noch im Repository, werden aber von `sw.js` nicht mehr geladen:

- `detector.js`
- `detector-v2.js`
- `country-fix.js`
- `manual-mode.js`

Diese Dateien sind Altbestand und erzeugen technische Verwirrung. Sie sollten entweder sauber archiviert oder entfernt werden, sobald eine neue Lösung feststeht.

## 4. Dateien und Funktionen

### `index.html`

Enthält die gesamte Grundanwendung in einer Datei:

- HTML-Oberfläche
- CSS
- Kameraaufnahme über `getUserMedia`
- Fotoauswahl
- Canvas-Vorschau und manuelles Drehen
- Land, Code und Nummernauswahl 1 bis 20
- Speicherung in `localStorage`
- CSV-Export
- Textkopie
- JSON-Sicherung und Wiederherstellung
- PWA-Installation
- alten Tesseract-OCR-Code, der aktuell durch `local-ai.js` überschrieben wird

Wichtige Einstellungen:

- LocalStorage-Schlüssel: `panini-fehlbilder-v3`
- Kamerawunsch: Rückkamera, ideal 1920 × 1080
- Bilder werden im Grundcode auf maximal 1900 Pixel längste Seite reduziert
- Fotos werden nicht dauerhaft gespeichert
- gespeicherte Datenstruktur je Sticker:

```json
{
  "id": "UUID",
  "country": "Schweden",
  "code": "SWE",
  "number": 4,
  "state": "fehlt"
}
```

Duplikate werden anhand von `country` und `number` geprüft, nicht anhand des Codes. Unterschiedliche Schreibweisen desselben Landes können daher doppelte Datensätze erzeugen.

CSV-Format:

- UTF-8 mit BOM
- Semikolon als Trennzeichen
- Spalten: Land/Team, Code, Nummer, Status

### `manifest.webmanifest`

PWA-Einstellungen:

- Name: `Panini Fehlbilder`
- Kurzname: `Panini`
- Anzeige: `standalone`
- Scope und Start-URL: `./`
- Sprache: Deutsch
- Theme-Farbe: `#0c5b3b`
- Icon: `icon.svg`

### `sw.js`

Aktueller Cache:

```js
const CACHE = 'panini-fehlbilder-v10';
```

Vorgecachete App-Dateien:

- `/`
- `index.html`
- `manifest.webmanifest`
- `icon.svg`
- `list-groups.js`
- `local-ai.js`
- `local-ai-worker.js`

Beim Aktivieren:

- alte App-Caches werden gelöscht
- Clients werden übernommen
- geöffnete Seiten werden auf `?appv=10` navigiert

Bei einer Navigation wird das geladene `index.html` als Text verändert. Alte Erkennungsskripte werden entfernt und `list-groups.js` sowie `local-ai.js` vor `</body>` injiziert.

Diese Konstruktion ist fragil: `index.html` selbst referenziert die aktiven Skripte nicht. Beim ersten unkontrollierten Aufruf oder bei Service-Worker-Problemen kann deshalb der alte Inline-Code sichtbar sein.

### `list-groups.js`

Ersetzt die ursprüngliche Listenansicht durch:

- Länderfilter als Dropdown
- anklickbare Länder-Pills in der Zusammenfassung
- aufklappbare Ländergruppen
- kompakte Nummerndarstellung je Land
- alphabetische Sortierung nach Land und Nummer

Dieses Modul funktioniert grundsätzlich unabhängig von der Bilderkennung.

### `local-ai.js`

Verbindet die Oberfläche mit dem Web Worker.

Ablauf:

1. Erstellt `local-ai-worker.js` als Module Worker.
2. Prüft vor Ausführung `navigator.gpu`.
3. Lädt beim ersten Klick das lokale Modell.
4. Verkleinert das aktuelle Canvas auf maximal 1280 Pixel längste Seite.
5. Kodiert es als JPEG mit Qualität 0,84.
6. Übergibt das Data-URL-Bild an den Worker.
7. Erwartet ein JSON-ähnliches Ergebnis mit:
   - `code`
   - `missing`
   - `uncertain`
8. Trägt Code, deutschen Ländernamen und Nummern in die Oberfläche ein.

Validierung:

- Code muss in `VALID_CODES` aus `index.html` enthalten sein.
- Nummern werden nur auf Ganzzahlen 1 bis 20 gefiltert.
- Doppelte Nummern werden entfernt.
- Es wird nicht geprüft, ob tatsächlich alle 20 Felder bewertet wurden.
- Es gibt keine belastbare Konfidenzprüfung.

### `local-ai-worker.js`

Technik:

- Bibliothek: `@huggingface/transformers@3.7.1`
- Import direkt vom jsDelivr-CDN
- Modell: `HuggingFaceTB/SmolVLM-256M-Instruct`
- Ausführung: WebGPU
- Quantisierung:
  - `q4f16`, wenn `shader-f16` unterstützt wird
  - ansonsten `q4`
- deterministische Generierung:
  - `do_sample: false`
  - `repetition_penalty: 1.08`
  - `max_new_tokens: 120`
- Bildverarbeitung mit `do_image_splitting: true`

Wichtig: Es gibt keinen eigenen Cloud-Server und das Foto wird nicht an ein Inferenz-Backend gesendet. Für den ersten Einsatz werden jedoch JavaScript-Bibliothek und Modellgewichte von externen CDN-/Hugging-Face-Servern heruntergeladen. „Vollständig offline“ ist die App daher nicht. Die Inferenz selbst läuft anschließend auf dem Gerät.

## 5. Kritischer aktueller Fehler

Der lokale KI-Prompt enthält dieses konkrete Ausgabe-Beispiel:

```json
{"code":"JPN","missing":[2,3],"uncertain":[]}
```

Auf einem eindeutig sichtbaren Tunesien-Foto lieferte die App exakt:

- Land: Japan
- Code: JPN
- fehlend: 2, 3

Das entspricht genau dem Beispiel aus dem Prompt. Die naheliegende Diagnose ist, dass das sehr kleine 256M-Modell das Beispiel kopiert hat, statt das Bild zuverlässig auszuwerten.

Dieser Test beweist, dass Version 10 nicht produktionsreif ist.

## 6. Weitere technische Schwächen der lokalen KI

1. **Modellgröße**  
   SmolVLM 256M ist sehr klein. Feine OCR auf kleinen Albumfeldern, Perspektivkorrektur und die zuverlässige Prüfung von 20 Positionen sind wahrscheinlich außerhalb seiner belastbaren Fähigkeiten.

2. **Keine geometrische Vorverarbeitung**  
   Vor der KI gibt es keine automatische:
   - Erkennung der vier Album-/Seitenecken
   - perspektivische Entzerrung
   - Trennung der beiden Albumseiten
   - sichere Bestimmung von 0°, 90°, 180° oder 270°
   - Lokalisierung der 20 Stickerfelder

   Der Prompt fordert nur, das Foto „gedanklich“ zu drehen. Das ist für ein kleines Modell nicht ausreichend.

3. **Keine feldweise Beweisführung**  
   Das Modell gibt nur eine Liste fehlender Nummern zurück. Es muss nicht für jede Nummer 1 bis 20 einen Status liefern. Dadurch kann nicht geprüft werden, ob es alle Positionen tatsächlich betrachtet hat.

4. **Prompt-Bias**  
   Ein konkretes Land und konkrete Nummern im Formatbeispiel führen bei kleinen Modellen leicht zum Kopieren des Beispiels.

5. **Keine Testsuite**  
   Im Repository existiert keine automatisierte Testsuite, kein reproduzierbares Evaluationsskript und kein Ground-Truth-Datensatz.

6. **Keine reproduzierbare Modellschulung**  
   Die früheren Dateien `detector.js` und `detector-v2.js` enthalten feste Merkmalskoeffizienten und Feldkoordinaten. Im Repository existieren jedoch weder Trainingsskript noch Trainingsdaten noch dokumentierte Validierung. Frühere Aussagen, dies sei ein belastbar trainiertes Modell, waren daher nicht ausreichend belegt.

7. **Service-Worker-Injektion**  
   Die aktive Logik wird dynamisch in HTML injiziert. Besser wäre eine klare, direkte Modulstruktur im HTML oder ein regulärer Build-Prozess.

8. **Altcode bleibt enthalten**  
   `index.html` enthält weiterhin alten Tesseract-Code. Zusätzliche alte Erkennungsskripte liegen ebenfalls im Repository. Aktuell gewinnt nur der zuletzt gesetzte `onclick`-Handler. Das ist schwer wartbar.

## 7. Frühere Lösungsversuche

### Versuch A: Tesseract OCR

Ziel:

- Teamcode und Nummern aus vorgedruckten leeren Feldern lesen

Probleme:

- Gruppentabellen lieferten falsche Codes, zum Beispiel ENG auf einer Japan-Seite
- perspektivische Verzerrung
- kleine Schrift
- Stickerbilder und Hintergrundgrafik erzeugten viele Fehltexte

### Versuch B: Feste 20 Feldpositionen und Bildmerkmale

Dateien:

- `detector.js`
- `detector-v2.js`

Ansatz:

- feste normierte Koordinaten für 20 Stickerpositionen
- einfache Bildmerkmale wie Grauwertstreuung, Kantenanteil, Sättigung und Helligkeit
- logistischer Score für leer/gefüllt
- automatische 4:3-Zuschneidung

Probleme:

- schon kleine Verschiebung, Drehung, Perspektive oder Buchkrümmung verschiebt die Prüffenster
- auf einer Tschechien-Seite wurden statt der tatsächlichen fehlenden Nummern 5, 7, 12, 14, 18 die Nummern 6, 7, 8, 9, 10, 15, 18 vorgeschlagen
- nicht generalisierbar

### Versuch C: Zusätzliche Länder-OCR

Datei:

- `country-fix.js`

Ansatz:

- große Teamüberschrift lesen
- wiederholte Codes in leeren Feldern lesen
- einzelne Codes aus Gruppentabellen ignorieren

Probleme:

- Ecuador wurde trotz sichtbarer Überschrift und korrekter Nummernerkennung nicht zuverlässig erkannt
- OCR blieb zu abhängig von Drehung, Auflösung und Seitengestaltung

### Versuch D: Manuelle Zwischenlösung

Datei:

- `manual-mode.js`

Automatische Erkennung wurde vorübergehend deaktiviert. Diese Lösung wurde vom Nutzer zu Recht abgelehnt, weil die automatische Erkennung der eigentliche Zweck der App ist.

### Versuch E: Externe Gemini-API über Cloudflare Worker

Kurz vorbereitet, dann auf Nutzerwunsch vollständig verworfen und gelöscht, weil keine zusätzlichen Konten und kein Cloud-Server gewünscht sind.

### Versuch F: Lokales SmolVLM über WebGPU

Aktueller Stand. Technisch läuft es auf dem getesteten Android-Gerät, liefert aber beim Tunesien-Test `JPN` und `[2,3]` und ist daher inhaltlich unbrauchbar.

## 8. Bekannte Testfälle / Ground Truth aus den bereitgestellten Fotos

Diese Werte wurden anhand der Nutzerbilder manuell kontrolliert und können als erste Regressionstests dienen:

| Team | Code | Fehlende Nummern |
|---|---|---|
| Tunesien | TUN | 1, 2, 4, 6, 13, 16, 20 |
| Japan | JPN | 2, 3, 10, 12, 14, 16, 18, 20 |
| Schweden | SWE | 4, 5, 9, 13, 16 |
| Ecuador | ECU | 2, 4, 12, 16 |
| Curaçao | CUW | 2, 6, 10, 15, 16 |
| Niederlande | NED | 1, 12, 19 |
| Australien | AUS | 1, 4, 6, 7, 9, 10, 13, 14, 15 |
| Türkei | TUR | 4, 18, 19 |
| Tschechien | CZE | 5, 7, 12, 14, 18 |

Die konkreten Originalfotos befinden sich nicht im Repository. Sie wurden im Chat bereitgestellt. Für eine belastbare Weiterentwicklung sollten sie mit Zustimmung des Nutzers als anonymisierte Testbilder in einen privaten oder lokalen Testdatensatz übernommen werden.

## 9. Aktuell gespeicherte Nutzerdaten

Die Liste wird nicht im Repository gespeichert, sondern ausschließlich im `localStorage` des jeweiligen Browsers unter:

```text
panini-fehlbilder-v3
```

Im letzten Screenshot waren 17 Einträge sichtbar, gruppiert unter:

- Deutschland: 4
- Japan: 8
- Schweden: 5

Diese Daten stammen teilweise aus Tests und können falsche Einträge enthalten. Ein App-Update löscht sie nicht. Das Löschen von Browser-/App-Daten hingegen entfernt sie, sofern vorher keine JSON-Sicherung erstellt wurde.

## 10. Was derzeit funktioniert

- PWA-Aufruf über GitHub Pages
- Installation auf Android, sofern Chrome die PWA-Installation anbietet
- Kamera und Galerieauswahl
- Canvas-Vorschau
- manuelles Drehen
- Nummernauswahl 1 bis 20
- lokale Datenspeicherung
- Duplikatunterdrückung innerhalb gleicher Landbezeichnung und Nummer
- Gruppierung und Filter nach Land
- CSV-Export
- Kopieren als Text
- JSON-Sicherung und Wiederherstellung

## 11. Was derzeit nicht zuverlässig funktioniert

- automatische Bestimmung des Landes
- automatische Bestimmung des Codes
- automatische Bestimmung aller fehlenden Nummern
- robuste Behandlung gedrehter Fotos
- Perspektiv- und Buchkrümmungskorrektur
- belastbare lokale KI-Auswertung
- verlässlicher Offline-Betrieb beim ersten Modellstart

## 12. Empfohlene nächste technische Schritte

Ohne externen Server bleiben grundsätzlich zwei lokale Wege:

### Weg 1: Deterministische Computer Vision plus kleines spezialisiertes Modell

Empfohlenes Verfahren:

1. Album-Doppelseite per Konturen-/Eckenerkennung lokalisieren.
2. Perspektivisch entzerren.
3. Orientierung über Layoutmerkmale bestimmen.
4. Linke und rechte Seite anhand des Falzes trennen.
5. Das bekannte Albumlayout mit Template Matching registrieren.
6. Exakte 20 Feldregionen ausschneiden.
7. Für jedes Feld separat „leer“ oder „beklebt“ klassifizieren.
8. Teamcode aus mehreren leeren Feldregionen per OCR bestimmen und per Mehrheitswahl absichern.
9. Ergebnisse nur übernehmen, wenn geometrische Registrierung und Klassifikation Mindestkonfidenzen erreichen.

Dafür benötigt man einen echten, reproduzierbaren Datensatz mit vielen Fotos, Perspektiven und Lichtverhältnissen sowie ein Trainings-/Evaluationsskript.

### Weg 2: Größeres lokales Vision-Language-Modell

Ein deutlich größeres Modell könnte besser lesen und zählen, benötigt auf Android jedoch erheblich mehr Speicher, Downloadvolumen und Rechenzeit. Vor einem Umbau muss auf dem Zielgerät gemessen werden:

- verfügbarer RAM
- WebGPU-Funktionalität
- maximal stabil ladbare Modellgröße
- Laufzeit je Bild
- Genauigkeit auf allen Ground-Truth-Fotos

Ein reiner Promptwechsel beim aktuellen 256M-Modell reicht voraussichtlich nicht. Das konkrete JPN-Beispiel muss zwar entfernt werden, aber damit ist die grundsätzliche Fähigkeit des Modells noch nicht belegt.

## 13. Sofortige kleine Korrekturen, falls Version 10 weiter untersucht wird

1. Das konkrete Beispiel `JPN / [2,3]` aus dem Prompt entfernen.
2. Stattdessen ein JSON-Schema ohne reale Werte beschreiben.
3. Für jede Nummer 1 bis 20 einen expliziten Status verlangen.
4. Ergebnis ablehnen, wenn nicht exakt 20 eindeutige Positionen bewertet wurden.
5. Bild automatisiert in vier Orientierungen analysieren oder vorher Orientierung bestimmen.
6. Prompt und Modellantwort zu Debugzwecken lokal protokollieren.
7. Kein Ergebnis automatisch speichern; erst als Vorschlag anzeigen.
8. Test gegen alle Ground-Truth-Fotos durchführen, bevor die App erneut als funktionierend bezeichnet wird.

## 14. Ehrliche Statusbewertung

Die Verwaltungs- und Exportfunktionen sind brauchbar. Die automatische Bilderkennung, die den eigentlichen Produktwert darstellt, ist derzeit nicht gelöst. Version 10 beweist lediglich, dass ein kleines VLM lokal per WebGPU auf dem getesteten Gerät ausgeführt werden kann. Sie beweist nicht, dass dieses Modell die konkrete Panini-Aufgabe zuverlässig beherrscht.

Diese Dokumentation wurde hinzugefügt, ohne den aktiven App-Code oder das Verhalten der App weiter zu verändern.
