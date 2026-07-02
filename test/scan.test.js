import { describe, it, expect } from 'vitest';
import { getListeningPorts } from '../src/scan.js';

// Fake exec returns canned lsof / ps output so the orchestration logic can be
// tested deterministically, without touching the real system. `lsof` is
// called twice — once for the socket scan, once (only when an opaque command
// is found) for the batched cwd lookup — disambiguated by the `-d cwd` flag.
function makeExec({ lsof, ps, cwd }) {
  return (cmd, args = []) => {
    if (cmd === 'ps') return ps;
    if (cmd === 'lsof') return args.includes('cwd') ? (cwd ?? '') : lsof;
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

  it('enriches an opaque command (next-server) with the project name from its cwd', () => {
    const lsof = ['p111', 'cnode', 'n*:3738'].join('\n');
    const ps = '111 09:23:00 next-server (v16.2.9)';
    const cwd = ['p111', 'fcwd', 'n/Users/dev/code/the-chronicle'].join('\n');
    const entries = getListeningPorts({
      exec: makeExec({ lsof, ps, cwd }),
      resolveProjectName: (dir) => (dir.endsWith('the-chronicle') ? 'the-chronicle' : null),
    });
    expect(entries[0].command).toBe('next-server (v16.2.9) · the-chronicle');
  });

  it('leaves non-opaque commands untouched and skips the cwd lookup entirely', () => {
    const lsof = ['p111', 'cnode', 'n*:5173'].join('\n');
    const ps = '111 09:23:00 /usr/local/bin/node /app/.bin/vite';
    const entries = getListeningPorts({
      exec: makeExec({ lsof, ps, cwd: 'should never be read' }),
      resolveProjectName: () => {
        throw new Error('resolveProjectName should not be called for a non-opaque command');
      },
    });
    expect(entries[0].command).toBe('node vite');
  });

  it('leaves an opaque command unchanged when the cwd lookup resolves nothing', () => {
    const lsof = ['p111', 'cnode', 'n*:3738'].join('\n');
    const ps = '111 09:23:00 next-server (v16.2.9)';
    const entries = getListeningPorts({
      exec: makeExec({ lsof, ps, cwd: '' }),
      resolveProjectName: () => null,
    });
    expect(entries[0].command).toBe('next-server (v16.2.9)');
  });
});
