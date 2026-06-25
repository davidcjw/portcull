// Command-line surface. `parseArgs` and `parsePortSpec` are pure and tested;
// `run` dispatches to handlers and accepts injectable deps so the whole flow
// can be exercised without touching the real system.

import { readFileSync } from 'node:fs';
import { getListeningPorts as realGetListeningPorts } from './scan.js';
import { killTargets as realKillTargets, planKill } from './kill.js';
import { formatPorts, formatJson } from './format.js';
import { isDevPort } from './ports.js';
import { loadConfig, addProfile, removeProfile, configPath } from './config.js';

const HELP = `portcull — list and kill the processes holding your dev ports

Usage:
  portcull [ls]                 List all listening TCP ports (default)
  portcull ls --dev             Only show known dev ports
  portcull ls -p 3000,5173      Only show specific ports
  portcull ls --json            Machine-readable output
  portcull kill <port...>       Kill whatever listens on the given port(s)
  portcull kill 3000 5173       Kill multiple ports at once
  portcull kill 3000 --force    Use SIGKILL instead of SIGTERM
  portcull kill 3000 --dry-run  Show what would be killed, kill nothing
  portcull kill -P web          Kill every port in the "web" profile
  portcull profile ls           List saved profiles
  portcull profile add web 3000 5173
  portcull profile rm web

Options:
  -p, --ports <list>   Comma/space separated ports (ls filter)
      --dev            Restrict to known dev ports (ls)
      --json           JSON output (ls)
  -P, --profile <name> Use a saved profile (kill)
  -f, --force          SIGKILL instead of SIGTERM (kill)
  -n, --dry-run        Preview without killing (kill)
  -h, --help           Show this help
  -v, --version        Show version

Aliases: free = kill, k = kill`;

/**
 * Parse argv (without node/script) into a structured command.
 * @param {string[]} argv
 * @returns {{ error?: string, command?: string, rest?: string[], opts?: object }}
 */
export function parseArgs(argv) {
  const opts = {
    json: false,
    dev: false,
    force: false,
    dryRun: false,
    profile: null,
    ports: null,
    help: false,
    version: false,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '-v':
      case '--version':
        opts.version = true;
        break;
      case '--json':
        opts.json = true;
        break;
      case '--dev':
        opts.dev = true;
        break;
      case '-f':
      case '--force':
        opts.force = true;
        break;
      case '-n':
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '-P':
      case '--profile':
        opts.profile = argv[++i] ?? null;
        if (opts.profile == null) return { error: 'Missing value for --profile' };
        break;
      case '-p':
      case '--ports':
      case '--port':
        opts.ports = argv[++i] ?? null;
        if (opts.ports == null) return { error: 'Missing value for --ports' };
        break;
      default:
        if (a.startsWith('-')) return { error: `Unknown option: ${a}` };
        positional.push(a);
    }
  }
  const command = positional.shift() || 'ls';
  return { command, rest: positional, opts };
}

/**
 * Parse a list of port tokens (each possibly comma/space separated).
 * @param {Array<string|number>} values
 * @returns {{ ports?: number[], error?: string }}
 */
export function parsePortSpec(values) {
  const out = [];
  for (const v of values) {
    for (const part of String(v).split(/[,\s]+/)) {
      if (!part) continue;
      const n = Number(part);
      if (Number.isInteger(n) && n > 0 && n <= 65535) out.push(n);
      else return { error: `Invalid port: ${part}` };
    }
  }
  return { ports: [...new Set(out)] };
}

function getVersion() {
  try {
    const url = new URL('../package.json', import.meta.url);
    return JSON.parse(readFileSync(url, 'utf8')).version;
  } catch {
    return '0.0.0';
  }
}

function cmdList(ctx) {
  const { opts, out, err, getListeningPorts } = ctx;
  let entries;
  try {
    entries = getListeningPorts();
  } catch (e) {
    err(e.message);
    return 1;
  }
  if (opts.dev) entries = entries.filter((e) => isDevPort(e.port));
  if (opts.ports) {
    const spec = parsePortSpec([opts.ports]);
    if (spec.error) {
      err(spec.error);
      return 2;
    }
    const set = new Set(spec.ports);
    entries = entries.filter((e) => set.has(e.port));
  }
  out(opts.json ? formatJson(entries) : formatPorts(entries));
  return 0;
}

function cmdKill(ctx) {
  const { rest, opts, out, err, getListeningPorts, killTargets, cfgPath } = ctx;
  let ports = [];
  if (opts.profile) {
    const cfg = loadConfig(cfgPath);
    const profilePorts = cfg.profiles[opts.profile];
    if (!profilePorts) {
      err(`No such profile: ${opts.profile}`);
      return 2;
    }
    ports = ports.concat(profilePorts);
  }
  if (rest.length) {
    const spec = parsePortSpec(rest);
    if (spec.error) {
      err(spec.error);
      return 2;
    }
    ports = ports.concat(spec.ports);
  }
  ports = [...new Set(ports)];
  if (ports.length === 0) {
    err('Usage: portcull kill <port...> | --profile <name>');
    return 2;
  }

  let entries;
  try {
    entries = getListeningPorts();
  } catch (e) {
    err(e.message);
    return 1;
  }
  const targets = planKill(entries, ports);
  const found = new Set(targets.map((t) => t.port));
  const missing = ports.filter((p) => !found.has(p));

  if (targets.length === 0) {
    out(`No listening process on port(s): ${ports.join(', ')}`);
    return 0;
  }
  if (opts.dryRun) {
    out('Dry run — would kill:');
    for (const t of targets) out(`  ${t.port}  pid ${t.pid}  ${t.command || '-'}`);
    if (missing.length) out(`  (nothing on: ${missing.join(', ')})`);
    return 0;
  }

  const results = killTargets(targets, { force: opts.force });
  for (const r of results) {
    if (r.killed) out(`killed ${r.pid} on ${r.port} (${r.signal})  ${r.command || ''}`.trimEnd());
    else err(`failed to kill ${r.pid} on ${r.port}: ${r.error}`);
  }
  if (missing.length) out(`nothing on: ${missing.join(', ')}`);
  return results.some((r) => !r.killed) ? 1 : 0;
}

function cmdProfile(ctx) {
  const { rest, out, err, cfgPath } = ctx;
  const sub = rest.shift() || 'ls';
  if (sub === 'ls' || sub === 'list') {
    const cfg = loadConfig(cfgPath);
    const names = Object.keys(cfg.profiles);
    if (!names.length) {
      out('No profiles yet. Add one: portcull profile add <name> <ports...>');
      return 0;
    }
    for (const n of names.sort()) out(`${n}: ${cfg.profiles[n].join(', ')}`);
    return 0;
  }
  if (sub === 'add') {
    const name = rest.shift();
    if (!name) {
      err('Usage: portcull profile add <name> <ports...>');
      return 2;
    }
    const spec = parsePortSpec(rest);
    if (spec.error) {
      err(spec.error);
      return 2;
    }
    if (!spec.ports.length) {
      err('Provide at least one port');
      return 2;
    }
    addProfile(name, spec.ports, cfgPath);
    out(`Saved profile "${name}": ${spec.ports.join(', ')}`);
    return 0;
  }
  if (sub === 'rm' || sub === 'remove' || sub === 'delete') {
    const name = rest.shift();
    if (!name) {
      err('Usage: portcull profile rm <name>');
      return 2;
    }
    const cfg = loadConfig(cfgPath);
    if (!cfg.profiles[name]) {
      err(`No such profile: ${name}`);
      return 2;
    }
    removeProfile(name, cfgPath);
    out(`Removed profile "${name}"`);
    return 0;
  }
  err(`Unknown profile command: ${sub}`);
  return 2;
}

/**
 * Run the CLI. Returns the intended process exit code.
 *
 * @param {string[]} argv argv without node + script path
 * @param {object} [deps] injectable dependencies for testing
 * @returns {Promise<number>}
 */
export async function run(argv, deps = {}) {
  const out = deps.out || ((s) => process.stdout.write(`${s}\n`));
  const err = deps.err || ((s) => process.stderr.write(`${s}\n`));
  const getListeningPorts = deps.getListeningPorts || realGetListeningPorts;
  const killTargets = deps.killTargets || realKillTargets;
  const cfgPath = deps.cfgPath || configPath();

  const parsed = parseArgs(argv);
  if (parsed.error) {
    err(parsed.error);
    return 2;
  }
  const { command, rest, opts } = parsed;
  if (opts.help) {
    out(HELP);
    return 0;
  }
  if (opts.version) {
    out(getVersion());
    return 0;
  }

  const ctx = { rest, opts, out, err, getListeningPorts, killTargets, cfgPath };
  switch (command) {
    case 'ls':
    case 'list':
      return cmdList(ctx);
    case 'kill':
    case 'free':
    case 'k':
      return cmdKill(ctx);
    case 'profile':
    case 'profiles':
      return cmdProfile(ctx);
    default:
      err(`Unknown command: ${command}`);
      err('Run `portcull --help` for usage.');
      return 2;
  }
}
