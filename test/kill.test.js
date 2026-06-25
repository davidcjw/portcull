import { describe, it, expect } from 'vitest';
import { planKill, killTargets } from '../src/kill.js';

const entries = [
  { port: 3000, pid: 111, command: 'node' },
  { port: 5173, pid: 222, command: 'vite' },
  { port: 8080, pid: 333, command: 'caddy' },
];

describe('planKill', () => {
  it('selects sockets matching requested ports', () => {
    expect(planKill(entries, [3000, 8080]).map((t) => t.pid)).toEqual([111, 333]);
  });
  it('ignores ports with no listener', () => {
    expect(planKill(entries, [9999])).toEqual([]);
  });
  it('coerces string ports', () => {
    expect(planKill(entries, ['5173']).map((t) => t.pid)).toEqual([222]);
  });
});

describe('killTargets', () => {
  it('signals each target with SIGTERM by default', () => {
    const calls = [];
    const results = killTargets(planKill(entries, [3000, 5173]), {
      kill: (pid, signal) => calls.push([pid, signal]),
    });
    expect(calls).toEqual([
      [111, 'SIGTERM'],
      [222, 'SIGTERM'],
    ]);
    expect(results.every((r) => r.killed)).toBe(true);
  });
  it('uses SIGKILL when force is set', () => {
    const calls = [];
    killTargets(planKill(entries, [3000]), {
      force: true,
      kill: (pid, signal) => calls.push(signal),
    });
    expect(calls).toEqual(['SIGKILL']);
  });
  it('records failures without throwing', () => {
    const results = killTargets(planKill(entries, [3000]), {
      kill: () => {
        throw new Error('ESRCH');
      },
    });
    expect(results[0].killed).toBe(false);
    expect(results[0].error).toBe('ESRCH');
  });
});
