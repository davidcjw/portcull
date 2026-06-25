import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  normalizeConfig,
  loadConfig,
  saveConfig,
  addProfile,
  removeProfile,
} from '../src/config.js';

let dir;
let path;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'portcull-test-'));
  path = join(dir, 'config.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('normalizeConfig', () => {
  it('keeps only valid, deduped, sorted ports', () => {
    const out = normalizeConfig({ profiles: { web: [5173, 3000, 3000, 'x', -1, 70000] } });
    expect(out.profiles.web).toEqual([3000, 5173]);
  });
  it('drops empty profiles and junk input', () => {
    expect(normalizeConfig({ profiles: { empty: [], bad: 'nope' } })).toEqual({ profiles: {} });
    expect(normalizeConfig(null)).toEqual({ profiles: {} });
    expect(normalizeConfig('string')).toEqual({ profiles: {} });
  });
});

describe('load/save round-trip', () => {
  it('returns empty config when file is missing', () => {
    expect(loadConfig(path)).toEqual({ profiles: {} });
  });
  it('returns empty config when file is invalid JSON', () => {
    saveConfig({ profiles: { a: [1] } }, path);
    // overwrite with junk
    rmSync(path);
    expect(loadConfig(path)).toEqual({ profiles: {} });
  });
  it('persists and reloads profiles', () => {
    saveConfig({ profiles: { web: [3000, 5173] } }, path);
    expect(loadConfig(path)).toEqual({ profiles: { web: [3000, 5173] } });
    // file ends with a newline
    expect(readFileSync(path, 'utf8').endsWith('\n')).toBe(true);
  });
});

describe('addProfile / removeProfile', () => {
  it('adds, replaces and removes profiles', () => {
    addProfile('web', [3000, 5173], path);
    addProfile('api', [8080], path);
    expect(loadConfig(path).profiles).toEqual({ web: [3000, 5173], api: [8080] });

    addProfile('web', [4000], path); // replace
    expect(loadConfig(path).profiles.web).toEqual([4000]);

    removeProfile('web', path);
    expect(loadConfig(path).profiles).toEqual({ api: [8080] });
  });
});
