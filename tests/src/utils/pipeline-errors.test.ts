import { describe, it, expect } from 'vitest';
import { classifyError, type ErrorCode } from '../../../src/utils/pipeline-errors';

describe('classifyError', () => {
  const cases: [string, ErrorCode, string][] = [
    ['Branch "feature/x" already exists', 'BRANCH_CONFLICT', 'auto_recoverable'],
    ['Unable to create lock file', 'GIT_LOCK', 'auto_recoverable'],
    ['Your local changes would be overwritten by checkout', 'DIRTY_WORKING_TREE', 'auto_recoverable'],
    ['Network error: Could not resolve host github.com during push', 'NETWORK', 'auto_recoverable'],
    ['Claude process produced no output for 600 seconds', 'CLAUDE_TIMEOUT', 'auto_recoverable'],
    ['Error 429: Too many requests', 'CLAUDE_RATE_LIMIT', 'auto_recoverable'],
    ['SSH key authentication failed: publickey', 'SSH_AUTH', 'needs_user_action'],
    ['GitHub CLI is not authenticated. Please run gh auth login', 'GH_AUTH', 'needs_user_action'],
    ['Merge conflict on branch "feature/task-1"', 'MERGE_CONFLICT', 'needs_user_action'],
    ['No space left on device (ENOSPC)', 'DISK_FULL', 'needs_user_action'],
    ['Not a git repository', 'REPO_MISSING', 'catastrophic'],
    ['Claude exited with code 1: segfault', 'CLAUDE_CRASH', 'catastrophic'],
    ['Something completely unexpected happened', 'UNKNOWN', 'catastrophic'],
  ];

  it.each(cases)('classifies "%s" as %s (%s)', (message, expectedCode, expectedSeverity) => {
    const result = classifyError(message);
    expect(result.code).toBe(expectedCode);
    expect(result.severity).toBe(expectedSeverity);
  });

  it('preserves the original message', () => {
    const msg = 'Branch "feature/x" already exists. A previous build attempt may not have cleaned up.';
    const result = classifyError(msg);
    expect(result.message).toBe(msg);
  });

  it('provides retry info for recoverable errors', () => {
    const result = classifyError('Unable to create .git/index.lock file');
    expect(result.canRetry).toBe(true);
    expect(result.canSkipTask).toBe(false);
  });

  it('marks merge conflicts as skippable but not retryable', () => {
    const result = classifyError('CONFLICT (content): Merge conflict in src/index.ts');
    expect(result.canSkipTask).toBe(true);
    expect(result.canRetry).toBe(false);
  });

  it('includes user action for auth errors', () => {
    const result = classifyError('Permission denied (publickey) during SSH push');
    expect(result.userAction).toBeTruthy();
    expect(result.command).toBe('gh auth login');
  });

  it('includes user action for disk full', () => {
    const result = classifyError('write ENOSPC: no space left on device');
    expect(result.userAction).toContain('disk space');
  });

  it('rate limit is auto-recoverable with retry', () => {
    const result = classifyError('Rate limit exceeded. Please try again later.');
    expect(result.code).toBe('CLAUDE_RATE_LIMIT');
    expect(result.canRetry).toBe(true);
    expect(result.severity).toBe('auto_recoverable');
  });
});
