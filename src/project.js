// Resolves a human-friendly project name from a process's working directory.
// Side-effecting (reads package.json) but the read is injectable, mirroring
// the `exec` injection pattern in scan.js, so it can be unit-tested without
// touching the filesystem.

import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * @param {string} cwd
 * @param {{ readFile?: (p: string) => string }} [deps]
 * @returns {string | null}
 */
export function friendlyProjectName(cwd, { readFile = (p) => readFileSync(p, 'utf8') } = {}) {
  if (!cwd) return null;
  try {
    const pkg = JSON.parse(readFile(path.join(cwd, 'package.json')));
    if (pkg && typeof pkg.name === 'string' && pkg.name.trim()) return pkg.name.trim();
  } catch {
    // No package.json, unreadable, or invalid JSON — fall back to the
    // directory name below.
  }
  const base = path.basename(cwd);
  return base && base !== path.sep ? base : null;
}
