import { describe, it, expect } from 'vitest';
import { renderTable, formatPorts, formatJson } from '../src/format.js';

describe('renderTable', () => {
  it('pads columns to the widest cell', () => {
    const table = renderTable(['A', 'BBBB'], [['xx', 'y'], ['z', 'wwww']]);
    const lines = table.split('\n');
    expect(lines[0]).toBe('A   BBBB');
    expect(lines).toHaveLength(3);
  });
  it('handles no rows', () => {
    expect(renderTable(['A', 'B'], [])).toBe('A  B');
  });
});

describe('formatPorts', () => {
  const entries = [
    { port: 3000, pid: 111, label: 'Next/React', uptime: '2h14m', command: 'node next dev' },
    { port: 9999, pid: 222, label: '', uptime: '5s', command: 'node x.js' },
  ];
  it('renders a table with header and summary footer', () => {
    const out = formatPorts(entries);
    expect(out).toContain('PORT');
    expect(out).toContain('3000');
    expect(out).toContain('Next/React');
    expect(out).toContain('2 listening ports · 1 known dev');
  });
  it('shows a dash for missing label', () => {
    expect(formatPorts(entries)).toMatch(/9999\s+222\s+-/);
  });
  it('handles the empty case', () => {
    expect(formatPorts([])).toBe('No listening ports found.');
  });
  it('uses singular noun for one port', () => {
    expect(formatPorts([entries[0]])).toContain('1 listening port ·');
  });
});

describe('formatJson', () => {
  it('produces parseable JSON', () => {
    const out = formatJson([{ port: 3000 }]);
    expect(JSON.parse(out)).toEqual([{ port: 3000 }]);
  });
});
