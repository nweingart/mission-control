/**
 * Shared utilities for V2 Planning feature
 */

import type { PlanningType } from '../types';

// Multiple patterns to detect backlog suggestions from Claude (flexible matching)
const BACKLOG_PATTERNS: Array<{ pattern: RegExp; hasType: boolean }> = [
  // [BACKLOG_ADD] format with optional Type field
  {
    pattern: /\[BACKLOG_ADD\]\s*\n+(?:[-•]?\s*)?Title:\s*(.+?)(?:\n+(?:[-•]?\s*)?Description:\s*(.+?))?(?:\n+(?:[-•]?\s*)?Priority:\s*(high|medium|low))?(?:\n+(?:[-•]?\s*)?Type:\s*(bug_fix|feature_refactor|new_feature))?(?:\n|$)/gi,
    hasType: true,
  },
  // Standard format: **Add to backlog?** followed by Title/Description/Priority
  {
    pattern: /\*\*Add to backlog\?\*\*\s*\n+(?:[-•]?\s*)?Title:\s*(.+?)(?:\n+(?:[-•]?\s*)?Description:\s*(.+?))?(?:\n+(?:[-•]?\s*)?Priority:\s*(high|medium|low))?(?:\n|$)/gi,
    hasType: false,
  },
  // Markdown header format: ### Add to backlog
  {
    pattern: /###?\s*Add to backlog\??\s*\n+(?:[-•*]?\s*)?(?:\*\*)?Title(?:\*\*)?:\s*(.+?)(?:\n+(?:[-•*]?\s*)?(?:\*\*)?Description(?:\*\*)?:\s*(.+?))?(?:\n+(?:[-•*]?\s*)?(?:\*\*)?Priority(?:\*\*)?:\s*(high|medium|low))?(?:\n|$)/gi,
    hasType: false,
  },
  // Bullet format with backlog mention
  {
    pattern: /(?:add(?:ing)?\s+to\s+backlog|backlog\s+item|suggested?\s+feature)[:.]?\s*\n+(?:[-•*]?\s*)?(?:\*\*)?Title(?:\*\*)?:\s*(.+?)(?:\n+(?:[-•*]?\s*)?(?:\*\*)?Description(?:\*\*)?:\s*(.+?))?(?:\n+(?:[-•*]?\s*)?(?:\*\*)?Priority(?:\*\*)?:\s*(high|medium|low))?(?:\n|$)/gi,
    hasType: false,
  },
];

export interface BacklogSuggestion {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  type?: PlanningType;
}

/**
 * Extract backlog suggestions from Claude's response text.
 * Uses multiple regex patterns to handle various formatting styles.
 */
export function extractBacklogSuggestions(content: string): BacklogSuggestion[] {
  const suggestions: BacklogSuggestion[] = [];
  const seenTitles = new Set<string>();

  for (const { pattern, hasType } of BACKLOG_PATTERNS) {
    // Reset regex
    pattern.lastIndex = 0;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const title = match[1]?.trim();
      if (!title || seenTitles.has(title.toLowerCase())) continue;

      seenTitles.add(title.toLowerCase());
      const suggestion: BacklogSuggestion = {
        title,
        description: match[2]?.trim() || '',
        priority: (match[3]?.toLowerCase() as 'high' | 'medium' | 'low') || 'medium',
      };
      if (hasType && match[4]) {
        suggestion.type = match[4] as PlanningType;
      }
      suggestions.push(suggestion);
    }
  }

  return suggestions;
}

// ─── New directive types ───────────────────────────────────────

export interface BacklogUpdate {
  itemId: string;
  title?: string;
  description?: string;
  priority?: 'high' | 'medium' | 'low';
  type?: PlanningType;
  notes?: string;
  storyPoints?: number;
  sprintId?: string | null; // null means unassign
}

export interface BacklogRemove {
  itemId: string;
}

export interface BacklogPlan {
  itemId: string;
  plan: string;
}

export interface SprintCreate {
  name: string;
}

export interface SprintAssign {
  itemId: string;
  sprintId: string;
}

export interface ExecuteTask {
  itemId: string;
}

// ─── Flexible key-value block parser ───────────────────────────
// Handles fields in any order, tolerates bullets/whitespace/blank lines.

/** All directive tags we recognize (used for block boundary detection) */
const DIRECTIVE_TAGS = [
  'BACKLOG_ADD', 'BACKLOG_UPDATE', 'BACKLOG_REMOVE',
  'BACKLOG_PLAN', '/BACKLOG_PLAN',
  'SPRINT_CREATE', 'SPRINT_ASSIGN',
  'EXECUTE_TASK', 'TASK_COMPLETE',
  'BUILD_CONTINUE', 'BUILD_STOP', 'START_BUILD', 'BUILD_PAUSE_TIERS',
];
const DIRECTIVE_TAG_PATTERN = new RegExp(
  `^\\[(?:${DIRECTIVE_TAGS.map(t => t.replace('/', '\\/')).join('|')})\\]`,
  'i',
);

/**
 * Parse key-value fields from lines following a directive tag.
 * Reads until the next directive tag, a closing tag, or two consecutive blank lines.
 * Returns a Map of lowercase key → raw value string.
 */
function parseDirectiveFields(lines: string[], startIndex: number): { fields: Map<string, string>; endIndex: number } {
  const fields = new Map<string, string>();
  let i = startIndex;
  let consecutiveBlanks = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Stop at next directive tag
    if (DIRECTIVE_TAG_PATTERN.test(trimmed)) break;

    // Track blank lines — two in a row means end of block
    if (trimmed === '') {
      consecutiveBlanks++;
      if (consecutiveBlanks >= 2) { i++; break; }
      i++;
      continue;
    }
    consecutiveBlanks = 0;

    // Strip leading bullet characters
    const cleaned = trimmed.replace(/^[-•*]\s*/, '');

    // Match Key: Value
    const kvMatch = cleaned.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      fields.set(kvMatch[1].toLowerCase(), kvMatch[2].trim());
    }
    i++;
  }
  return { fields, endIndex: i };
}

/**
 * Find all occurrences of a [TAG] in content and parse their key-value fields.
 */
function findDirectiveBlocks(content: string, tag: string): Map<string, string>[] {
  const lines = content.split('\n');
  const results: Map<string, string>[] = [];
  const tagPattern = new RegExp(`^\\[${tag.replace('/', '\\/')}\\]`, 'i');

  for (let i = 0; i < lines.length; i++) {
    if (tagPattern.test(lines[i].trim())) {
      const { fields } = parseDirectiveFields(lines, i + 1);
      results.push(fields);
    }
  }
  return results;
}

/**
 * Extract [BACKLOG_UPDATE] directives from Claude's response.
 */
export function extractBacklogUpdates(content: string): BacklogUpdate[] {
  return findDirectiveBlocks(content, 'BACKLOG_UPDATE').map((fields) => {
    const itemId = fields.get('itemid');
    if (!itemId) return null;
    const update: BacklogUpdate = { itemId };
    const title = fields.get('title');
    if (title) update.title = title;
    const desc = fields.get('description');
    if (desc) update.description = desc;
    const pri = fields.get('priority');
    if (pri && /^(high|medium|low)$/i.test(pri)) update.priority = pri.toLowerCase() as 'high' | 'medium' | 'low';
    const typ = fields.get('type');
    if (typ && /^(bug_fix|feature_refactor|new_feature)$/i.test(typ)) update.type = typ as PlanningType;
    const notes = fields.get('notes');
    if (notes) update.notes = notes;
    const sp = fields.get('storypoints');
    if (sp && /^\d+$/.test(sp)) update.storyPoints = parseInt(sp, 10);
    const sid = fields.get('sprintid');
    if (sid) update.sprintId = sid.toLowerCase() === 'none' ? null : sid;
    return update;
  }).filter((u): u is BacklogUpdate => u !== null);
}

/**
 * Extract [BACKLOG_REMOVE] directives from Claude's response.
 */
export function extractBacklogRemoves(content: string): BacklogRemove[] {
  return findDirectiveBlocks(content, 'BACKLOG_REMOVE').map((fields) => {
    const itemId = fields.get('itemid');
    return itemId ? { itemId } : null;
  }).filter((r): r is BacklogRemove => r !== null);
}

/**
 * Extract [BACKLOG_PLAN]...[/BACKLOG_PLAN] directives.
 * Special case: the Plan field is multiline content between Plan: and [/BACKLOG_PLAN].
 */
export function extractBacklogPlans(content: string): BacklogPlan[] {
  const results: BacklogPlan[] = [];
  const pattern = /\[BACKLOG_PLAN\]\s*\n([\s\S]*?)\[\/BACKLOG_PLAN\]/gi;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const block = match[1];
    const lines = block.split('\n');
    let itemId = '';
    let planStartIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const cleaned = lines[i].trim().replace(/^[-•*]\s*/, '');
      const kvMatch = cleaned.match(/^(\w+):\s*(.*)$/i);
      if (kvMatch) {
        const key = kvMatch[1].toLowerCase();
        if (key === 'itemid') {
          itemId = kvMatch[2].trim();
        } else if (key === 'plan') {
          // Everything after "Plan:" line is the plan content
          planStartIndex = i + 1;
          break;
        }
      }
    }

    if (itemId && planStartIndex >= 0) {
      const plan = lines.slice(planStartIndex).join('\n').trim();
      if (plan) results.push({ itemId, plan });
    }
  }
  return results;
}

/**
 * Extract [SPRINT_CREATE] directives from Claude's response.
 */
export function extractSprintCreates(content: string): SprintCreate[] {
  return findDirectiveBlocks(content, 'SPRINT_CREATE').map((fields) => {
    const name = fields.get('name');
    return name ? { name } : null;
  }).filter((s): s is SprintCreate => s !== null);
}

/**
 * Extract [SPRINT_ASSIGN] directives from Claude's response.
 */
export function extractSprintAssigns(content: string): SprintAssign[] {
  return findDirectiveBlocks(content, 'SPRINT_ASSIGN').map((fields) => {
    const itemId = fields.get('itemid');
    const sprintId = fields.get('sprintid');
    return itemId && sprintId ? { itemId, sprintId } : null;
  }).filter((s): s is SprintAssign => s !== null);
}

/**
 * Extract [EXECUTE_TASK] directives from Claude's response.
 */
export function extractExecuteTasks(content: string): ExecuteTask[] {
  return findDirectiveBlocks(content, 'EXECUTE_TASK').map((fields) => {
    const itemId = fields.get('itemid');
    return itemId ? { itemId } : null;
  }).filter((e): e is ExecuteTask => e !== null);
}

// ─── Build flow directives ────────────────────────────────────

/**
 * Extract [BUILD_CONTINUE] directive from Claude's response.
 */
export function extractBuildContinue(content: string): boolean {
  return /\[BUILD_CONTINUE\]/i.test(content);
}

/**
 * Extract [BUILD_STOP] directive from Claude's response.
 */
export function extractBuildStop(content: string): boolean {
  return /\[BUILD_STOP\]/i.test(content);
}

/**
 * Extract [BUILD_PAUSE_TIERS] directive — re-enable tier-by-tier approval after auto-approve.
 */
export function extractBuildPauseTiers(content: string): boolean {
  return /\[BUILD_PAUSE_TIERS\]/i.test(content);
}

export interface StartBuild {
  sprintId: string;
}

/**
 * Extract [START_BUILD] directives from Claude's response.
 */
export function extractStartBuild(content: string): StartBuild[] {
  return findDirectiveBlocks(content, 'START_BUILD').map((fields) => {
    const sprintId = fields.get('sprintid');
    return sprintId ? { sprintId } : null;
  }).filter((s): s is StartBuild => s !== null);
}

// ─── Directive stripping ───────────────────────────────────────

/** All single-line directive patterns (tag + key-value block until next tag or double-blank) */
const SINGLE_BLOCK_TAGS = [
  'BACKLOG_ADD', 'BACKLOG_UPDATE', 'BACKLOG_REMOVE',
  'SPRINT_CREATE', 'SPRINT_ASSIGN',
  'EXECUTE_TASK', 'TASK_COMPLETE',
  'BUILD_CONTINUE', 'BUILD_STOP', 'START_BUILD', 'BUILD_PAUSE_TIERS',
];

/**
 * Strip all directive blocks from Claude's response so raw tags don't show in chat.
 * Returns cleaned content with directive blocks removed.
 */
export function stripDirectiveBlocks(content: string): string {
  // First strip [BACKLOG_PLAN]...[/BACKLOG_PLAN] multiline blocks
  let result = content.replace(/\[BACKLOG_PLAN\]\s*\n[\s\S]*?\[\/BACKLOG_PLAN\]\s*/gi, '');

  // Strip single-block directives: [TAG] followed by key-value lines
  const lines = result.split('\n');
  const output: string[] = [];
  let skipping = false;
  let consecutiveBlanks = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Check if this line starts a directive block
    const isDirectiveStart = SINGLE_BLOCK_TAGS.some(
      (tag) => new RegExp(`^\\[${tag}\\]`, 'i').test(trimmed),
    );

    if (isDirectiveStart) {
      skipping = true;
      consecutiveBlanks = 0;
      continue;
    }

    if (skipping) {
      if (trimmed === '') {
        consecutiveBlanks++;
        if (consecutiveBlanks >= 2) {
          skipping = false;
          // Don't add the blank lines from the directive block
        }
        continue;
      }
      consecutiveBlanks = 0;

      // If line looks like a key-value pair or bullet, keep skipping
      const cleaned = trimmed.replace(/^[-•*]\s*/, '');
      if (/^\w+:\s*.+$/.test(cleaned)) {
        continue;
      }

      // If it's a new directive tag, let the top of the loop handle it
      if (DIRECTIVE_TAG_PATTERN.test(trimmed)) {
        // Re-check on next iteration
        skipping = false;
        i--;
        continue;
      }

      // Non-key-value line — end of directive block, keep this line
      skipping = false;
      output.push(lines[i]);
      continue;
    }

    output.push(lines[i]);
  }

  // Clean up excessive blank lines left behind
  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
