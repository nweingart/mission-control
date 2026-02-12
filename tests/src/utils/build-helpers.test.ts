import { describe, it, expect } from 'vitest';
import {
  slugify,
  extractJsonObject,
  parseReviewResponse,
  hasFixableIssues,
  hasCriticalUnfixable,
  buildReviewPrompt,
  buildFixPrompt,
} from '../../../src/utils/build-helpers';
import type { ReviewArtifact, Task } from '../../../src/types';

describe('slugify', () => {
  it('converts text to lowercase slug', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('replaces non-alphanumeric chars with hyphens', () => {
    expect(slugify('My App!! v2.0')).toBe('my-app-v2-0');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('---hello---')).toBe('hello');
  });

  it('collapses consecutive hyphens', () => {
    expect(slugify('a   b   c')).toBe('a-b-c');
  });

  it('truncates to 40 characters', () => {
    const long = 'a'.repeat(60);
    expect(slugify(long).length).toBe(40);
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles special characters only', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('extractJsonObject', () => {
  it('extracts a simple JSON object', () => {
    const text = 'prefix {"key": "value"} suffix';
    expect(extractJsonObject(text)).toBe('{"key": "value"}');
  });

  it('handles nested objects', () => {
    const text = '{"a": {"b": "c"}}';
    expect(extractJsonObject(text)).toBe('{"a": {"b": "c"}}');
  });

  it('handles strings with escaped quotes', () => {
    const text = '{"key": "value with \\"quotes\\""}';
    expect(extractJsonObject(text)).toBe('{"key": "value with \\"quotes\\""}');
  });

  it('handles strings with braces inside', () => {
    const text = '{"key": "{ not a brace }"}';
    expect(extractJsonObject(text)).toBe('{"key": "{ not a brace }"}');
  });

  it('returns null when no object found', () => {
    expect(extractJsonObject('no json here')).toBeNull();
  });

  it('returns null for unclosed object', () => {
    expect(extractJsonObject('{"key": "value"')).toBeNull();
  });

  it('extracts first object when multiple exist', () => {
    const text = '{"a": 1} {"b": 2}';
    expect(extractJsonObject(text)).toBe('{"a": 1}');
  });

  it('handles escaped backslashes in strings', () => {
    const text = '{"path": "C:\\\\Users\\\\test"}';
    expect(extractJsonObject(text)).toBe('{"path": "C:\\\\Users\\\\test"}');
  });
});

describe('parseReviewResponse', () => {
  const task: Task = { id: 'task-1', title: 'Add login', completed: false };
  const branchName = 'feat/login';
  const diffStat = '3 files changed';

  it('parses valid JSON review response', () => {
    const response = JSON.stringify({
      findings: [
        { severity: 'warning', category: 'security', description: 'Missing input validation', file: 'auth.ts' },
      ],
      summary: 'Looks good overall.',
      canAutoFix: true,
    });
    const result = parseReviewResponse(response, task, branchName, diffStat);
    expect(result.taskId).toBe('task-1');
    expect(result.taskTitle).toBe('Add login');
    expect(result.branchName).toBe('feat/login');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('warning');
    expect(result.findings[0].category).toBe('security');
    expect(result.findings[0].file).toBe('auth.ts');
    expect(result.findings[0].fixed).toBe(false);
    expect(result.summary).toBe('Looks good overall.');
    expect(result.canAutoFix).toBe(true);
    expect(result.diffStat).toBe('3 files changed');
  });

  it('defaults missing finding fields', () => {
    const response = JSON.stringify({
      findings: [{}],
      summary: 'Done.',
    });
    const result = parseReviewResponse(response, task, branchName, diffStat);
    expect(result.findings[0].severity).toBe('info');
    expect(result.findings[0].category).toBe('general');
    expect(result.findings[0].description).toBe('');
  });

  it('defaults canAutoFix to true when not provided', () => {
    const response = JSON.stringify({ findings: [], summary: 'Clean.' });
    const result = parseReviewResponse(response, task, branchName, diffStat);
    expect(result.canAutoFix).toBe(true);
  });

  it('falls back when JSON is not review format', () => {
    const response = '{"notFindings": true}';
    const result = parseReviewResponse(response, task, branchName, diffStat);
    expect(result.canAutoFix).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('info');
  });

  it('falls back on invalid JSON', () => {
    const response = 'This is just plain text review feedback.';
    const result = parseReviewResponse(response, task, branchName, diffStat);
    expect(result.canAutoFix).toBe(false);
    expect(result.summary).toBe(response.slice(0, 300));
    expect(result.findings[0].description).toBe(response.slice(0, 500));
  });

  it('truncates fallback summary to 300 chars', () => {
    const response = 'x'.repeat(400);
    const result = parseReviewResponse(response, task, branchName, diffStat);
    expect(result.summary.length).toBe(300);
  });

  it('extracts JSON surrounded by text', () => {
    const response = `Here is my review:\n${JSON.stringify({
      findings: [{ severity: 'critical', category: 'bug', description: 'NPE' }],
      summary: 'Found bug.',
    })}\nEnd of review.`;
    const result = parseReviewResponse(response, task, branchName, diffStat);
    expect(result.findings[0].severity).toBe('critical');
  });
});

describe('hasFixableIssues', () => {
  it('returns true when critical unfixed findings exist', () => {
    const artifact: ReviewArtifact = {
      taskId: '1', taskTitle: 'T', branchName: 'b', diffStat: '', timestamp: '',
      summary: '', autoFixApplied: false, canAutoFix: true,
      findings: [{ severity: 'critical', category: 'bug', description: 'd', fixed: false }],
    };
    expect(hasFixableIssues(artifact)).toBe(true);
  });

  it('returns true when warning unfixed findings exist', () => {
    const artifact: ReviewArtifact = {
      taskId: '1', taskTitle: 'T', branchName: 'b', diffStat: '', timestamp: '',
      summary: '', autoFixApplied: false, canAutoFix: true,
      findings: [{ severity: 'warning', category: 'perf', description: 'd', fixed: false }],
    };
    expect(hasFixableIssues(artifact)).toBe(true);
  });

  it('returns false when all findings are info', () => {
    const artifact: ReviewArtifact = {
      taskId: '1', taskTitle: 'T', branchName: 'b', diffStat: '', timestamp: '',
      summary: '', autoFixApplied: false, canAutoFix: true,
      findings: [{ severity: 'info', category: 'style', description: 'd', fixed: false }],
    };
    expect(hasFixableIssues(artifact)).toBe(false);
  });

  it('returns false when all critical/warning are fixed', () => {
    const artifact: ReviewArtifact = {
      taskId: '1', taskTitle: 'T', branchName: 'b', diffStat: '', timestamp: '',
      summary: '', autoFixApplied: false, canAutoFix: true,
      findings: [{ severity: 'critical', category: 'bug', description: 'd', fixed: true }],
    };
    expect(hasFixableIssues(artifact)).toBe(false);
  });

  it('returns false for empty findings', () => {
    const artifact: ReviewArtifact = {
      taskId: '1', taskTitle: 'T', branchName: 'b', diffStat: '', timestamp: '',
      summary: '', autoFixApplied: false, canAutoFix: true,
      findings: [],
    };
    expect(hasFixableIssues(artifact)).toBe(false);
  });
});

describe('hasCriticalUnfixable', () => {
  it('returns true when unfixed critical exists', () => {
    const artifact: ReviewArtifact = {
      taskId: '1', taskTitle: 'T', branchName: 'b', diffStat: '', timestamp: '',
      summary: '', autoFixApplied: false, canAutoFix: true,
      findings: [{ severity: 'critical', category: 'sec', description: 'd', fixed: false }],
    };
    expect(hasCriticalUnfixable(artifact)).toBe(true);
  });

  it('returns false when critical is fixed', () => {
    const artifact: ReviewArtifact = {
      taskId: '1', taskTitle: 'T', branchName: 'b', diffStat: '', timestamp: '',
      summary: '', autoFixApplied: false, canAutoFix: true,
      findings: [{ severity: 'critical', category: 'sec', description: 'd', fixed: true }],
    };
    expect(hasCriticalUnfixable(artifact)).toBe(false);
  });

  it('returns false when only warnings exist', () => {
    const artifact: ReviewArtifact = {
      taskId: '1', taskTitle: 'T', branchName: 'b', diffStat: '', timestamp: '',
      summary: '', autoFixApplied: false, canAutoFix: true,
      findings: [{ severity: 'warning', category: 'perf', description: 'd', fixed: false }],
    };
    expect(hasCriticalUnfixable(artifact)).toBe(false);
  });
});

describe('buildReviewPrompt', () => {
  const task: Task = { id: '1', title: 'Fix auth bug', completed: false };

  it('includes task title', () => {
    const prompt = buildReviewPrompt(task, 'diff content');
    expect(prompt).toContain('Fix auth bug');
  });

  it('includes diff content', () => {
    const prompt = buildReviewPrompt(task, '+added line\n-removed line');
    expect(prompt).toContain('+added line');
    expect(prompt).toContain('-removed line');
  });

  it('truncates diff to 50000 chars', () => {
    const longDiff = 'x'.repeat(60000);
    const prompt = buildReviewPrompt(task, longDiff);
    expect(prompt).not.toContain('x'.repeat(60000));
    expect(prompt.length).toBeLessThan(60000);
  });

  it('includes expected JSON format instructions', () => {
    const prompt = buildReviewPrompt(task, 'diff');
    expect(prompt).toContain('"findings"');
    expect(prompt).toContain('"summary"');
    expect(prompt).toContain('"canAutoFix"');
  });
});

describe('buildFixPrompt', () => {
  it('includes unfixed critical and warning issues', () => {
    const artifact: ReviewArtifact = {
      taskId: '1', taskTitle: 'T', branchName: 'b', diffStat: '', timestamp: '',
      summary: '', autoFixApplied: false, canAutoFix: true,
      findings: [
        { severity: 'critical', category: 'security', description: 'SQL injection', file: 'db.ts', fixed: false },
        { severity: 'warning', category: 'perf', description: 'N+1 query', fixed: false },
        { severity: 'info', category: 'style', description: 'Naming convention', fixed: false },
        { severity: 'critical', category: 'bug', description: 'Already fixed', fixed: true },
      ],
    };
    const prompt = buildFixPrompt(artifact);
    expect(prompt).toContain('SQL injection');
    expect(prompt).toContain('(db.ts)');
    expect(prompt).toContain('N+1 query');
    expect(prompt).not.toContain('Naming convention');
    expect(prompt).not.toContain('Already fixed');
  });

  it('produces empty issue list when all fixed', () => {
    const artifact: ReviewArtifact = {
      taskId: '1', taskTitle: 'T', branchName: 'b', diffStat: '', timestamp: '',
      summary: '', autoFixApplied: false, canAutoFix: true,
      findings: [
        { severity: 'critical', category: 'bug', description: 'Fixed', fixed: true },
      ],
    };
    const prompt = buildFixPrompt(artifact);
    expect(prompt).toContain('Fix these issues');
    expect(prompt).not.toContain('[critical]');
  });
});
