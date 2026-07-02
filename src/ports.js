// Registry of well-known development ports, used to label `ls` output and to
// power the `--dev` filter.

export const KNOWN_PORTS = {
  1234: 'Parcel',
  3000: 'Next/React',
  3001: 'Next/React (alt)',
  3333: 'dev server',
  4000: 'Phoenix/dev',
  4200: 'Angular',
  4321: 'Astro',
  4983: 'Drizzle Studio',
  5000: 'Flask/dev',
  5173: 'Vite',
  5174: 'Vite (alt)',
  5432: 'Postgres',
  5500: 'Live Server',
  6006: 'Storybook',
  6379: 'Redis',
  8000: 'Django/HTTP',
  8080: 'HTTP-alt',
  8081: 'Metro/RN',
  8787: 'Wrangler',
  8888: 'Jupyter',
  9000: 'PHP/dev',
  9229: 'Node inspector',
  19000: 'Expo',
  19006: 'Expo Web',
  24678: 'Vite HMR',
  27017: 'MongoDB',
  54321: 'Supabase',
};

/**
 * Human label for a known dev port, or '' if unknown.
 * @param {number} port
 * @returns {string}
 */
export function labelFor(port) {
  return KNOWN_PORTS[port] || '';
}

/**
 * Whether a port is in the known dev-port registry.
 * @param {number} port
 * @returns {boolean}
 */
export function isDevPort(port) {
  return Object.prototype.hasOwnProperty.call(KNOWN_PORTS, port);
}

// Runtime commands that carry no project-identifying information on their
// own (e.g. Next.js explicitly renames its dev worker to "next-server
// (vX.Y.Z)" regardless of which project spawned it). Worth a cwd lookup so
// the ports list can show which project they belong to.
const OPAQUE_COMMANDS = [
  /^next-server\b/,
  /^node$/,
  /^bun$/,
  /^deno$/,
  /^python3?(\.\d+)?$/,
  /^ruby$/,
  /^java$/,
];

/**
 * Whether a shortened command is opaque enough to warrant resolving its
 * process's cwd for a friendlier project name.
 * @param {string} command - already through `shortenCommand`
 * @returns {boolean}
 */
export function isOpaqueCommand(command) {
  return OPAQUE_COMMANDS.some((re) => re.test(command));
}
