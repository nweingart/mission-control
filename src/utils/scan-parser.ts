import type { FeatureModule, CodeIssue, ScanDiff, TechStack } from '../types';
import { extractJsonObject } from './build-helpers';

export interface FeatureIdea {
  title: string;
  description: string;
  rationale: string;
}

export interface ScanResults {
  masterPrd: string;
  features: FeatureModule[];
  issues: CodeIssue[];
  featureIdeas: FeatureIdea[];
  techStack: TechStack;
  fileCount: number;
  summary: string;
}

export interface Phase1ScanResults {
  issues: CodeIssue[];
  techStack: TechStack;
  fileCount: number;
  summary: string;
}

export interface Phase2ScanResults {
  masterPrd: string;
  features: FeatureModule[];
  featureIdeas: FeatureIdea[];
}

export const buildScanPrompt = () => {
  return `You are analyzing an existing codebase. Your job is to produce a comprehensive scan of this project.

Analyze the codebase thoroughly and return a JSON response with this exact structure:

{
  "masterPrd": "A comprehensive PRD (Product Requirements Document) for this project. Write it in markdown. Include: project overview, core functionality, architecture, key user flows, and technical decisions. Be thorough — this is the living documentation for the project.",
  "techStack": {
    "languages": ["list", "of", "languages"],
    "frameworks": ["list", "of", "frameworks"],
    "buildTools": ["list", "of", "build tools"],
    "summary": "One-line summary like 'Next.js app with PostgreSQL, deployed on Vercel'"
  },
  "features": [
    {
      "name": "Feature Name",
      "description": "What this feature does",
      "prd": "Detailed PRD for this specific feature in markdown. Include: purpose, user flow, implementation details, key files.",
      "files": ["src/relevant/file.ts", "src/other/file.ts"]
    }
  ],
  "issues": [
    {
      "title": "Short title",
      "description": "What the issue is and why it matters",
      "severity": "critical|warning|info",
      "category": "bug|security|performance|dead_code",
      "estimatedEffort": "quick_fix|moderate|significant",
      "file": "src/file-with-issue.ts"
    }
  ],
  "featureIdeas": [
    {
      "title": "Short feature name",
      "description": "What this feature would do and how it complements the existing app",
      "rationale": "Why this would be valuable — what gap it fills or what user need it addresses"
    }
  ],
  "fileCount": 123,
  "summary": "Brief summary of what was found — e.g. '12 features detected, 3 critical issues, Next.js + TypeScript stack'"
}

IMPORTANT:
- Be thorough in feature detection — identify all major features/modules
- For each feature, list the KEY files involved (not every file, just the important ones)
- For issues, focus on real problems: actual bugs, security concerns, dead code, performance issues
- Do NOT flag style preferences or subjective opinions as issues
- The masterPrd should be comprehensive enough to onboard a new developer
- For featureIdeas, suggest 3-5 NEW features that would complement the existing app. Think about what's missing, what users would want next, and what would make the product more complete. These should be features that DON'T already exist in the codebase.
- Return ONLY valid JSON, no markdown fences or explanation outside the JSON`;
};

export function parseScanResponse(response: string) {
  // Try to extract JSON from the response
  let json: Record<string, unknown>;
  try {
    // Try direct parse first
    json = JSON.parse(response);
  } catch {
    // Try to extract JSON using balanced brace matching
    const jsonStr = extractJsonObject(response);
    if (!jsonStr) {
      throw new Error('Scan did not return valid JSON. Please retry.');
    }
    json = JSON.parse(jsonStr);
  }

  const now = new Date().toISOString();

  const features = ((json.features as Array<Record<string, unknown>>) || []).map((f, i) => {
    const name = String(f.name || `Feature ${i + 1}`);
    const files = (f.files as string[]) || [];
    const fingerprint = generateFingerprint(name, files);
    return {
      id: `feat-${Date.now()}-${i}`,
      fingerprint,
      name,
      description: String(f.description || ''),
      prd: String(f.prd || ''),
      files,
      status: 'documented' as const,
      createdAt: now,
      lastUpdated: now,
    };
  });

  const issues = ((json.issues as Array<Record<string, unknown>>) || []).map((issue, i) => {
    const category = String(issue.category || 'bug') as 'bug' | 'security' | 'performance' | 'dead_code';
    const file = issue.file ? String(issue.file) : undefined;
    const description = String(issue.description || '');
    const fingerprint = generateIssueFingerprint(category, file, description);
    return {
      id: `issue-${Date.now()}-${i}`,
      fingerprint,
      title: String(issue.title || `Issue ${i + 1}`),
      description,
      severity: (issue.severity || 'info') as 'critical' | 'warning' | 'info',
      category,
      estimatedEffort: (issue.estimatedEffort || 'moderate') as 'quick_fix' | 'moderate' | 'significant',
      file,
      status: 'open' as const,
      firstSeen: now,
      lastSeen: now,
    };
  });

  const rawTs = json.techStack as Record<string, unknown> | undefined;
  const techStack: TechStack = {
    languages: Array.isArray(rawTs?.languages) ? (rawTs.languages as string[]) : [],
    frameworks: Array.isArray(rawTs?.frameworks) ? (rawTs.frameworks as string[]) : [],
    buildTools: Array.isArray(rawTs?.buildTools) ? (rawTs.buildTools as string[]) : [],
    summary: String(rawTs?.summary || 'Unknown stack'),
  };

  const featureIdeas: FeatureIdea[] = ((json.featureIdeas as Array<Record<string, unknown>>) || []).map(idea => ({
    title: String(idea.title || ''),
    description: String(idea.description || ''),
    rationale: String(idea.rationale || ''),
  }));

  return {
    masterPrd: String(json.masterPrd || ''),
    techStack,
    features,
    issues,
    featureIdeas,
    fileCount: Number(json.fileCount) || 0,
    summary: String(json.summary || 'Scan complete'),
  };
}

// ── Phase 1: Issues-only scan (fast) ─────────────────────────

export const buildIssuesScanPrompt = () => {
  return `You are analyzing an existing codebase. Your job is to identify issues and characterize the tech stack. Do NOT generate a PRD, features list, or feature ideas — those will be generated separately.

Analyze the codebase and return a JSON response with this exact structure:

{
  "issues": [
    {
      "title": "Short title",
      "description": "What the issue is and why it matters",
      "severity": "critical|warning|info",
      "category": "bug|security|performance|dead_code",
      "estimatedEffort": "quick_fix|moderate|significant",
      "file": "src/file-with-issue.ts"
    }
  ],
  "techStack": {
    "languages": ["list", "of", "languages"],
    "frameworks": ["list", "of", "frameworks"],
    "buildTools": ["list", "of", "build tools"],
    "summary": "One-line summary like 'Next.js app with PostgreSQL, deployed on Vercel'"
  },
  "fileCount": 123,
  "summary": "Brief summary of what was found — e.g. '3 critical issues, Next.js + TypeScript stack'"
}

IMPORTANT:
- For issues, focus on real problems: actual bugs, security concerns, dead code, performance issues
- Do NOT flag style preferences or subjective opinions as issues
- Do NOT include masterPrd, features, or featureIdeas — only issues, techStack, fileCount, and summary
- Return ONLY valid JSON, no markdown fences or explanation outside the JSON`;
};

// ── Phase 2: PRD + features (background) ─────────────────────

export const buildPrdScanPrompt = (techStackSummary: string, issuesSummary: string) => {
  return `You are analyzing an existing codebase. The tech stack has already been identified as: ${techStackSummary}. Issues found: ${issuesSummary}.

Your job is to produce comprehensive documentation. Do NOT re-analyze issues — focus only on PRD, features, and feature ideas.

Return a JSON response with this exact structure:

{
  "masterPrd": "A comprehensive PRD (Product Requirements Document) for this project. Write it in markdown. Include: project overview, core functionality, architecture, key user flows, and technical decisions. Be thorough — this is the living documentation for the project.",
  "features": [
    {
      "name": "Feature Name",
      "description": "What this feature does",
      "prd": "Detailed PRD for this specific feature in markdown. Include: purpose, user flow, implementation details, key files.",
      "files": ["src/relevant/file.ts", "src/other/file.ts"]
    }
  ],
  "featureIdeas": [
    {
      "title": "Short feature name",
      "description": "What this feature would do and how it complements the existing app",
      "rationale": "Why this would be valuable — what gap it fills or what user need it addresses"
    }
  ]
}

IMPORTANT:
- Be thorough in feature detection — identify all major features/modules
- For each feature, list the KEY files involved (not every file, just the important ones)
- The masterPrd should be comprehensive enough to onboard a new developer
- For featureIdeas, suggest 3-5 NEW features that would complement the existing app
- Do NOT include issues, techStack, fileCount, or summary — those are already captured
- Return ONLY valid JSON, no markdown fences or explanation outside the JSON`;
};

export function parseIssuesScanResponse(response: string): Phase1ScanResults {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(response);
  } catch {
    const jsonStr = extractJsonObject(response);
    if (!jsonStr) {
      throw new Error('Phase 1 scan did not return valid JSON. Please retry.');
    }
    json = JSON.parse(jsonStr);
  }

  const now = new Date().toISOString();

  const issues = ((json.issues as Array<Record<string, unknown>>) || []).map((issue, i) => {
    const category = String(issue.category || 'bug') as 'bug' | 'security' | 'performance' | 'dead_code';
    const file = issue.file ? String(issue.file) : undefined;
    const description = String(issue.description || '');
    const fingerprint = generateIssueFingerprint(category, file, description);
    return {
      id: `issue-${Date.now()}-${i}`,
      fingerprint,
      title: String(issue.title || `Issue ${i + 1}`),
      description,
      severity: (issue.severity || 'info') as 'critical' | 'warning' | 'info',
      category,
      estimatedEffort: (issue.estimatedEffort || 'moderate') as 'quick_fix' | 'moderate' | 'significant',
      file,
      status: 'open' as const,
      firstSeen: now,
      lastSeen: now,
    };
  });

  const rawTs = json.techStack as Record<string, unknown> | undefined;
  const techStack: TechStack = {
    languages: Array.isArray(rawTs?.languages) ? (rawTs.languages as string[]) : [],
    frameworks: Array.isArray(rawTs?.frameworks) ? (rawTs.frameworks as string[]) : [],
    buildTools: Array.isArray(rawTs?.buildTools) ? (rawTs.buildTools as string[]) : [],
    summary: String(rawTs?.summary || 'Unknown stack'),
  };

  return {
    issues,
    techStack,
    fileCount: Number(json.fileCount) || 0,
    summary: String(json.summary || 'Scan complete'),
  };
}

export function parsePrdScanResponse(response: string): Phase2ScanResults {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(response);
  } catch {
    const jsonStr = extractJsonObject(response);
    if (!jsonStr) {
      throw new Error('Phase 2 scan did not return valid JSON. Please retry.');
    }
    json = JSON.parse(jsonStr);
  }

  const now = new Date().toISOString();

  const features = ((json.features as Array<Record<string, unknown>>) || []).map((f, i) => {
    const name = String(f.name || `Feature ${i + 1}`);
    const files = (f.files as string[]) || [];
    const fingerprint = generateFingerprint(name, files);
    return {
      id: `feat-${Date.now()}-${i}`,
      fingerprint,
      name,
      description: String(f.description || ''),
      prd: String(f.prd || ''),
      files,
      status: 'documented' as const,
      createdAt: now,
      lastUpdated: now,
    };
  });

  const featureIdeas: FeatureIdea[] = ((json.featureIdeas as Array<Record<string, unknown>>) || []).map(idea => ({
    title: String(idea.title || ''),
    description: String(idea.description || ''),
    rationale: String(idea.rationale || ''),
  }));

  return {
    masterPrd: String(json.masterPrd || ''),
    features,
    featureIdeas,
  };
}

/** Merge new scan results with existing data, preserving user edits and computing diff */
export function mergeWithExisting(
  newFeatures: FeatureModule[],
  newIssues: CodeIssue[],
  existingFeatures: FeatureModule[],
  existingIssues: CodeIssue[],
) {
  const now = new Date().toISOString();
  const existingFeatureMap = new Map(existingFeatures.map(f => [f.fingerprint, f]));
  const existingIssueMap = new Map(existingIssues.map(i => [i.fingerprint, i]));
  const newFeatureFingerprints = new Set(newFeatures.map(f => f.fingerprint));
  const newIssueFingerprints = new Set(newIssues.map(i => i.fingerprint));

  // Diff tracking — store fingerprints for stable identity
  const diffNewFeatures: string[] = [];
  const diffRemovedFeatures: string[] = [];
  const diffUpdatedFeatures: string[] = [];
  const diffNewIssues: string[] = [];
  const diffIssuesFixed: string[] = [];
  // Display name map: fingerprint → human-readable name/title
  const nameMap: Record<string, string> = {};

  // Merge features
  const mergedFeatures: FeatureModule[] = newFeatures.map(newFeat => {
    const existing = existingFeatureMap.get(newFeat.fingerprint);
    nameMap[newFeat.fingerprint] = newFeat.name;
    if (existing) {
      // Feature existed before — preserve user-edited PRDs
      if (existing.prdEditedByUser) {
        diffUpdatedFeatures.push(newFeat.fingerprint);
        return {
          ...existing,
          // Update metadata but keep the user's PRD; store new PRD as proposal
          description: newFeat.description,
          files: newFeat.files,
          proposedPrd: newFeat.prd !== existing.prd ? newFeat.prd : undefined,
          lastUpdated: now,
        };
      }
      // Not user-edited — update everything
      diffUpdatedFeatures.push(newFeat.fingerprint);
      return {
        ...existing,
        description: newFeat.description,
        prd: newFeat.prd,
        files: newFeat.files,
        status: 'documented' as const,
        lastUpdated: now,
      };
    }
    // New feature
    diffNewFeatures.push(newFeat.fingerprint);
    return newFeat;
  });

  // Check for removed features (existed before but not in new scan)
  for (const existing of existingFeatures) {
    if (!newFeatureFingerprints.has(existing.fingerprint)) {
      nameMap[existing.fingerprint] = existing.name;
      diffRemovedFeatures.push(existing.fingerprint);
      // Mark as outdated but keep in the list
      mergedFeatures.push({ ...existing, status: 'outdated', lastUpdated: now });
    }
  }

  // Merge issues
  const mergedIssues: CodeIssue[] = newIssues.map(newIssue => {
    const existing = existingIssueMap.get(newIssue.fingerprint);
    nameMap[newIssue.fingerprint] = newIssue.title;
    if (existing) {
      // Issue still exists — update lastSeen, preserve status/backlog associations
      return {
        ...existing,
        lastSeen: now,
        // Update fields that might change
        severity: newIssue.severity,
        estimatedEffort: newIssue.estimatedEffort,
      };
    }
    // New issue
    diffNewIssues.push(newIssue.fingerprint);
    return newIssue;
  });

  // Issues that disappeared — mark as fixed (unless already planned/have backlog items)
  for (const existing of existingIssues) {
    if (!newIssueFingerprints.has(existing.fingerprint)) {
      nameMap[existing.fingerprint] = existing.title;
      if (existing.status === 'open') {
        diffIssuesFixed.push(existing.fingerprint);
        mergedIssues.push({ ...existing, status: 'fixed', lastSeen: now });
      } else {
        // Keep planned/fixed issues as-is
        mergedIssues.push(existing);
      }
    }
  }

  // Build summary
  const parts: string[] = [];
  if (diffNewFeatures.length > 0) parts.push(`${diffNewFeatures.length} new feature${diffNewFeatures.length > 1 ? 's' : ''}`);
  if (diffRemovedFeatures.length > 0) parts.push(`${diffRemovedFeatures.length} removed`);
  if (diffUpdatedFeatures.length > 0) parts.push(`${diffUpdatedFeatures.length} updated`);
  if (diffNewIssues.length > 0) parts.push(`${diffNewIssues.length} new issue${diffNewIssues.length > 1 ? 's' : ''}`);
  if (diffIssuesFixed.length > 0) parts.push(`${diffIssuesFixed.length} issue${diffIssuesFixed.length > 1 ? 's' : ''} fixed`);

  const diff: ScanDiff = {
    newFeatures: diffNewFeatures,
    removedFeatures: diffRemovedFeatures,
    updatedFeatures: diffUpdatedFeatures,
    newIssues: diffNewIssues,
    issuesFixed: diffIssuesFixed,
    summary: parts.length > 0 ? parts.join(', ') : 'No changes detected',
  };

  return { features: mergedFeatures, issues: mergedIssues, diff, nameMap };
}

// ── Streaming Discovery Types & Parsers ──────────────────────

export interface ParsedDiscovery {
  type: 'issue' | 'techStack' | 'feature' | 'featureIdea';
  data: Record<string, unknown>;
  index: number;
  timestamp: string;
}

export interface ScanMeta {
  fileCount: number;
  summary: string;
  masterPrd?: string;
}

// ── Streaming Prompts ────────────────────────────────────────

export const buildStreamingIssuesScanPrompt = () => {
  return `You are analyzing an existing codebase for issues, bugs, and tech stack characterization.

As you examine the code, emit each discovery IMMEDIATELY when found using these tags:

<DISCOVERY type="issue">
{"title":"Short title","description":"What the issue is and why it matters","severity":"critical|warning|info","category":"bug|security|performance|dead_code","estimatedEffort":"quick_fix|moderate|significant","file":"src/file-with-issue.ts"}
</DISCOVERY>

When you identify the tech stack:
<DISCOVERY type="techStack">
{"languages":["list","of","languages"],"frameworks":["list","of","frameworks"],"buildTools":["list","of","build tools"],"summary":"One-line summary like 'Next.js app with PostgreSQL, deployed on Vercel'"}
</DISCOVERY>

When finished analyzing everything:
<SCAN_COMPLETE>
{"fileCount":123,"summary":"Brief summary of what was found"}
</SCAN_COMPLETE>

RULES:
- Emit each <DISCOVERY> as SOON as you find it. Do NOT batch them.
- Between discoveries, briefly narrate what you're doing (e.g. "Checking the authentication module..." or "Analyzing database queries...")
- Each JSON inside tags must be valid JSON on a single line
- Focus on real problems: actual bugs, security concerns, dead code, performance issues
- Do NOT flag style preferences or subjective opinions as issues
- Do NOT include a PRD, features list, or feature ideas — only issues and techStack
- Return ONLY discoveries and narration, no markdown fences or JSON blobs outside the tags`;
};

export const buildStreamingPrdScanPrompt = (techStackSummary: string, issuesSummary: string) => {
  return `You are analyzing an existing codebase. The tech stack has already been identified as: ${techStackSummary}. Issues found: ${issuesSummary}.

Your job is to produce comprehensive documentation. Do NOT re-analyze issues — focus only on features and documentation.

As you examine the code, emit each discovery IMMEDIATELY when found:

<DISCOVERY type="feature">
{"name":"Feature Name","description":"What this feature does","prd":"Detailed PRD for this specific feature in markdown.","files":["src/relevant/file.ts"]}
</DISCOVERY>

<DISCOVERY type="featureIdea">
{"title":"Short feature name","description":"What this feature would do","rationale":"Why this would be valuable"}
</DISCOVERY>

When finished:
<SCAN_COMPLETE>
{"masterPrd":"A comprehensive PRD in markdown. Include: project overview, core functionality, architecture, key user flows, and technical decisions."}
</SCAN_COMPLETE>

RULES:
- Emit each <DISCOVERY> as SOON as you find it. Do NOT batch them.
- Between discoveries, briefly narrate what you're doing
- Each JSON inside tags must be valid JSON on a single line
- Be thorough in feature detection — identify all major features/modules
- For each feature, list the KEY files involved (not every file, just the important ones)
- For featureIdeas, suggest 3-5 NEW features that would complement the existing app
- Do NOT include issues or techStack — those are already captured`;
};

// ── Tag Parsers ──────────────────────────────────────────────

export function parseDiscoveryTag(tagContent: string): { type: string; data: Record<string, unknown> } | null {
  // tagContent is the full match like: <DISCOVERY type="issue">{"title":"..."}</DISCOVERY>
  const typeMatch = tagContent.match(/<DISCOVERY\s+type="([^"]+)">/);
  if (!typeMatch) return null;
  const type = typeMatch[1];

  // Extract JSON between the opening and closing tags
  const jsonMatch = tagContent.match(/<DISCOVERY[^>]*>([\s\S]*?)<\/DISCOVERY>/);
  if (!jsonMatch) return null;

  try {
    const data = JSON.parse(jsonMatch[1].trim());
    return { type, data };
  } catch (err) {
    console.warn(`[scan-parser] Failed to parse <DISCOVERY type="${type}"> JSON:`, err, jsonMatch[1].slice(0, 200));
    return null;
  }
}

export function parseScanCompleteTag(tagContent: string): ScanMeta | null {
  const jsonMatch = tagContent.match(/<SCAN_COMPLETE>([\s\S]*?)<\/SCAN_COMPLETE>/);
  if (!jsonMatch) return null;

  try {
    const data = JSON.parse(jsonMatch[1].trim());
    return {
      fileCount: Number(data.fileCount) || 0,
      summary: String(data.summary || 'Scan complete'),
      masterPrd: data.masterPrd ? String(data.masterPrd) : undefined,
    };
  } catch (err) {
    console.warn('[scan-parser] Failed to parse <SCAN_COMPLETE> JSON:', err);
    return null;
  }
}

const VALID_SEVERITIES = new Set(['critical', 'warning', 'info']);
const VALID_CATEGORIES = new Set(['bug', 'security', 'performance', 'dead_code']);
const VALID_EFFORTS = new Set(['quick_fix', 'moderate', 'significant']);

export function discoveryToCodeIssue(data: Record<string, unknown>, index: number): CodeIssue {
  const now = new Date().toISOString();
  const rawCategory = String(data.category || 'bug');
  const category = (VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'bug') as CodeIssue['category'];
  const rawSeverity = String(data.severity || 'info');
  const severity = (VALID_SEVERITIES.has(rawSeverity) ? rawSeverity : 'info') as CodeIssue['severity'];
  const rawEffort = String(data.estimatedEffort || 'moderate');
  const estimatedEffort = (VALID_EFFORTS.has(rawEffort) ? rawEffort : 'moderate') as CodeIssue['estimatedEffort'];
  const file = data.file ? String(data.file) : undefined;
  const description = String(data.description || '');
  const fingerprint = generateIssueFingerprint(category, file, description);

  return {
    id: `issue-${Date.now()}-${index}`,
    fingerprint,
    title: String(data.title || `Issue ${index + 1}`),
    description,
    severity,
    category,
    estimatedEffort,
    file,
    status: 'open' as const,
    firstSeen: now,
    lastSeen: now,
  };
}

export function discoveryToFeature(data: Record<string, unknown>, index: number): FeatureModule {
  const now = new Date().toISOString();
  const name = String(data.name || `Feature ${index + 1}`);
  const files = (data.files as string[]) || [];
  const fingerprint = generateFingerprint(name, files);

  return {
    id: `feat-${Date.now()}-${index}`,
    fingerprint,
    name,
    description: String(data.description || ''),
    prd: String(data.prd || ''),
    files,
    status: 'documented' as const,
    createdAt: now,
    lastUpdated: now,
  };
}

// Fingerprint generation utilities
export function generateFingerprint(name: string, files: string[]): string {
  const normalized = name.toLowerCase().trim();
  const sortedFiles = [...files].sort().join('|');
  return simpleHash(`${normalized}::${sortedFiles}`);
}

export function generateIssueFingerprint(category: string, file: string | undefined, description: string): string {
  const normalized = description.toLowerCase().trim().slice(0, 100);
  return simpleHash(`${category}::${file || ''}::${normalized}`);
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
