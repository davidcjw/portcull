# portcull

[![npm version](https://img.shields.io/npm/v/portcull.svg)](https://www.npmjs.com/package/portcull)
[![CI](https://github.com/davidcjw/portcull/actions/workflows/ci.yml/badge.svg)](https://github.com/davidcjw/portcull/actions/workflows/ci.yml)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)
![Dependencies](https://img.shields.io/badge/dependencies-0-blue.svg)

> List and kill the processes holding your dev ports — never fight `EADDRINUSE` again.

`portcull` is a fast, zero-dependency CLI for the daily "port already in use" annoyance.
See what's listening, what it is, and how long it's been running — then free the port with one command.

<p align="center">
  <img src="docs/demo.gif" alt="portcull demo — listing dev ports, then a dry-run kill" width="720">
</p>

<sub>Demo recorded with [vhs](https://github.com/charmbracelet/vhs) — regenerate with `vhs docs/demo.tape`.</sub>

## Contents

- [Install](#install)
- [Usage](#usage)
  - [Profiles](#profiles)
- [How it works](#how-it-works)
- [Library use](#library-use)
- [Development](#development)
- [Notes & caveats](#notes--caveats)
- [Contributing](#contributing)
- [Code of Conduct](#code-of-conduct)
- [License](#license)

```
$ portcull ls

PORT   PID    LABEL        UPTIME  COMMAND
3000   8821   Next/React   2h14m   node next dev
5173   9930   Vite         18m     node vite
5432   612    Postgres     3d4h    postgres

3 listening ports · 3 known dev

$ portcull kill 3000
killed 8821 on 3000 (SIGTERM)  node next dev
```

## Install

```bash
npm install -g portcull
# or run without installing
npx portcull ls
```

Requires Node.js >= 18 on macOS or Linux (uses `lsof` and `ps`, which ship with both).

## Usage

```bash
portcull ls                  # list every listening TCP port (default command)
portcull ls --dev            # only known dev ports (Next, Vite, Postgres, …)
portcull ls -p 3000,5173     # only specific ports
portcull ls --json           # machine-readable output

portcull kill 3000           # kill whatever listens on 3000 (SIGTERM)
portcull kill 3000 5173      # kill several at once
portcull kill 3000 --force   # SIGKILL instead of SIGTERM
portcull kill 3000 --dry-run # show what would die, kill nothing

portcull profile add web 3000 5173   # save a named group of ports
portcull profile ls                  # list profiles
portcull kill -P web                 # kill every port in "web"
portcull profile rm web              # remove a profile
```

`free` and `k` are aliases for `kill`.

### Profiles

Profiles let you tear down a whole stack at once. They're stored as JSON at
`~/.config/portcull/config.json` (override with the `PORTCULL_CONFIG` env var).

```bash
portcull profile add stack 3000 5173 5432 6379
portcull kill -P stack
```

## How it works

`portcull` shells out to `lsof -nP -iTCP -sTCP:LISTEN` to enumerate listening
sockets, enriches each with the owning process's command and uptime via `ps`,
and signals processes with Node's `process.kill`. Kill defaults to `SIGTERM`
(graceful); `--force` uses `SIGKILL`. There's no magic and no daemon — every
action maps to something you could type yourself.

Some runtimes report a command line with no project-identifying info at all
(Next.js renames its dev worker to the generic `next-server (vX.Y.Z)`
regardless of which project spawned it). For a small allowlist of these
opaque commands, `portcull` resolves the owning project by looking up the
process's working directory (one extra batched `lsof -d cwd` call, not one
per port) and reading `name` from its `package.json`, falling back to the
directory name — e.g. `next-server (v16.2.9) · agent-hq`. If the lookup
fails for any reason, the generic command is shown unchanged.

## Library use

The internals are exported for programmatic use:

```js
import { getListeningPorts, planKill, killTargets } from 'portcull';

const entries = getListeningPorts();
const targets = planKill(entries, [3000]);
killTargets(targets); // SIGTERM
```

## Development

```bash
npm install
npm test          # run the vitest suite
npm run coverage  # with coverage
```

## Notes & caveats

- macOS / Linux only — Windows is not supported (no `lsof`).
- `kill` acts immediately; use `--dry-run` first if you're unsure what's on a port.
- Killing a port owned by a system service may require elevated privileges; a
  failed kill is reported and exits non-zero.

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'feat: describe change'`)
4. Push and open a pull request

Please make sure `npm test` passes before submitting a PR.

## Code of Conduct

This project follows the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
By participating you agree to uphold a welcoming, harassment-free environment.

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.

MIT © David Chong
