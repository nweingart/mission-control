import type { BacklogItem, InteractionDepth } from '../types';

/**
 * Auto-classify interaction depth based on backlog item signals.
 * Can be overridden manually via item.interactionDepth.
 */
export function classifyInteractionDepth(item: BacklogItem): InteractionDepth {
  // Bug fixes and quick fixes are small
  if (item.type === 'bug_fix' || item.estimatedEffort === 'quick_fix') {
    return 'small';
  }

  // Low story points = small
  if (item.storyPoints != null && item.storyPoints <= 2) {
    return 'small';
  }

  // New features or high story points = large
  if (item.type === 'new_feature') {
    return 'large';
  }
  if (item.storyPoints != null && item.storyPoints >= 5) {
    return 'large';
  }

  // Significant effort = large
  if (item.estimatedEffort === 'significant') {
    return 'large';
  }

  // Everything else = medium (the default)
  return 'medium';
}
