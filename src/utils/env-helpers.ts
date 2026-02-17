/** Patterns that indicate a placeholder value (not a real credential) */
export const PLACEHOLDER_PATTERNS = [
  /^your[-_]/i,
  /^YOUR[-_]/,
  /placeholder/i,
  /\btodo\b/i,
  /^change[-_]me/i,
  /^xxx/i,
  /^replace[-_]/i,
  /^https?:\/\/your[-_]/i,
  /^\s*$/,
];

export function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

export function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

export async function writeEnvFile(
  projectPath: string,
  newVars: Record<string, string>,
): Promise<void> {
  const envPath = `${projectPath}/.env.local`;
  let existing: string | null = null;
  try {
    existing = await window.api.fs.readFile(envPath);
  } catch {
    // File doesn't exist
  }

  if (!existing) {
    const lines = Object.entries(newVars).map(([key, value]) => `${key}=${value}`);
    await window.api.fs.writeFile(envPath, lines.join('\n') + '\n');
    return;
  }

  const usedKeys = new Set<string>();
  const outputLines: string[] = [];

  for (const line of existing.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      outputLines.push(line);
      continue;
    }
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      outputLines.push(line);
      continue;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    if (key in newVars) {
      outputLines.push(`${key}=${newVars[key]}`);
      usedKeys.add(key);
    } else {
      outputLines.push(line);
    }
  }

  for (const [key, value] of Object.entries(newVars)) {
    if (!usedKeys.has(key)) {
      outputLines.push(`${key}=${value}`);
    }
  }

  await window.api.fs.writeFile(envPath, outputLines.join('\n') + '\n');
}
