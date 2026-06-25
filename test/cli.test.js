import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, parsePortSpec, run } from '../src/cli.js';

describe('parseArgs', () => {
  it('defaults to the ls command', () => {
    expect(parseArgs([]).command).toBe('ls');
  });
  it('parses ls flags', () => {
    const { command, opts } = parseArgs(['ls', '--dev', '--json']);
    expect(command).toBe('ls');
    expect(opts.dev).toBe(true);
    expect(opts.json).toBe(true);
  });
  it('parses kill with ports and flags', () => {
    const { command, rest, opts } = parseArgs(['kill', '3000', '5173', '--force', '-n']);
    expect(command).toBe('kill');
    expect(rest).toEqual(['3000', '5173']);
    expect(opts.force).toBe(true);
    expect(opts.dryRun).toBe(true);
  });
  it('captures option values', () => {
    expect(parseArgs(['kill', '-P', 'web']).opts.profile).toBe('web');
    expect(parseArgs(['ls', '-p', '3000,5173']).opts.ports).toBe('3000,5173');
  });
  it('errors on unknown option and missing values', () => {
    expect(parseArgs(['--nope']).error).toMatch(/Unknown option/);
    expect(parseArgs(['kill', '-P']).error).toMatch(/Missing value/);
  });
});

describe('parsePortSpec', () => {
  it('parses comma and space separated tokens', () => {
    expect(parsePortSpec(['3000,5173', '8080']).ports).toEqual([3000, 5173, 8080]);
  });
  it('dedupes', () => {
    expect(parsePortSpec(['3000', '3000']).ports).toEqual([3000]);
  });
  it('rejects invalid ports', () => {
    expect(parsePortSpec(['abc']).error).toMatch(/Invalid port/);
    expect(parsePortSpec(['70000']).error).toMatch(/Invalid port/);
  });
});

describe('run', () => {
  let dir;
  let cfgPath;
  let out;
  let err;
  let lines;
  let errLines;

  const fakeEntries = [
    { port: 3000, pid: 111, label: 'Next/React', uptime: '2h', command: 'node next dev' },
    { port: 5173, pid: 222, label: 'Vite', uptime: '5m', command: 'vite' },
    { port: 9999, pid: 333, label: '', uptime: '1s', command: 'node x.js' },
  ];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'portcull-cli-'));
    cfgPath = join(dir, 'config.json');
    lines = [];
    errLines = [];
    out = (s) => lines.push(s);
    err = (s) => errLines.push(s);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const deps = (over = {}) => ({
    out,
    err,
    cfgPath,
    getListeningPorts: () => fakeEntries,
    killTargets: (targets) => targets.map((t) => ({ ...t, killed: true, signal: 'SIGTERM' })),
    ...over,
  });

  it('ls prints a table', async () => {
    const code = await run(['ls'], deps());
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('3000');
    expect(lines.join('\n')).toContain('Next/React');
  });

  it('ls --json prints JSON', async () => {
    await run(['ls', '--json'], deps());
    expect(JSON.parse(lines.join('\n'))).toHaveLength(3);
  });

  it('ls --dev filters to known dev ports', async () => {
    await run(['ls', '--dev', '--json'], deps());
    const parsed = JSON.parse(lines.join('\n'));
    expect(parsed.map((e) => e.port)).toEqual([3000, 5173]);
  });

  it('ls -p filters to specific ports', async () => {
    await run(['ls', '-p', '5173', '--json'], deps());
    expect(JSON.parse(lines.join('\n')).map((e) => e.port)).toEqual([5173]);
  });

  it('ls surfaces a scan error as exit 1', async () => {
    const code = await run(['ls'], deps({
      getListeningPorts: () => {
        throw new Error('lsof missing');
      },
    }));
    expect(code).toBe(1);
    expect(errLines.join('\n')).toContain('lsof missing');
  });

  it('kill signals matching ports', async () => {
    const killed = [];
    const code = await run(['kill', '3000'], deps({
      killTargets: (targets) => {
        killed.push(...targets.map((t) => t.pid));
        return targets.map((t) => ({ ...t, killed: true, signal: 'SIGTERM' }));
      },
    }));
    expect(code).toBe(0);
    expect(killed).toEqual([111]);
    expect(lines.join('\n')).toContain('killed 111 on 3000');
  });

  it('kill --dry-run kills nothing', async () => {
    let called = false;
    const code = await run(['kill', '3000', '--dry-run'], deps({
      killTargets: () => {
        called = true;
        return [];
      },
    }));
    expect(code).toBe(0);
    expect(called).toBe(false);
    expect(lines.join('\n')).toContain('Dry run');
  });

  it('kill reports when no listener is found', async () => {
    const code = await run(['kill', '1234'], deps());
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('No listening process on port(s): 1234');
  });

  it('kill requires a port or profile', async () => {
    const code = await run(['kill'], deps());
    expect(code).toBe(2);
    expect(errLines.join('\n')).toContain('Usage:');
  });

  it('kill returns exit 1 when a kill fails', async () => {
    const code = await run(['kill', '3000'], deps({
      killTargets: (targets) =>
        targets.map((t) => ({ ...t, killed: false, signal: 'SIGTERM', error: 'EPERM' })),
    }));
    expect(code).toBe(1);
    expect(errLines.join('\n')).toContain('failed to kill');
  });

  it('profile add / ls / kill -P round-trip', async () => {
    expect(await run(['profile', 'add', 'web', '3000', '5173'], deps())).toBe(0);
    lines.length = 0;
    await run(['profile', 'ls'], deps());
    expect(lines.join('\n')).toContain('web: 3000, 5173');

    const killed = [];
    await run(['kill', '-P', 'web'], deps({
      killTargets: (targets) => {
        killed.push(...targets.map((t) => t.port));
        return targets.map((t) => ({ ...t, killed: true, signal: 'SIGTERM' }));
      },
    }));
    expect(killed.sort()).toEqual([3000, 5173]);
  });

  it('kill -P errors on unknown profile', async () => {
    const code = await run(['kill', '-P', 'ghost'], deps());
    expect(code).toBe(2);
    expect(errLines.join('\n')).toContain('No such profile: ghost');
  });

  it('profile rm removes a profile', async () => {
    await run(['profile', 'add', 'web', '3000'], deps());
    expect(await run(['profile', 'rm', 'web'], deps())).toBe(0);
    lines.length = 0;
    await run(['profile', 'ls'], deps());
    expect(lines.join('\n')).toContain('No profiles yet');
  });

  it('--help and --version exit 0', async () => {
    expect(await run(['--help'], deps())).toBe(0);
    expect(lines.join('\n')).toContain('portcull —');
    lines.length = 0;
    expect(await run(['--version'], deps())).toBe(0);
    expect(lines.join('\n')).toMatch(/\d+\.\d+\.\d+/);
  });

  it('unknown command exits 2', async () => {
    const code = await run(['frobnicate'], deps());
    expect(code).toBe(2);
    expect(errLines.join('\n')).toContain('Unknown command: frobnicate');
  });
});
