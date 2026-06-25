// Killing logic. `planKill` is pure (which sockets match the requested ports);
// `killTargets` performs the actual signalling with an injectable `kill` fn so
// it can be tested without harming real processes.

/**
 * Select the listening sockets that match the requested ports.
 *
 * @param {Array<{ port: number }>} entries
 * @param {number[]} ports
 * @returns {Array<object>}
 */
export function planKill(entries, ports) {
  const wanted = new Set(ports.map(Number));
  return entries.filter((e) => wanted.has(e.port));
}

/**
 * Signal each target process. Defaults to SIGTERM (graceful); pass force for
 * SIGKILL. Returns a result row per target — never throws.
 *
 * @param {Array<{ pid: number, port: number, command?: string }>} targets
 * @param {{ force?: boolean, kill?: (pid: number, signal: string) => void }} [opts]
 * @returns {Array<object>}
 */
export function killTargets(targets, { force = false, kill = process.kill } = {}) {
  const signal = force ? 'SIGKILL' : 'SIGTERM';
  return targets.map((t) => {
    try {
      kill(t.pid, signal);
      return { ...t, killed: true, signal };
    } catch (err) {
      return { ...t, killed: false, signal, error: err.message };
    }
  });
}
