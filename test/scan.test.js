import { describe, it, expect } from 'vitest';
import { getListeningPorts } from '../src/scan.js';

// Fake exec returns canned lsof / ps output so the orchestration logic can be
// tested deterministically, without touching the real system.
function makeExec({ lsof, ps }) {
  return (cmd) => {
    if (cmd === 'lsof') return lsof;
    if (cmd === 'ps') return ps;
    return '';
  };
}

describe('getListeningPorts', () => {
  it('merges lsof + ps into enriched, sorted entries', () => {
    const lsof = ['p222', 'cnode', 'n*:5173', 'p111', 'cnode', 'n127.0.0.1:3000'].join('\n');
    const ps = ['111 02:14:33 /usr/bin/node /app/.bin/next dev', '222 00:30 /usr/bin/node vite'].join(
      '\n',
    );
    const entries = getListeningPorts({ exec: makeExec({ lsof, ps }) });

    expect(entries.map((e) => e.port)).toEqual([3000, 5173]); // sorted
    const next = entries[0];
    expect(next.pid).toBe(111);
    expect(next.label).toBe('Next/React');
    expect(next.command).toBe('node next dev');
    expect(next.uptime).toBe('2h14m');
    expect(next.uptimeSeconds).toBe(2 * 3600 + 14 * 60 + 33);
  });

  it('returns [] when nothing is listening', () => {
    expect(getListeningPorts({ exec: makeExec({ lsof: '', ps: '' }) })).toEqual([]);
  });

  it('falls back gracefully when ps has no row for a pid', () => {
    const lsof = ['p111', 'cnode', 'n*:3000'].join('\n');
    const entries = getListeningPorts({ exec: makeExec({ lsof, ps: '' }) });
    expect(entries[0].uptime).toBe('-');
    expect(entries[0].command).toBe('node');
  });
});
