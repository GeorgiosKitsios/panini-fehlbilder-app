import { describe, it, expect } from 'vitest';
import '../core/rules.js';

const { parseNumbers, MIN_NUMBER, MAX_NUMBER } = globalThis.PaniniCore;

describe('parseNumbers (Nummern 1-20)', () => {
  it('parses a simple comma-separated list', () => {
    expect(parseNumbers('1, 2, 4, 6')).toEqual([1, 2, 4, 6]);
  });

  it('sorts unsorted input ascending', () => {
    expect(parseNumbers('20, 1, 13, 4')).toEqual([1, 4, 13, 20]);
  });

  it('removes duplicates', () => {
    expect(parseNumbers('5, 5, 5, 6')).toEqual([5, 6]);
  });

  it('drops values outside 1-20', () => {
    expect(parseNumbers('0, 1, 20, 21, 99')).toEqual([1, 20]);
  });

  it('accepts MIN_NUMBER and MAX_NUMBER as valid boundaries', () => {
    expect(parseNumbers(`${MIN_NUMBER}, ${MAX_NUMBER}`)).toEqual([MIN_NUMBER, MAX_NUMBER]);
  });

  it('handles free text mixed with numbers', () => {
    expect(parseNumbers('Sticker 4 und 6 fehlen, Nr. 99 ignorieren? nein 7')).toEqual([4, 6, 7]);
  });

  it('returns an empty array for empty or non-numeric input', () => {
    expect(parseNumbers('')).toEqual([]);
    expect(parseNumbers('keine Nummern hier')).toEqual([]);
  });

  it('handles null/undefined input without throwing', () => {
    expect(parseNumbers(null)).toEqual([]);
    expect(parseNumbers(undefined)).toEqual([]);
  });
});
