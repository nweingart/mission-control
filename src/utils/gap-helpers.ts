import { extractJsonObject } from './build-helpers';

// Re-export for consumers that previously got extractJsonObject from this module
export { extractJsonObject } from './build-helpers';

export function buildGapAnalysisPrompt(prd: string): string {
  return `You are a senior QA engineer. Compare this codebase against the PRD below and grade how completely the PRD requirements have been implemented.

## PRD
${prd}

## Instructions
1. Read the codebase thoroughly
2. Compare every requirement in the PRD against what's actually implemented
3. Grade from 0-100 how complete the implementation is
4. List specific gaps as findings

Respond with ONLY valid JSON in this exact format:
{
  "grade": <number 0-100>,
  "summary": "<2-3 sentence summary of coverage>",
  "findings": [
    {
      "category": "<feature area>",
      "description": "<what's missing or incomplete>",
      "prdSection": "<which PRD section this relates to>",
      "severity": "missing" | "incomplete" | "deviation",
      "resolved": false
    }
  ],
  "remainingItems": ["<brief description of each remaining item>"]
}`;
}

export function buildGapMetaReviewPrompt(prd: string, analysisJson: string): string {
  return `You are a principal engineer reviewing a gap analysis. The analysis below was performed by comparing a codebase against a PRD. Your job is to validate the findings — remove false positives, adjust severity, and provide a validated grade.

## PRD
${prd}

## Initial Analysis
${analysisJson}

## Instructions
1. Review each finding — is it a real gap or a false positive?
2. Check if the grade seems fair given the actual findings
3. Adjust the grade and findings as needed

Respond with ONLY valid JSON in this exact format:
{
  "validatedGrade": <number 0-100>,
  "summary": "<2-3 sentence validated summary>",
  "adjustedFindings": [
    {
      "category": "<feature area>",
      "description": "<validated description>",
      "prdSection": "<PRD section>",
      "severity": "missing" | "incomplete" | "deviation",
      "resolved": false
    }
  ],
  "remainingItems": ["<brief description of each validated remaining item>"]
}`;
}

export function buildGapFixPrompt(findings: Array<{ severity: string; category: string; description: string; prdSection?: string; resolved: boolean }>): string {
  const items = findings
    .filter(f => !f.resolved)
    .map(f => `- [${f.severity}] ${f.category}: ${f.description}${f.prdSection ? ` (PRD: ${f.prdSection})` : ''}`)
    .join('\n');

  return `The following gaps were identified between the codebase and the PRD. Fix each one directly in the codebase:

${items}

Fix each issue completely. Do not create unnecessary files. Focus on implementing the missing or incomplete features.`;
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function detectPRDSections(prd: string): string[] {
  const sections: string[] = [];
  const sectionPatterns = [
    { pattern: /##?\s*\d*\.?\s*overview/i, name: 'Overview' },
    { pattern: /##?\s*\d*\.?\s*user\s*stories/i, name: 'User Stories' },
    { pattern: /##?\s*\d*\.?\s*feature/i, name: 'Features' },
    { pattern: /##?\s*\d*\.?\s*data\s*model/i, name: 'Data Model' },
    { pattern: /##?\s*\d*\.?\s*api/i, name: 'API Endpoints' },
    { pattern: /##?\s*\d*\.?\s*tech\s*stack/i, name: 'Tech Stack' },
    { pattern: /##?\s*\d*\.?\s*mvp/i, name: 'MVP Scope' },
  ];
  for (const { pattern, name } of sectionPatterns) {
    if (pattern.test(prd)) sections.push(name);
  }
  return sections;
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}
