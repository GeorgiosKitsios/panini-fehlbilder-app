/*
 * Reine, DOM-freie Kernregeln (Storage-Key, Nummern-Parsing, Sicherungs-Format).
 * Bewusst ohne Aenderung der bisherigen Logik aus index.html extrahiert, damit sie
 * unabhaengig vom Browser in Vitest getestet werden kann.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'panini-fehlbilder-v3';
  const MIN_NUMBER = 1;
  const MAX_NUMBER = 20;

  function parseNumbers(input) {
    const matches = String(input == null ? '' : input).match(/\d{1,2}/g) || [];
    const unique = [...new Set(matches.map(Number).filter(n => n >= MIN_NUMBER && n <= MAX_NUMBER))];
    return unique.sort((a, b) => a - b);
  }

  function normalizeRows(rawJson) {
    try {
      const parsed = JSON.parse(rawJson || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function parseBackup(json) {
    const rows = Array.isArray(json?.rows) ? json.rows : Array.isArray(json?.entries) ? json.entries : [];
    return rows;
  }

  const PaniniCore = { STORAGE_KEY, MIN_NUMBER, MAX_NUMBER, parseNumbers, normalizeRows, parseBackup };

  global.PaniniCore = PaniniCore;
  if (typeof module !== 'undefined' && module.exports) module.exports = PaniniCore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
