// The side-effecting boundary: shells out to `lsof` and `ps`, then hands the
// raw text to the pure parsers. `exec` is injectable so the orchestration can
// be unit-tested with canned output (see test/scan.test.js).

import { execFileSync } from 'node:child_process';
import { parseLsof, parsePs, parseCwd, humanizeDuration, shortenCommand, withProjectName } from './parse.js';
import { labelFor, isOpaqueCommand } from './ports.js';
import { friendlyProjectName } from './project.js';

/**
 * Default exec: run a command and return stdout. lsof exits non-zero when no
 * sockets match — that is not an error, so we still return whatever stdout we
 * got. A genuinely missing binary (ENOENT) is surfaced loudly.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @returns {string}
 */
function defaultExec(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error(
        `Required command not found: \`${cmd}\`. Portcull needs lsof and ps (macOS/Linux).`,
      );
    }
    if (err && err.stdout != null) return err.stdout.toString();
    return '';
  }
}

/**
 * Enumerate every listening TCP socket, enriched with the owning process's
 * command and uptime. Results are sorted by port ascending.
 *
 * @param {{
 *   exec?: (cmd: string, args: string[]) => string,
 *   resolveProjectName?: (cwd: string) => string | null,
 * }} [deps]
 * @returns {Array<{
 *   port: number, pid: number, address: string, label: string,
 *   command: string, rawCommand: string, uptime: string, uptimeSeconds: number | null
 * }>}
 */
export function getListeningPorts({ exec = defaultExec, resolveProjectName = friendlyProjectName } = {}) {
  const lsofOut = exec('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn']);
  const sockets = parseLsof(lsofOut);
  if (sockets.length === 0) return [];

  const pids = [...new Set(sockets.map((s) => s.pid))];
  const psOut = exec('ps', ['-o', 'pid=,etime=,command=', '-p', pids.join(',')]);
  const psMap = parsePs(psOut);

  const entries = sockets.map((s) => {
    const ps = psMap.get(s.pid);
    const rawCommand = ps?.command || s.command || '';
    return {
      port: s.port,
      pid: s.pid,
      address: s.address,
      label: labelFor(s.port),
      command: shortenCommand(rawCommand),
      rawCommand,
      uptime: humanizeDuration(ps?.etimeSeconds),
      uptimeSeconds: ps?.etimeSeconds ?? null,
    };
  });

  enrichOpaqueCommands(entries, exec, resolveProjectName);

  return entries.sort((a, b) => a.port - b.port || a.pid - b.pid);
}

/**
 * A handful of runtimes (bare `node`, Next's `next-server`, ...) carry no
 * project-identifying info in their command line at all. For those, resolve
 * the owning project from the process's cwd and append it to `command` —
 * batched into a single extra `lsof` call so this doesn't cost one
 * subprocess per opaque port. Mutates `entries` in place.
 *
 * @param {Array<{ pid: number, command: string }>} entries
 * @param {(cmd: string, args: string[]) => string} exec
 * @param {(cwd: string) => string | null} resolveProjectName
 */
function enrichOpaqueCommands(entries, exec, resolveProjectName) {
  const opaquePids = [...new Set(entries.filter((e) => isOpaqueCommand(e.command)).map((e) => e.pid))];
  if (opaquePids.length === 0) return;

  const cwdOut = exec('lsof', ['-a', '-p', opaquePids.join(','), '-d', 'cwd', '-Fpn']);
  const cwdMap = parseCwd(cwdOut);

  const nameCache = new Map();
  for (const entry of entries) {
    if (!isOpaqueCommand(entry.command)) continue;
    const cwd = cwdMap.get(entry.pid);
    if (!cwd) continue;
    if (!nameCache.has(cwd)) nameCache.set(cwd, resolveProjectName(cwd));
    entry.command = withProjectName(entry.command, nameCache.get(cwd));
  }
}
