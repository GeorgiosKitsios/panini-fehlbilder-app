/*
 * Referenz-Farbsignaturen (3x3-Raster, siehe flag.js: extractSignature) fuer
 * alle Laendercodes aus der NAMES-Tabelle in index.html.
 *
 * Fuer MAR, HAI, SCO, USA, PAR, AUS: echte Werte aus den 6 vorhandenen
 * Testfotos (siehe scripts/extract-flag-sigs.mjs). Fuer alle anderen ~40
 * Codes: aus bekanntem Flaggendesign abgeleitete Naeherungswerte, angepasst an
 * die gedaempften Farbtoene, die auf den echten Fotos zu sehen sind (Kamera/
 * Innenbeleuchtung faerbt Weiss grau-beige statt reinweiss, Farben wirken
 * insgesamt weniger gesaettigt als die "offizielle" Flaggenfarbe).
 *
 * WICHTIG - ehrlich benennen: Nur die 6 echten Eintraege sind an echten Fotos
 * geprueft. Die anderen ~40 sind nicht fotografisch validiert und koennen bei
 * echten Fotos abweichen (siehe CLAUDE_HANDOFF.md).
 */
(function (global) {
  'use strict';

  function grid(cells) { return cells.map(([r, g, b]) => ({ r, g, b })); }

  // Gedaempfte "Foto"-Palette, angelehnt an die echten Messwerte.
  const RED = [148, 50, 40], DARKRED = [120, 35, 35], MAROON = [110, 40, 45];
  const WHITE = [178, 172, 162], BLACK = [45, 42, 40];
  const BLUE = [55, 65, 120], NAVY = [35, 40, 80], LIGHTBLUE = [110, 130, 170], SKYBLUE = [120, 150, 180];
  const GREEN = [50, 100, 55], DARKGREEN = [35, 75, 45];
  const YELLOW = [180, 155, 60], GOLD = [170, 140, 55], ORANGE = [175, 100, 50];
  const GRAY = [140, 135, 130];

  const FLAG_DB = {
    // Echte Fotos (siehe scripts/extract-flag-sigs.mjs) - gerundet.
    MAR: grid([[137, 70, 60], [132, 51, 41], [134, 56, 47], [139, 59, 50], [99, 47, 33], [134, 42, 33], [142, 74, 64], [135, 55, 43], [136, 56, 45]]),
    HAI: grid([[64, 56, 94], [50, 43, 87], [51, 44, 87], [121, 65, 81], [118, 79, 85], [112, 47, 68], [166, 73, 70], [165, 56, 53], [164, 59, 55]]),
    SCO: grid([[104, 111, 129], [161, 148, 146], [101, 111, 131], [154, 142, 143], [92, 105, 130], [133, 131, 140], [174, 156, 147], [163, 151, 146], [163, 150, 144]]),
    USA: grid([[157, 141, 133], [170, 137, 123], [181, 149, 131], [74, 70, 92], [146, 103, 100], [172, 130, 116], [141, 105, 105], [158, 104, 95], [167, 122, 109]]),
    PAR: grid([[130, 58, 48], [131, 53, 43], [157, 117, 111], [161, 149, 146], [152, 142, 140], [160, 135, 130], [57, 58, 93], [61, 63, 95], [141, 118, 119]]),
    AUS: grid([[156, 129, 124], [136, 117, 115], [139, 122, 119], [108, 68, 76], [71, 52, 67], [79, 70, 84], [54, 47, 66], [39, 34, 57], [76, 68, 81]]),

    // Naeherungswerte aus Flaggendesign, NICHT fotografisch validiert.
    TUN: grid([RED, RED, RED, RED, WHITE, RED, RED, RED, RED]),
    MEX: grid([GREEN, WHITE, RED, GREEN, WHITE, RED, GREEN, WHITE, RED]),
    RSA: grid([RED, RED, YELLOW, BLACK, GREEN, WHITE, BLUE, BLUE, BLUE]),
    KOR: grid([WHITE, WHITE, WHITE, WHITE, RED, BLUE, WHITE, WHITE, WHITE]),
    CZE: grid([WHITE, WHITE, WHITE, BLUE, RED, RED, BLUE, RED, RED]),
    CAN: grid([RED, WHITE, RED, RED, RED, RED, RED, WHITE, RED]),
    BIH: grid([YELLOW, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE]),
    QAT: grid([WHITE, MAROON, MAROON, WHITE, MAROON, MAROON, WHITE, MAROON, MAROON]),
    SUI: grid([RED, RED, RED, RED, WHITE, RED, RED, RED, RED]),
    BRA: grid([GREEN, GREEN, GREEN, YELLOW, BLUE, YELLOW, GREEN, GREEN, GREEN]),
    TUR: grid([RED, RED, RED, RED, WHITE, RED, RED, RED, RED]),
    GER: grid([BLACK, BLACK, BLACK, RED, RED, RED, GOLD, GOLD, GOLD]),
    CUW: grid([WHITE, BLUE, BLUE, BLUE, YELLOW, BLUE, BLUE, BLUE, BLUE]),
    ECU: grid([YELLOW, YELLOW, YELLOW, BLUE, GOLD, BLUE, RED, RED, RED]),
    NED: grid([RED, RED, RED, WHITE, WHITE, WHITE, BLUE, BLUE, BLUE]),
    JPN: grid([WHITE, WHITE, WHITE, WHITE, RED, WHITE, WHITE, WHITE, WHITE]),
    SWE: grid([GOLD, BLUE, BLUE, GOLD, GOLD, GOLD, GOLD, BLUE, BLUE]),
    BEL: grid([BLACK, YELLOW, RED, BLACK, YELLOW, RED, BLACK, YELLOW, RED]),
    EGY: grid([RED, RED, RED, WHITE, GOLD, WHITE, BLACK, BLACK, BLACK]),
    IRN: grid([GREEN, GREEN, GREEN, WHITE, RED, WHITE, RED, RED, RED]),
    NZL: grid([RED, NAVY, NAVY, NAVY, NAVY, RED, NAVY, NAVY, NAVY]),
    ESP: grid([RED, RED, RED, GOLD, YELLOW, YELLOW, RED, RED, RED]),
    CPV: grid([BLUE, BLUE, BLUE, YELLOW, BLUE, BLUE, WHITE, RED, WHITE]),
    KSA: grid([GREEN, GREEN, GREEN, GREEN, WHITE, GREEN, GREEN, GREEN, GREEN]),
    URU: grid([GOLD, WHITE, BLUE, WHITE, BLUE, WHITE, BLUE, WHITE, BLUE]),
    FRA: grid([BLUE, WHITE, RED, BLUE, WHITE, RED, BLUE, WHITE, RED]),
    SEN: grid([GREEN, YELLOW, RED, GREEN, GREEN, RED, GREEN, YELLOW, RED]),
    IRQ: grid([RED, RED, RED, WHITE, GREEN, WHITE, BLACK, BLACK, BLACK]),
    NOR: grid([WHITE, RED, RED, BLUE, WHITE, WHITE, WHITE, RED, RED]),
    ARG: grid([LIGHTBLUE, LIGHTBLUE, LIGHTBLUE, WHITE, GOLD, WHITE, LIGHTBLUE, LIGHTBLUE, LIGHTBLUE]),
    ALG: grid([GREEN, WHITE, WHITE, GREEN, RED, WHITE, GREEN, WHITE, WHITE]),
    AUT: grid([RED, RED, RED, WHITE, WHITE, WHITE, RED, RED, RED]),
    JOR: grid([RED, BLACK, BLACK, RED, WHITE, WHITE, RED, GREEN, GREEN]),
    POR: grid([GREEN, RED, RED, GREEN, GOLD, RED, GREEN, RED, RED]),
    COD: grid([YELLOW, SKYBLUE, SKYBLUE, SKYBLUE, RED, YELLOW, SKYBLUE, YELLOW, RED]),
    UZB: grid([WHITE, BLUE, BLUE, WHITE, WHITE, WHITE, GREEN, GREEN, GREEN]),
    COL: grid([YELLOW, YELLOW, YELLOW, BLUE, BLUE, BLUE, RED, RED, RED]),
    ENG: grid([WHITE, RED, WHITE, RED, RED, RED, WHITE, RED, WHITE]),
    CRO: grid([RED, RED, RED, WHITE, RED, WHITE, BLUE, BLUE, BLUE]),
    GHA: grid([RED, RED, RED, YELLOW, BLACK, YELLOW, GREEN, GREEN, GREEN]),
    PAN: grid([WHITE, WHITE, RED, BLUE, GRAY, WHITE, BLUE, BLUE, WHITE]),
  };

  const VALIDATED_CODES = new Set(['MAR', 'HAI', 'SCO', 'USA', 'PAR', 'AUS']);

  global.PaniniFlagDB = { FLAG_DB, VALIDATED_CODES };
  if (typeof module !== 'undefined' && module.exports) module.exports = { FLAG_DB, VALIDATED_CODES };
})(typeof globalThis !== 'undefined' ? globalThis : this);
