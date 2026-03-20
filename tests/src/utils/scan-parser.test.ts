import { describe, it, expect } from 'vitest';
import { parseScanResponse, mergeWithExisting, buildScanPrompt, generateFingerprint, generateIssueFingerprint } from '../../../src/utils/scan-parser';
import type { FeatureModule, CodeIssue } from '../../../src/types';

const validJson = {
  masterPrd: 'Test PRD content',
  techStack: {
    languages: ['TypeScript'],
    frameworks: ['React'],
    buildTools: ['Vite'],
    summary: 'React + Vite app',
  },
  features: [
    { name: 'Auth', description: 'User auth', prd: 'Auth PRD', files: ['src/auth.ts'] },
  ],
  issues: [
    { title: 'Bug', description: 'A bug', severity: 'warning', category: 'bug', estimatedEffort: 'quick_fix', file: 'src/app.ts' },
  ],
  featureIdeas: [
    { title: 'Dark Mode', description: 'Add dark mode', rationale: 'Users want it' },
  ],
  fileCount: 42,
  summary: '1 feature, 1 issue',
};

describe('parseScanResponse', () => {
  it('parses valid JSON string directly', () => {
    const result = parseScanResponse(JSON.stringify(validJson));
    expect(result.masterPrd).toBe('Test PRD content');
    expect(result.features).toHaveLength(1);
    expect(result.features[0].name).toBe('Auth');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].title).toBe('Bug');
    expect(result.techStack.summary).toBe('React + Vite app');
    expect(result.featureIdeas).toHaveLength(1);
    expect(result.fileCount).toBe(42);
    expect(result.summary).toBe('1 feature, 1 issue');
  });

  it('extracts JSON from markdown fenced code block', () => {
    const wrapped = `Here is the analysis:\n\`\`\`json\n${JSON.stringify(validJson)}\n\`\`\`\nDone.`;
    const result = parseScanResponse(wrapped);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].name).toBe('Auth');
  });

  it('extracts JSON embedded in surrounding text', () => {
    const wrapped = `Some preamble text\n${JSON.stringify(validJson)}\nSome trailing text`;
    const result = parseScanResponse(wrapped);
    expect(result.masterPrd).toBe('Test PRD content');
  });

  it('throws on malformed JSON', () => {
    expect(() => parseScanResponse('not json at all')).toThrow('Scan did not return valid JSON');
  });

  it('handles missing optional fields gracefully', () => {
    const minimal = JSON.stringify({ masterPrd: 'Hello' });
    const result = parseScanResponse(minimal);
    expect(result.masterPrd).toBe('Hello');
    expect(result.features).toHaveLength(0);
    expect(result.issues).toHaveLength(0);
    expect(result.featureIdeas).toHaveLength(0);
    expect(result.fileCount).toBe(0);
    expect(result.summary).toBe('Scan complete');
  });

  it('generates fingerprints for features', () => {
    const result = parseScanResponse(JSON.stringify(validJson));
    expect(result.features[0].fingerprint).toBeDefined();
    expect(typeof result.features[0].fingerprint).toBe('string');
  });
});

describe('mergeWithExisting', () => {
  const now = new Date().toISOString();
  const fp = generateFingerprint('Auth', ['src/auth.ts']);

  const existingFeature: FeatureModule = {
    id: 'feat-1',
    fingerprint: fp,
    name: 'Auth',
    description: 'Old auth',
    prd: 'Old PRD',
    files: ['src/auth.ts'],
    status: 'documented',
    createdAt: now,
    lastUpdated: now,
  };

  const newFeature: FeatureModule = {
    id: 'feat-2',
    fingerprint: fp,
    name: 'Auth',
    description: 'New auth',
    prd: 'New PRD',
    files: ['src/auth.ts'],
    status: 'documented',
    createdAt: now,
    lastUpdated: now,
  };

  it('deduplicates features by fingerprint', () => {
    const result = mergeWithExisting([newFeature], [], [existingFeature], []);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].description).toBe('New auth');
  });

  it('detects new features', () => {
    const brandNew: FeatureModule = {
      ...newFeature,
      fingerprint: generateFingerprint('Payments', ['src/pay.ts']),
      name: 'Payments',
    };
    const result = mergeWithExisting([brandNew], [], [existingFeature], []);
    // Should have the new feature + old one marked outdated
    expect(result.features).toHaveLength(2);
    expect(result.diff.newFeatures).toHaveLength(1);
    expect(result.diff.removedFeatures).toHaveLength(1);
  });

  it('merges issues and marks fixed issues', () => {
    const issueFp = generateIssueFingerprint('bug', 'src/app.ts', 'A bug');
    const existingIssue: CodeIssue = {
      id: 'issue-1',
      fingerprint: issueFp,
      title: 'Bug',
      description: 'A bug',
      severity: 'warning',
      category: 'bug',
      estimatedEffort: 'quick_fix',
      file: 'src/app.ts',
      status: 'open',
      firstSeen: now,
      lastSeen: now,
    };

    // No new issues — existing one should be marked fixed
    const result = mergeWithExisting([], [], [], [existingIssue]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].status).toBe('fixed');
    expect(result.diff.issuesFixed).toHaveLength(1);
  });
});

describe('buildScanPrompt', () => {
  it('returns a string with JSON structure instructions', () => {
    const prompt = buildScanPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('masterPrd');
    expect(prompt).toContain('techStack');
    expect(prompt).toContain('features');
    expect(prompt).toContain('issues');
  });
});
