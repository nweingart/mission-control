import type { Task, ReviewFinding, ReviewArtifact } from '../types';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Extract the first balanced JSON object from a string.
 * Handles nested braces and string escaping.
 */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parse Claude review response into ReviewArtifact.
 */
export function parseReviewResponse(
  response: string,
  task: Task,
  branchName: string,
  diffStat: string
): ReviewArtifact {
  try {
    const jsonStr = extractJsonObject(response);
    if (jsonStr && jsonStr.includes('"findings"')) {
      const parsed = JSON.parse(jsonStr);
      const findings: ReviewFinding[] = (parsed.findings || []).map(
        (f: { severity?: string; category?: string; description?: string; file?: string }) => ({
          severity: f.severity || 'info',
          category: f.category || 'general',
          description: f.description || '',
          file: f.file,
          fixed: false,
        })
      );
      return {
        taskId: task.id,
        taskTitle: task.title,
        branchName,
        findings,
        summary: parsed.summary || 'Review complete.',
        autoFixApplied: false,
        canAutoFix: parsed.canAutoFix ?? true,
        diffStat,
        timestamp: new Date().toISOString(),
      };
    }
  } catch {
    // JSON parse failed
  }

  // Fallback: treat entire response as summary
  return {
    taskId: task.id,
    taskTitle: task.title,
    branchName,
    findings: [
      {
        severity: 'info',
        category: 'general',
        description: response.slice(0, 500),
        fixed: false,
      },
    ],
    summary: response.slice(0, 300),
    autoFixApplied: false,
    canAutoFix: false,
    diffStat,
    timestamp: new Date().toISOString(),
  };
}

export function hasFixableIssues(artifact: ReviewArtifact): boolean {
  return artifact.findings.some(
    (f) => (f.severity === 'critical' || f.severity === 'warning') && !f.fixed
  );
}

export function hasCriticalUnfixable(artifact: ReviewArtifact): boolean {
  return artifact.findings.some((f) => f.severity === 'critical' && !f.fixed);
}

/**
 * Build the review prompt for Claude code review.
 */
export function buildReviewPrompt(task: Task, diff: string): string {
  const truncatedDiff = diff.slice(0, 50000);
  return `You are a senior code reviewer. Review this diff for task "${task.title}".

Focus on: security vulnerabilities, bugs, performance, best practices.

Return JSON:
{
  "findings": [{ "severity": "critical"|"warning"|"info", "category": "security"|"performance"|"best-practice"|"bug", "description": "...", "file": "..." }],
  "summary": "...",
  "canAutoFix": true|false
}

Diff:
\`\`\`diff
${truncatedDiff}
\`\`\``;
}

/**
 * Build the fix prompt from review findings.
 */
export function buildFixPrompt(artifact: ReviewArtifact): string {
  const issues = artifact.findings
    .filter((f) => (f.severity === 'critical' || f.severity === 'warning') && !f.fixed)
    .map((f) => `- [${f.severity}] ${f.category}: ${f.description}${f.file ? ` (${f.file})` : ''}`)
    .join('\n');

  return `Fix these issues in the codebase:\n${issues}\n\nFix each directly. Do not create unnecessary files.`;
}
