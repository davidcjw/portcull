import { describe, it, expect } from 'vitest';
import {
  parseListenAddress,
  parseLsof,
  parseEtime,
  parsePs,
  humanizeDuration,
  shortenCommand,
} from '../src/parse.js';

describe('parseListenAddress', () => {
  it('parses wildcard IPv4', () => {
    expect(parseListenAddress('*:3000')).toEqual({ address: '*', port: 3000 });
  });
  it('parses explicit IPv4', () => {
    expect(parseListenAddress('127.0.0.1:5173')).toEqual({ address: '127.0.0.1', port: 5173 });
  });
  it('parses bracketed IPv6 and strips brackets', () => {
    expect(parseListenAddress('[::1]:3000')).toEqual({ address: '::1', port: 3000 });
    expect(parseListenAddress('[::]:8080')).toEqual({ address: '::', port: 8080 });
  });
  it('strips a trailing state token', () => {
    expect(parseListenAddress('*:3000 (LISTEN)')).toEqual({ address: '*', port: 3000 });
  });
  it('rejects non-numeric or out-of-range ports', () => {
    expect(parseListenAddress('*:*')).toBeNull();
    expect(parseListenAddress('*:70000')).toBeNull();
    expect(parseListenAddress('nocolon')).toBeNull();
    expect(parseListenAddress('')).toBeNull();
  });
});

describe('parseLsof', () => {
  const sample = [
    'p1234',
    'cnode',
    'f23',
    'n*:3000',
    'f24',
    'n[::1]:3000', // same pid+port → deduped
    'p5678',
    'cGoogle Chrome', // command with a space — field mode keeps it intact
    'f10',
    'n127.0.0.1:5173',
    '',
  ].join('\n');

  it('extracts one entry per pid+port, deduping IPv4/IPv6', () => {
    const entries = parseLsof(sample);
    expect(entries).toEqual([
      { pid: 1234, command: 'node', port: 3000, address: '*' },
      { pid: 5678, command: 'Google Chrome', port: 5173, address: '127.0.0.1' },
    ]);
  });
  it('handles empty input', () => {
    expect(parseLsof('')).toEqual([]);
  });
  it('ignores name lines before any pid', () => {
    expect(parseLsof('n*:3000\np42\ncfoo\nn*:9000')).toEqual([
      { pid: 42, command: 'foo', port: 9000, address: '*' },
    ]);
  });
});

describe('parseEtime', () => {
  it('parses mm:ss', () => {
    expect(parseEtime('05:03')).toBe(303);
  });
  it('parses hh:mm:ss', () => {
    expect(parseEtime('02:14:33')).toBe(2 * 3600 + 14 * 60 + 33);
  });
  it('parses dd-hh:mm:ss', () => {
    expect(parseEtime('3-04:00:00')).toBe(3 * 86400 + 4 * 3600);
  });
  it('returns null for garbage', () => {
    expect(parseEtime('')).toBeNull();
    expect(parseEtime('abc')).toBeNull();
  });
});

describe('parsePs', () => {
  it('maps pid → etime + command', () => {
    const out = '  1234 02:14:33 /usr/bin/node server.js\n 5678 00:18 vite\n';
    const map = parsePs(out);
    expect(map.get(1234)).toEqual({
      pid: 1234,
      etimeSeconds: 2 * 3600 + 14 * 60 + 33,
      command: '/usr/bin/node server.js',
    });
    expect(map.get(5678).etimeSeconds).toBe(18);
  });
  it('skips malformed lines', () => {
    expect(parsePs('garbage\n\n').size).toBe(0);
  });
});

describe('humanizeDuration', () => {
  it('formats across units', () => {
    expect(humanizeDuration(45)).toBe('45s');
    expect(humanizeDuration(125)).toBe('2m5s');
    expect(humanizeDuration(3600 + 14 * 60)).toBe('1h14m');
    expect(humanizeDuration(3 * 86400 + 4 * 3600)).toBe('3d4h');
  });
  it('handles null/negative', () => {
    expect(humanizeDuration(null)).toBe('-');
    expect(humanizeDuration(-5)).toBe('0s');
  });
});

describe('shortenCommand', () => {
  it('reduces path tokens to basenames', () => {
    expect(shortenCommand('/usr/local/bin/node /app/node_modules/.bin/next dev')).toBe(
      'node next dev',
    );
  });
  it('collapses consecutive duplicate tokens (non-bundle paths with spaces)', () => {
    expect(shortenCommand('mysqld mysql mysql plugin')).toBe('mysqld mysql plugin');
  });
  it('extracts the binary name from a macOS app bundle path with spaces', () => {
    expect(shortenCommand('/Apps/The Chronicle.app/Contents/MacOS/The Chronicle Helper')).toBe(
      'The Chronicle Helper',
    );
  });
  it('extracts the binary name from a nested helper bundle with trailing CLI flags', () => {
    expect(
      shortenCommand(
        '/Applications/The Chronicle.app/Contents/Frameworks/The Chronicle Helper.app/Contents/MacOS/The Chronicle Helper --type=renderer --service-name=com.example.chronicle',
      ),
    ).toBe('The Chronicle Helper');
  });
  it('clamps long output with an ellipsis', () => {
    const out = shortenCommand('a'.repeat(100), 10);
    expect(out.length).toBe(10);
    expect(out.endsWith('…')).toBe(true);
  });
  it('handles empty', () => {
    expect(shortenCommand('')).toBe('');
  });
});
