import { describe, it, expect } from 'vitest';
import { extractBacklogSuggestions, buildPlanningSystemPrompt } from '../../../src/utils/planning';

describe('extractBacklogSuggestions', () => {
  it('extracts standard **Add to backlog?** format', () => {
    const content = `Here's an idea:

**Add to backlog?**
Title: Dark Mode Support
Description: Add dark/light theme toggle with system preference detection
Priority: high`;

    const suggestions = extractBacklogSuggestions(content);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].title).toBe('Dark Mode Support');
    expect(suggestions[0].description).toBe('Add dark/light theme toggle with system preference detection');
    expect(suggestions[0].priority).toBe('high');
  });

  it('extracts markdown header format', () => {
    const content = `### Add to backlog?
Title: Notifications
Description: Real-time push notifications
Priority: medium`;

    const suggestions = extractBacklogSuggestions(content);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].title).toBe('Notifications');
    expect(suggestions[0].priority).toBe('medium');
  });

  it('extracts bullet format with backlog mention', () => {
    const content = `Adding to backlog:
Title: Search Feature
Description: Full-text search across all content
Priority: low`;

    const suggestions = extractBacklogSuggestions(content);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].title).toBe('Search Feature');
    expect(suggestions[0].priority).toBe('low');
  });

  it('defaults priority to medium when not specified', () => {
    const content = `**Add to backlog?**
Title: Analytics Dashboard`;

    const suggestions = extractBacklogSuggestions(content);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].priority).toBe('medium');
  });

  it('defaults description to empty when not specified', () => {
    const content = `**Add to backlog?**
Title: Quick Win`;

    const suggestions = extractBacklogSuggestions(content);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].description).toBe('');
  });

  it('extracts multiple suggestions', () => {
    const content = `**Add to backlog?**
Title: Feature A
Description: Desc A
Priority: high

**Add to backlog?**
Title: Feature B
Description: Desc B
Priority: low`;

    const suggestions = extractBacklogSuggestions(content);
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].title).toBe('Feature A');
    expect(suggestions[1].title).toBe('Feature B');
  });

  it('deduplicates by title (case-insensitive)', () => {
    const content = `**Add to backlog?**
Title: Dark Mode
Description: First mention
Priority: high

### Add to backlog
Title: dark mode
Description: Second mention
Priority: low`;

    const suggestions = extractBacklogSuggestions(content);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].title).toBe('Dark Mode');
  });

  it('returns empty array for no suggestions', () => {
    const content = 'Just a regular conversation with no backlog items.';
    expect(extractBacklogSuggestions(content)).toEqual([]);
  });

  it('handles suggested feature format', () => {
    const content = `Suggested feature:
Title: Export to PDF
Description: Allow exporting reports as PDF files
Priority: medium`;

    const suggestions = extractBacklogSuggestions(content);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].title).toBe('Export to PDF');
  });

  it('handles bold Title/Description/Priority labels', () => {
    const content = `### Add to backlog?
**Title**: OAuth Integration
**Description**: Add Google and GitHub OAuth login
**Priority**: high`;

    const suggestions = extractBacklogSuggestions(content);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].title).toBe('OAuth Integration');
  });

  it('handles bullet-prefixed fields', () => {
    const content = `**Add to backlog?**
- Title: Mobile App
- Description: React Native companion app
- Priority: low`;

    const suggestions = extractBacklogSuggestions(content);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].title).toBe('Mobile App');
  });
});

describe('buildPlanningSystemPrompt', () => {
  it('includes project name', () => {
    const prompt = buildPlanningSystemPrompt('MyApp', null, [], []);
    expect(prompt).toContain('MyApp');
  });

  it('includes PRD when provided', () => {
    const prompt = buildPlanningSystemPrompt('App', 'The PRD content', [], []);
    expect(prompt).toContain('The PRD content');
  });

  it('shows "Not available" when PRD is null', () => {
    const prompt = buildPlanningSystemPrompt('App', null, [], []);
    expect(prompt).toContain('Not available');
  });

  it('lists V1 features', () => {
    const prompt = buildPlanningSystemPrompt('App', null, ['Auth', 'Dashboard'], []);
    expect(prompt).toContain('- Auth');
    expect(prompt).toContain('- Dashboard');
  });

  it('shows "None specified" when no V1 features', () => {
    const prompt = buildPlanningSystemPrompt('App', null, [], []);
    expect(prompt).toContain('None specified');
  });

  it('includes backlog items with priority', () => {
    const backlog = [
      { title: 'Dark Mode', priority: 'high' },
      { title: 'Search', priority: 'low' },
    ];
    const prompt = buildPlanningSystemPrompt('App', null, [], backlog);
    expect(prompt).toContain('[high] Dark Mode');
    expect(prompt).toContain('[low] Search');
  });

  it('omits backlog section when empty', () => {
    const prompt = buildPlanningSystemPrompt('App', null, [], []);
    expect(prompt).not.toContain('Current backlog');
  });

  it('includes the backlog format instructions', () => {
    const prompt = buildPlanningSystemPrompt('App', null, [], []);
    expect(prompt).toContain('**Add to backlog?**');
    expect(prompt).toContain('Title:');
    expect(prompt).toContain('Description:');
    expect(prompt).toContain('Priority:');
  });
});
