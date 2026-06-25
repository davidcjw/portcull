import { describe, it, expect } from 'vitest';
import { KNOWN_PORTS, labelFor, isDevPort } from '../src/ports.js';

describe('ports registry', () => {
  it('labels known ports', () => {
    expect(labelFor(3000)).toBe('Next/React');
    expect(labelFor(5173)).toBe('Vite');
    expect(labelFor(5432)).toBe('Postgres');
  });
  it('returns empty label for unknown ports', () => {
    expect(labelFor(12321)).toBe('');
  });
  it('isDevPort reflects the registry', () => {
    expect(isDevPort(3000)).toBe(true);
    expect(isDevPort(12321)).toBe(false);
  });
  it('registry keys are valid ports', () => {
    for (const key of Object.keys(KNOWN_PORTS)) {
      const n = Number(key);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(65535);
    }
  });
});
