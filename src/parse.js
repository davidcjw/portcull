// Pure parsers and formatters for lsof / ps output. No side effects — every
// function here is deterministic and unit-tested in test/parse.test.js.

/**
 * Parse the network address portion of an lsof NAME field for a listening
 * socket. Handles `*:3000`, `127.0.0.1:5173`, `[::1]:3000`, `[::]:8080`, and a
 * trailing state such as `*:3000 (LISTEN)`.
 *
 * @param {string} name
 * @returns {{ address: string, port: number } | null}
 */
export function parseListenAddress(name) {
  if (!name) return null;
  let s = String(name).trim();
  // Drop a trailing state token if lsof appended one (non field-mode output).
  const space = s.indexOf(' ');
  if (space !== -1) s = s.slice(0, space);
  const colon = s.lastIndexOf(':');
  if (colon === -1) return null;
  const port = Number(s.slice(colon + 1));
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  let address = s.slice(0, colon);
  if (address.startsWith('[') && address.endsWith(']')) {
    address = address.slice(1, -1);
  }
  return { address, port };
}

/**
 * Parse `lsof -nP -iTCP -sTCP:LISTEN -Fpcn` field-mode output into a deduped
 * list of listening sockets. Field mode emits one prefixed value per line
 * (`p`=pid, `c`=command, `n`=name) which sidesteps whitespace ambiguity in
 * command names like "Google Chrome".
 *
 * @param {string} output
 * @returns {Array<{ pid: number, command: string, port: number, address: string }>}
 */
export function parseLsof(output) {
  const entries = [];
  const seen = new Set(); // "<pid>:<port>" — collapse IPv4+IPv6 on one port
  let pid = null;
  let command = '';
  for (const rawLine of String(output).split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line) continue;
    const tag = line[0];
    const value = line.slice(1);
    if (tag === 'p') {
      pid = Number(value);
      command = '';
    } else if (tag === 'c') {
      command = value;
    } else if (tag === 'n') {
      if (pid == null || Number.isNaN(pid)) continue;
      const parsed = parseListenAddress(value);
      if (!parsed) continue;
      const key = `${pid}:${parsed.port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ pid, command, port: parsed.port, address: parsed.address });
    }
  }
  return entries;
}

/**
 * Parse a `ps` elapsed-time string (`[[dd-]hh:]mm:ss`) into whole seconds.
 *
 * @param {string} etime
 * @returns {number | null}
 */
export function parseEtime(etime) {
  if (!etime) return null;
  let rest = String(etime).trim();
  let days = 0;
  const dash = rest.indexOf('-');
  if (dash !== -1) {
    days = Number(rest.slice(0, dash));
    rest = rest.slice(dash + 1);
  }
  const parts = rest.split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n)) || Number.isNaN(days)) return null;
  let h = 0;
  let m = 0;
  let s = 0;
  if (parts.length === 3) [h, m, s] = parts;
  else if (parts.length === 2) [m, s] = parts;
  else if (parts.length === 1) [s] = parts;
  else return null;
  return ((days * 24 + h) * 60 + m) * 60 + s;
}

/**
 * Parse `ps -o pid=,etime=,command=` output into a pid → info map.
 *
 * @param {string} output
 * @returns {Map<number, { pid: number, etimeSeconds: number | null, command: string }>}
 */
export function parsePs(output) {
  const map = new Map();
  for (const rawLine of String(output).split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const pid = Number(m[1]);
    map.set(pid, {
      pid,
      etimeSeconds: parseEtime(m[2]),
      command: m[3].trim(),
    });
  }
  return map;
}

/**
 * Render a duration in seconds as a compact human string ("2h14m", "3d4h").
 *
 * @param {number | null | undefined} seconds
 * @returns {string}
 */
export function humanizeDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '-';
  let s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d${h}h`;
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}m${sec}s`;
  return `${sec}s`;
}

/**
 * Shorten a full command line for display: replace path tokens with their
 * basename ("/usr/bin/node .../next dev" → "node next dev") and clamp length.
 *
 * @param {string} command
 * @param {number} [maxLen=44]
 * @returns {string}
 */
export function shortenCommand(command, maxLen = 44) {
  if (!command) return '';
  const raw = String(command).trim();

  // macOS app bundle paths (".../The Chronicle.app/Contents/MacOS/The
  // Chronicle Helper --type=renderer") embed a binary name that itself
  // contains spaces. Splitting on whitespace first (below) shreds that name
  // into several bogus path-like tokens that only consecutive-dedupe back
  // into garbage such as "The Chronicle The Chronicle Helper". Pull the
  // binary name directly out of the bundle path instead: everything after
  // the last "/Contents/MacOS/" up to the first CLI flag.
  const bundleMatch = raw.match(/.*\.app\/Contents\/MacOS\/(.+)$/);
  if (bundleMatch) {
    const name = bundleMatch[1].split(/\s+-/)[0].trim();
    return name.length > maxLen ? `${name.slice(0, maxLen - 1).trimEnd()}…` : name;
  }

  const tokens = raw
    .split(/\s+/)
    .map((t) => {
      if (t.includes('/')) {
        const base = t.slice(t.lastIndexOf('/') + 1);
        return base || t;
      }
      return t;
    })
    // Collapse consecutive duplicate tokens (defense in depth for other
    // space-containing paths that aren't macOS app bundles).
    .filter((t, i, arr) => t !== arr[i - 1]);
  let out = tokens.join(' ');
  if (out.length > maxLen) out = `${out.slice(0, maxLen - 1).trimEnd()}…`;
  return out;
}
