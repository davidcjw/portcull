// Profile persistence. A profile is a named group of ports you kill together,
// e.g. `portcull kill -P web`. Stored as JSON; location is overridable via the
// PORTCULL_CONFIG env var (used by tests and power users).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

/**
 * Resolve the config file path. Honours PORTCULL_CONFIG, then XDG_CONFIG_HOME,
 * then ~/.config/portcull/config.json.
 * @returns {string}
 */
export function configPath() {
  if (process.env.PORTCULL_CONFIG) return process.env.PORTCULL_CONFIG;
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'portcull', 'config.json');
}

/**
 * Coerce arbitrary parsed JSON into a valid config shape, dropping junk.
 * @param {unknown} data
 * @returns {{ profiles: Record<string, number[]> }}
 */
export function normalizeConfig(data) {
  const profiles = {};
  if (data && typeof data === 'object' && data.profiles && typeof data.profiles === 'object') {
    for (const [name, ports] of Object.entries(data.profiles)) {
      if (!Array.isArray(ports)) continue;
      const clean = [
        ...new Set(
          ports
            .map(Number)
            .filter((p) => Number.isInteger(p) && p > 0 && p <= 65535),
        ),
      ].sort((a, b) => a - b);
      if (clean.length) profiles[name] = clean;
    }
  }
  return { profiles };
}

/**
 * Load config, returning an empty config if the file is missing or invalid.
 * @param {string} [path]
 * @returns {{ profiles: Record<string, number[]> }}
 */
export function loadConfig(path = configPath()) {
  try {
    return normalizeConfig(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return { profiles: {} };
  }
}

/**
 * Persist a config (normalizing first). Creates parent dirs as needed.
 * @param {{ profiles: Record<string, number[]> }} config
 * @param {string} [path]
 * @returns {{ profiles: Record<string, number[]> }}
 */
export function saveConfig(config, path = configPath()) {
  const normalized = normalizeConfig(config);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

/**
 * Add or replace a named profile.
 * @param {string} name
 * @param {number[]} ports
 * @param {string} [path]
 */
export function addProfile(name, ports, path = configPath()) {
  const config = loadConfig(path);
  config.profiles[name] = ports;
  return saveConfig(config, path);
}

/**
 * Remove a named profile.
 * @param {string} name
 * @param {string} [path]
 */
export function removeProfile(name, path = configPath()) {
  const config = loadConfig(path);
  delete config.profiles[name];
  return saveConfig(config, path);
}
