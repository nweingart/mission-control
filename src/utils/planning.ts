/**
 * Shared utilities for V2 Planning feature
 */

// Multiple patterns to detect backlog suggestions from Claude (flexible matching)
const BACKLOG_PATTERNS = [
  // Standard format: **Add to backlog?** followed by Title/Description/Priority
  /\*\*Add to backlog\?\*\*\s*\n+(?:[-•]?\s*)?Title:\s*(.+?)(?:\n+(?:[-•]?\s*)?Description:\s*(.+?))?(?:\n+(?:[-•]?\s*)?Priority:\s*(high|medium|low))?(?:\n|$)/gi,
  // Markdown header format: ### Add to backlog
  /###?\s*Add to backlog\??\s*\n+(?:[-•*]?\s*)?(?:\*\*)?Title(?:\*\*)?:\s*(.+?)(?:\n+(?:[-•*]?\s*)?(?:\*\*)?Description(?:\*\*)?:\s*(.+?))?(?:\n+(?:[-•*]?\s*)?(?:\*\*)?Priority(?:\*\*)?:\s*(high|medium|low))?(?:\n|$)/gi,
  // Bullet format with backlog mention
  /(?:add(?:ing)?\s+to\s+backlog|backlog\s+item|suggested?\s+feature)[:.]?\s*\n+(?:[-•*]?\s*)?(?:\*\*)?Title(?:\*\*)?:\s*(.+?)(?:\n+(?:[-•*]?\s*)?(?:\*\*)?Description(?:\*\*)?:\s*(.+?))?(?:\n+(?:[-•*]?\s*)?(?:\*\*)?Priority(?:\*\*)?:\s*(high|medium|low))?(?:\n|$)/gi,
];

export interface BacklogSuggestion {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Extract backlog suggestions from Claude's response text.
 * Uses multiple regex patterns to handle various formatting styles.
 */
export function extractBacklogSuggestions(content: string): BacklogSuggestion[] {
  const suggestions: BacklogSuggestion[] = [];
  const seenTitles = new Set<string>();

  for (const pattern of BACKLOG_PATTERNS) {
    // Reset regex
    pattern.lastIndex = 0;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const title = match[1]?.trim();
      if (!title || seenTitles.has(title.toLowerCase())) continue;

      seenTitles.add(title.toLowerCase());
      suggestions.push({
        title,
        description: match[2]?.trim() || '',
        priority: (match[3]?.toLowerCase() as 'high' | 'medium' | 'low') || 'medium',
      });
    }
  }

  return suggestions;
}

/**
 * Build the system prompt for V2 planning conversations.
 */
export function buildPlanningSystemPrompt(
  projectName: string,
  prd: string | null,
  v1Features: string[],
  backlogItems: Array<{ title: string; priority: string }>
): string {
  const v1FeaturesList = v1Features.length > 0
    ? v1Features.map((f) => `- ${f}`).join('\n')
    : 'None specified';

  const backlogList = backlogItems.length > 0
    ? `\n\nCurrent backlog:\n${backlogItems.map((b) => `- [${b.priority}] ${b.title}`).join('\n')}`
    : '';

  return `You are helping plan V2 features for "${projectName}".

Context:
- PRD: ${prd || 'Not available'}
- V1 Features being built:
${v1FeaturesList}
${backlogList}

Your role:
1. Suggest potential V2 features based on natural extensions of the MVP
2. Discuss ideas conversationally with the user
3. When an idea is ready to add, use this exact format:

**Add to backlog?**
Title: [Feature title]
Description: [1-2 sentence description]
Priority: [high/medium/low]

4. Help prioritize and refine ideas
5. Keep responses concise and conversational

Start by suggesting a few V2 ideas if this is a new conversation.`;
}
