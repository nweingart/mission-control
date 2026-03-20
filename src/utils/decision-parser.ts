import type { DecisionRequest } from '../types';

/**
 * Parse a <DECISION> XML tag from Claude's streaming output.
 * Returns a DecisionRequest if a complete tag is found, null otherwise.
 *
 * Expected format:
 * <DECISION>
 *   <question>...</question>
 *   <context>...</context>
 *   <options>
 *     <option>...</option>
 *     <option>...</option>
 *   </options>
 * </DECISION>
 *
 * The <options> block is optional.
 */
export function parseDecisionTag(text: string): DecisionRequest | null {
  const match = text.match(/<DECISION>([\s\S]*?)<\/DECISION>/);
  if (!match) return null;

  const inner = match[1];

  const questionMatch = inner.match(/<question>([\s\S]*?)<\/question>/);
  const contextMatch = inner.match(/<context>([\s\S]*?)<\/context>/);

  if (!questionMatch) return null;

  const question = questionMatch[1].trim();
  const context = contextMatch ? contextMatch[1].trim() : '';

  let options: string[] | undefined;
  const optionsMatch = inner.match(/<options>([\s\S]*?)<\/options>/);
  if (optionsMatch) {
    const optionMatches = optionsMatch[1].matchAll(/<option>([\s\S]*?)<\/option>/g);
    options = [...optionMatches].map((m) => m[1].trim()).filter(Boolean);
    if (options.length === 0) options = undefined;
  }

  return {
    id: `decision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    question,
    context,
    options,
    timestamp: Date.now(),
  };
}

/**
 * Check if a text buffer contains a complete <DECISION> tag.
 */
export function hasCompleteDecisionTag(text: string): boolean {
  return /<DECISION>[\s\S]*?<\/DECISION>/.test(text);
}

/**
 * Check if a text buffer contains an opening <DECISION> tag without a closing one.
 * This means we should keep buffering until the tag is complete.
 */
export function hasPartialDecisionTag(text: string): boolean {
  return text.includes('<DECISION>') && !text.includes('</DECISION>');
}

/**
 * Strip <DECISION> tags from text (for display purposes).
 */
export function stripDecisionTags(text: string): string {
  return text.replace(/<DECISION>[\s\S]*?<\/DECISION>/g, '').trim();
}
