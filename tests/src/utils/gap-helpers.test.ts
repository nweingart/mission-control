import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildGapAnalysisPrompt,
  buildGapMetaReviewPrompt,
  buildGapFixPrompt,
  countWords,
  detectPRDSections,
  formatRelativeTime,
} from '../../../src/utils/gap-helpers';

describe('countWords', () => {
  it('counts words in a sentence', () => {
    expect(countWords('hello world foo')).toBe(3);
  });

  it('handles multiple spaces', () => {
    expect(countWords('a   b   c')).toBe(3);
  });

  it('handles tabs and newlines', () => {
    expect(countWords('a\tb\nc')).toBe(3);
  });

  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('returns 0 for whitespace only', () => {
    expect(countWords('   \t\n  ')).toBe(0);
  });
});

describe('detectPRDSections', () => {
  it('detects all standard sections', () => {
    const prd = `## Overview\n## User Stories\n## Feature Specs\n## Data Model\n## API Endpoints\n## Tech Stack\n## MVP Scope`;
    const sections = detectPRDSections(prd);
    expect(sections).toContain('Overview');
    expect(sections).toContain('User Stories');
    expect(sections).toContain('Features');
    expect(sections).toContain('Data Model');
    expect(sections).toContain('API Endpoints');
    expect(sections).toContain('Tech Stack');
    expect(sections).toContain('MVP Scope');
  });

  it('detects numbered sections', () => {
    const prd = `## 1. Overview\n## 2. User Stories\n## 3. Features`;
    const sections = detectPRDSections(prd);
    expect(sections).toContain('Overview');
    expect(sections).toContain('User Stories');
    expect(sections).toContain('Features');
  });

  it('handles single # headers', () => {
    const prd = `# Overview\n# API`;
    const sections = detectPRDSections(prd);
    expect(sections).toContain('Overview');
    expect(sections).toContain('API Endpoints');
  });

  it('returns empty for no sections', () => {
    expect(detectPRDSections('Just some text without headers.')).toEqual([]);
  });

  it('is case insensitive', () => {
    const prd = `## OVERVIEW\n## tech stack`;
    const sections = detectPRDSections(prd);
    expect(sections).toContain('Overview');
    expect(sections).toContain('Tech Stack');
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for < 1 minute', () => {
    const ts = Date.now() - 30_000; // 30 seconds ago
    expect(formatRelativeTime(ts)).toBe('just now');
  });

  it('returns "1 minute ago" for 1 minute', () => {
    const ts = Date.now() - 60_000;
    expect(formatRelativeTime(ts)).toBe('1 minute ago');
  });

  it('returns plural minutes', () => {
    const ts = Date.now() - 5 * 60_000;
    expect(formatRelativeTime(ts)).toBe('5 minutes ago');
  });

  it('returns hours for >= 60 minutes', () => {
    const ts = Date.now() - 2 * 60 * 60_000;
    expect(formatRelativeTime(ts)).toBe('2 hours ago');
  });

  it('returns "1 hour ago" for singular', () => {
    const ts = Date.now() - 60 * 60_000;
    expect(formatRelativeTime(ts)).toBe('1 hour ago');
  });

  it('returns days for >= 24 hours', () => {
    const ts = Date.now() - 3 * 24 * 60 * 60_000;
    expect(formatRelativeTime(ts)).toBe('3 days ago');
  });

  it('returns "1 day ago" for singular', () => {
    const ts = Date.now() - 24 * 60 * 60_000;
    expect(formatRelativeTime(ts)).toBe('1 day ago');
  });
});

describe('buildGapAnalysisPrompt', () => {
  it('includes the PRD content', () => {
    const prompt = buildGapAnalysisPrompt('My PRD content here');
    expect(prompt).toContain('My PRD content here');
  });

  it('includes grading instructions', () => {
    const prompt = buildGapAnalysisPrompt('PRD');
    expect(prompt).toContain('grade');
    expect(prompt).toContain('findings');
    expect(prompt).toContain('remainingItems');
  });
});

describe('buildGapMetaReviewPrompt', () => {
  it('includes both PRD and analysis', () => {
    const prompt = buildGapMetaReviewPrompt('the prd', '{"grade": 80}');
    expect(prompt).toContain('the prd');
    expect(prompt).toContain('{"grade": 80}');
  });

  it('includes validation instructions', () => {
    const prompt = buildGapMetaReviewPrompt('prd', 'analysis');
    expect(prompt).toContain('validatedGrade');
    expect(prompt).toContain('false positive');
  });
});

describe('buildGapFixPrompt', () => {
  it('includes unresolved findings', () => {
    const findings = [
      { severity: 'missing', category: 'Auth', description: 'No login page', prdSection: 'Features', resolved: false },
      { severity: 'incomplete', category: 'UI', description: 'Missing sidebar', resolved: false },
    ];
    const prompt = buildGapFixPrompt(findings);
    expect(prompt).toContain('[missing] Auth: No login page (PRD: Features)');
    expect(prompt).toContain('[incomplete] UI: Missing sidebar');
  });

  it('excludes resolved findings', () => {
    const findings = [
      { severity: 'missing', category: 'Auth', description: 'No login', resolved: true },
      { severity: 'incomplete', category: 'UI', description: 'Missing nav', resolved: false },
    ];
    const prompt = buildGapFixPrompt(findings);
    expect(prompt).not.toContain('No login');
    expect(prompt).toContain('Missing nav');
  });

  it('handles empty findings', () => {
    const prompt = buildGapFixPrompt([]);
    expect(prompt).toContain('Fix each one directly');
  });
});
