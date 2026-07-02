import { describe, it, expect } from 'vitest';
import { friendlyProjectName } from '../src/project.js';

describe('friendlyProjectName', () => {
  it('reads the name field from package.json', () => {
    const readFile = () => JSON.stringify({ name: 'the-chronicle' });
    expect(friendlyProjectName('/Users/dev/code/the-chronicle', { readFile })).toBe('the-chronicle');
  });
  it('falls back to the directory basename when package.json is missing', () => {
    const readFile = () => {
      throw new Error('ENOENT');
    };
    expect(friendlyProjectName('/Users/dev/code/the-chronicle', { readFile })).toBe('the-chronicle');
  });
  it('falls back to the directory basename when package.json has no name field', () => {
    const readFile = () => JSON.stringify({ version: '1.0.0' });
    expect(friendlyProjectName('/Users/dev/code/foo', { readFile })).toBe('foo');
  });
  it('falls back to the directory basename on invalid JSON', () => {
    const readFile = () => 'not json';
    expect(friendlyProjectName('/Users/dev/code/foo', { readFile })).toBe('foo');
  });
  it('returns null for an empty cwd', () => {
    expect(friendlyProjectName('')).toBeNull();
  });
  it('returns null when the resolved basename is just a path separator', () => {
    const readFile = () => {
      throw new Error('ENOENT');
    };
    expect(friendlyProjectName('/', { readFile })).toBeNull();
  });
});
