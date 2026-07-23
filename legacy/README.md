# Archivierte Erkennungsversuche

Diese Dateien sind **nicht mehr aktiv** und werden von keinem Service Worker oder `index.html` mehr geladen. Sie bleiben im Repository, damit frühere Ansätze nachvollziehbar bleiben. Vollständige Details, Fehleranalysen und Ground-Truth-Testfälle stehen in [`CLAUDE_HANDOFF.md`](../CLAUDE_HANDOFF.md).

| Datei | Versuch | Ansatz | Warum gescheitert |
|---|---|---|---|
| `detector.js` | B | Feste normierte Koordinaten für 20 Stickerfelder + Bildmerkmale (Helligkeit, Kanten, Sättigung) | Keine Perspektiv-/Rotationskorrektur vor der Koordinatenanwendung; schon kleine Verschiebungen verschoben die Prüffenster auf falsche Bildbereiche |
| `detector-v2.js` | B (überarbeitet) | Wie B, zusätzlich automatische 4:3-Zuschneidung und Rotation bei Hochformat | Zuschnitt kompensierte keine echte Perspektive/Buchkrümmung; weiterhin nicht generalisierbar |
| `country-fix.js` | C | Zusätzliche Teamcode-OCR auf großer Überschrift und leeren Feldern, mit Mehrheitsentscheidung | OCR blieb abhängig von Drehung, Auflösung und Seitengestaltung; einzelne Länder (z. B. Ecuador) wurden trotz sichtbarer Überschrift nicht zuverlässig erkannt |
| `local-ai.js` / `local-ai-worker.js` | D | Lokales Vision-Language-Modell (SmolVLM-256M-Instruct) über WebGPU im Web Worker | Modell zu klein für präzise Prüfung von 20 Positionen; kopierte Prompt-Beispiele statt das Foto auszuwerten; Android-Gerät stürzte mehrfach ab |
| `manual-mode.js` | Sicherheitsmodus | Deaktiviert die Erkennungs-UI vollständig, Verwaltungsfunktionen bleiben aktiv | War nur ein Übergangsschutz, kein Lösungsansatz – automatische Erkennung ist der eigentliche Zweck der App |

Diese Dateien dürfen als Referenz für "was schon ausprobiert wurde" gelesen werden, sollten aber nicht ohne erneute Validierung wieder aktiviert werden.
