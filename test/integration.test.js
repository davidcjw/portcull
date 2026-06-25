import { describe, it, expect } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { getListeningPorts } from '../src/scan.js';
import { planKill, killTargets } from '../src/kill.js';

// These tests exercise the real lsof/ps boundary. Skipped automatically on
// platforms without lsof (e.g. Windows / minimal CI images).
let hasLsof = true;
try {
  execFileSync('lsof', ['-v'], { stdio: 'ignore' });
} catch {
  hasLsof = false;
}
const suite = hasLsof ? describe : describe.skip;

/** Spawn a child node process that listens on an ephemeral port and prints it. */
function spawnListener() {
  const code =
    "const net=require('net');" +
    'const s=net.createServer(()=>{});' +
    "s.listen(0,'127.0.0.1',()=>console.log(s.address().port));";
  const child = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'ignore'] });
  const port = new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('listener did not report a port')), 8000);
    child.stdout.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
    child.on('error', reject);
  });
  return { child, port };
}

function waitForExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode != null || child.signalCode != null) return resolve();
    child.on('exit', () => resolve());
  });
}

suite('integration (real lsof/ps/kill)', () => {
  it('discovers a live listener and reports its pid', async () => {
    const { child, port } = spawnListener();
    try {
      const p = await port;
      const entries = getListeningPorts();
      const found = entries.find((e) => e.port === p);
      expect(found, `port ${p} should be discovered`).toBeTruthy();
      expect(found.pid).toBe(child.pid);
      expect(found.uptimeSeconds).not.toBeNull();
    } finally {
      child.kill('SIGKILL');
      await waitForExit(child);
    }
  }, 15000);

  it('kills the process holding a port', async () => {
    const { child, port } = spawnListener();
    const p = await port;
    const entries = getListeningPorts();
    const targets = planKill(entries, [p]);
    expect(targets.map((t) => t.pid)).toContain(child.pid);

    const results = killTargets(targets);
    expect(results.every((r) => r.killed)).toBe(true);

    await waitForExit(child);
    expect(child.exitCode === 0 || child.signalCode === 'SIGTERM').toBe(true);
  }, 15000);
});
