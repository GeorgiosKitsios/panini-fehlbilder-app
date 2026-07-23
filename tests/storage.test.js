import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import '../core/rules.js';

const { STORAGE_KEY, normalizeRows, parseBackup } = globalThis.PaniniCore;

const EXISTING_ROW_SHAPE = {
  id: 'abc-123',
  country: 'Schweden',
  code: 'SWE',
  number: 4,
  state: 'fehlt',
};

describe('STORAGE_KEY regression lock', () => {
  it('stays exactly panini-fehlbilder-v3 so existing user data is not orphaned', () => {
    expect(STORAGE_KEY).toBe('panini-fehlbilder-v3');
  });
});

describe('normalizeRows (bestehende Einträge überleben ein Update)', () => {
  it('round-trips an existing v3 rows array unchanged', () => {
    const raw = JSON.stringify([EXISTING_ROW_SHAPE]);
    expect(normalizeRows(raw)).toEqual([EXISTING_ROW_SHAPE]);
  });

  it('returns an empty array for missing/null storage (first run)', () => {
    expect(normalizeRows(null)).toEqual([]);
    expect(normalizeRows(undefined)).toEqual([]);
  });

  it('returns an empty array for corrupted JSON instead of throwing', () => {
    expect(normalizeRows('{not valid json')).toEqual([]);
  });

  it('returns an empty array if the stored value is not an array', () => {
    expect(normalizeRows(JSON.stringify({ not: 'an array' }))).toEqual([]);
  });

  it('preserves multiple existing entries across countries', () => {
    const raw = JSON.stringify([
      EXISTING_ROW_SHAPE,
      { id: 'def-456', country: 'Japan', code: 'JPN', number: 12, state: 'unsicher' },
    ]);
    expect(normalizeRows(raw)).toHaveLength(2);
  });
});

describe('parseBackup (JSON-Sicherung laden)', () => {
  it('reads rows from the current backup format', () => {
    expect(parseBackup({ version: 6, rows: [EXISTING_ROW_SHAPE] })).toEqual([EXISTING_ROW_SHAPE]);
  });

  it('falls back to the legacy "entries" key for older backups', () => {
    expect(parseBackup({ entries: [EXISTING_ROW_SHAPE] })).toEqual([EXISTING_ROW_SHAPE]);
  });

  it('returns an empty array when neither key is present', () => {
    expect(parseBackup({})).toEqual([]);
  });
});

describe('Kein automatisches Speichern von Erkennungsergebnissen (Quellcode-Guard)', () => {
  function readSource(relativePath) {
    const path = fileURLToPath(new URL(relativePath, import.meta.url));
    return readFileSync(path, 'utf8');
  }

  it('detection/geometry.js never touches localStorage or save()', () => {
    const source = readSource('../detection/geometry.js');
    expect(source).not.toMatch(/localStorage/);
    expect(source).not.toMatch(/\bsave\s*\(/);
  });

  it('detection/ui.js never writes to the app storage key, only the labs flag', () => {
    const source = readSource('../detection/ui.js');
    expect(source).not.toMatch(/panini-fehlbilder-v3/);
    expect(source).not.toMatch(/\bsave\s*\(/);
    // Der einzige localStorage-Zugriff darf sich auf das Labs-Flag beziehen.
    const localStorageCalls = source.match(/localStorage\.\w+\([^)]*\)/g) || [];
    for (const call of localStorageCalls) expect(call).toMatch(/FLAG_KEY/);
  });
});
