// Pure presentation helpers — table rendering and JSON serialization.

/**
 * Render a fixed-width text table. Columns are padded to the widest cell.
 *
 * @param {string[]} header
 * @param {Array<Array<string|number>>} rows
 * @returns {string}
 */
export function renderTable(header, rows) {
  const widths = header.map((h, i) =>
    Math.max(String(h).length, ...rows.map((r) => String(r[i] ?? '').length)),
  );
  const fmtRow = (cells) =>
    cells
      .map((c, i) => String(c ?? '').padEnd(widths[i]))
      .join('  ')
      .trimEnd();
  return [fmtRow(header), ...rows.map(fmtRow)].join('\n');
}

/**
 * Format listening-port entries as a table, with a one-line summary footer.
 *
 * @param {Array<object>} entries
 * @returns {string}
 */
export function formatPorts(entries) {
  if (!entries || entries.length === 0) return 'No listening ports found.';
  const header = ['PORT', 'PID', 'LABEL', 'UPTIME', 'COMMAND'];
  const rows = entries.map((e) => [
    e.port,
    e.pid,
    e.label || '-',
    e.uptime || '-',
    e.command || '-',
  ]);
  const labelled = entries.filter((e) => e.label).length;
  const noun = entries.length === 1 ? 'port' : 'ports';
  const footer = `\n${entries.length} listening ${noun} · ${labelled} known dev`;
  return renderTable(header, rows) + footer;
}

/**
 * Format entries as pretty JSON.
 * @param {Array<object>} entries
 * @returns {string}
 */
export function formatJson(entries) {
  return JSON.stringify(entries, null, 2);
}
