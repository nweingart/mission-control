/**
 * Shared AppleScript escaping utility.
 *
 * AppleScript string literals are delimited by double-quotes. To safely embed
 * user-supplied text we must:
 *  1. Escape backslashes (\ → \\) so they are treated literally.
 *  2. Escape double-quotes (" → \") so they don't terminate the string.
 *  3. Strip control characters (newlines, tabs, etc.) that could break out of
 *     the string context or alter script semantics.
 *  4. Enforce a length limit to prevent unbounded command injection payloads.
 */

const MAX_APPLESCRIPT_STRING_LENGTH = 8192;

export function escapeForAppleScript(input: string): string {
  if (typeof input !== 'string') {
    throw new Error('escapeForAppleScript: input must be a string');
  }

  if (input.length > MAX_APPLESCRIPT_STRING_LENGTH) {
    throw new Error(
      `escapeForAppleScript: input exceeds ${MAX_APPLESCRIPT_STRING_LENGTH} character limit`
    );
  }

  return input
    // 1. Escape backslashes first (before we introduce new ones)
    .replace(/\\/g, '\\\\')
    // 2. Escape double-quotes
    .replace(/"/g, '\\"')
    // 3. Strip control characters (U+0000–U+001F and U+007F)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '');
}
