import { homedir } from 'os';

/**
 * Build an enhanced PATH that includes common CLI tool locations.
 * Consolidates the duplicated PATH logic that was in multiple IPC handlers.
 */
export function buildEnhancedPath(): string {
  const home = homedir();
  const extraPaths = [
    `${home}/.local/bin`,
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  const currentPath = process.env.PATH || '';
  return [...extraPaths, ...currentPath.split(':')].join(':');
}
