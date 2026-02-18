# Houston V2: Existing Repo Workspace

## Overview

Houston pivots from "build an app from an idea" to "import an existing repo, understand it, and help you improve it." The app becomes a daily productivity tool for developers — living documentation, automated bug detection, feature planning, and AI-powered builds.

**Core flow**: Import repo → Scan codebase → Living docs + feature map + bug detection → Plan features → Build → Review

---

## Why

The inception flow (idea → PRD → scaffold) is a one-time event. Once you've built the app, you never go back. Daily utility is zero.

"Import repo → understand codebase → find bugs → plan features → build them → review code" is a **daily workflow**. That's where retention lives.

---

## Mental Model Shift

**V1**: A project is a **linear pipeline**. It has a status that moves forward and never goes back.

**V2**: A project is a **workspace** anchored to a repo. You import it, scan it, and then it's "active" — you dip into different modes (docs, planning, building, reviewing) whenever you want. There is no linear progression.

---

## Data Model

### Project (reworked)

```ts
interface Project {
  slug: string;
  name: string;
  createdAt: string;
  projectPath: string;
  githubRepo: string;             // Required — it's the entry point

  // Scan state
  scanStatus: 'pending' | 'scanning' | 'complete' | 'failed';
  lastScannedAt?: string;
  scanError?: string;             // Error message when scanStatus is 'failed'
  lastScanDiff?: ScanDiff;        // Result of most recent re-scan comparison

  // Living docs
  // Master PRD stored via getPRD/savePRD (existing storage method) — NOT duplicated here
  techStack?: TechStack;

  // Carried forward from v1
  envVars?: Record<string, string>;
  hasBuiltOnce?: boolean;
}
```

Key changes from v1:
- `githubRepo` is **required** (not optional) — the repo URL is how you enter
- `status: ProjectStatus` linear progression is **gone** — replaced by `scanStatus` which is the only state machine, and only for the initial scan
- `idea`, `designPreferences`, `humanTasks` are **removed**
- `masterPrd` is **not on the Project type** — it lives in the existing `getPRD/savePRD` storage (single source of truth)
- `scanStatus` includes `'failed'` with `scanError` for retry UX
- Once `scanStatus` is `complete`, the project is a hub — no forward/backward status

### TechStack

```ts
interface TechStack {
  languages: string[];
  frameworks: string[];
  buildTools: string[];
  summary: string;                // "Next.js app with PostgreSQL, deployed on Vercel"
}
```

### FeatureModule

Represents a discrete feature/module discovered in the codebase. The PRD is auto-generated during scan, then editable by the user. New features built through Houston also get their PRDs stored here.

```ts
interface FeatureModule {
  id: string;
  fingerprint: string;            // Stable identity across scans (hash of name + primary file paths)
  name: string;                   // "User Authentication"
  description: string;
  prd: string;                    // Auto-generated, user can edit
  prdEditedByUser?: boolean;      // Flag so re-scan warns before overwriting
  files: string[];                // Key files involved
  status: 'documented' | 'outdated';  // 'outdated' if files changed since last scan
  createdAt: string;
  lastUpdated: string;
}
```

**Fingerprinting**: The `fingerprint` is a deterministic hash of the feature's name (lowercased, normalized) + its primary file paths (sorted). This allows stable identity across scans — the agent generates features, we compute fingerprints, and diffs match by fingerprint, not by `id`. The `id` is a UUID for internal references (backlog links, etc.).

On re-scan:
- If `prdEditedByUser` is false → agent overwrites the PRD
- If `prdEditedByUser` is true → agent proposes updates, user confirms

### CodeIssue

Bugs, security holes, dead code, etc. discovered by the scanning agent. Effort-based routing determines how issues get promoted to the backlog.

```ts
interface CodeIssue {
  id: string;
  fingerprint: string;            // Stable identity across scans (hash of category + file + description)
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'bug' | 'security' | 'performance' | 'dead_code';
  estimatedEffort: 'quick_fix' | 'moderate' | 'significant';
  file?: string;
  status: 'open' | 'planned' | 'fixed';
  backlogItemId?: string;         // Set when promoted to backlog
  planningChatId?: string;        // Set if routed through planning chat
  firstSeen: string;              // Timestamp of first scan that detected this
  lastSeen: string;               // Timestamp of most recent scan that still detected this
}
```

**Issue deduplication**: On re-scan, issues are matched by `fingerprint` (hash of category + file path + normalized description). If a fingerprint matches an existing issue, we update `lastSeen` and keep the existing status/backlog links. Only genuinely novel fingerprints create new issues. Issues whose fingerprint is absent from a re-scan get marked `'fixed'` automatically.

**Known limitation (V1)**: Fingerprinting on description text is brittle to agent rewording — the same underlying issue phrased differently produces a different hash. V1 mitigates this by tuning scan prompts to produce short, structured descriptions (e.g. `"unused variable: foo"` not prose). Future upgrade path: fingerprint on category + file + extracted key (symbol name, line range) instead of full description text.

Issue → Backlog promotion:
- `quick_fix` → one-click "Add to backlog" creates a BacklogItem directly
- `moderate` / `significant` → "Plan this" opens a planning chat, backlog item created from that conversation

### Scan System

Scans produce snapshots. We store history to enable diffing between scans.

```ts
interface ScanSnapshot {
  id: string;
  timestamp: string;
  masterPrd: string;
  features: FeatureModule[];
  issues: CodeIssue[];
  techStack: TechStack;
  fileCount: number;
  summary: string;
}

interface ScanDiff {
  newFeatures: string[];          // Feature fingerprints added since last scan
  removedFeatures: string[];      // Feature fingerprints no longer detected
  updatedFeatures: string[];      // Feature fingerprints with changed files
  issuesFixed: string[];          // Issue fingerprints no longer detected
  newIssues: string[];            // Issue fingerprints newly found
  summary: string;                // "Detected 2 new features, 3 bugs fixed"
}
```

On re-scan, the agent receives the previous snapshot + current codebase state and produces both a new snapshot and a diff.

### Types That Stay As-Is

These are all downstream of "I have a project with tasks" and carry forward unchanged:

- `Task`, `BacklogItem`, `Sprint` — build pipeline + planning
- `PlanningChat`, `ChatMessage` — planning conversations
- `GitEvent`, `DeploymentRecord` — git tracking
- `ReviewArtifact`, `ReviewFinding` — code review
- `BuildMetrics`, `TaskTokenUsage` — metrics
- `GamificationStats` — streaks/ranks
- `Config`, `CLIStatus` — app settings
- `AgentProvider`, `AgentRoleConfig` — multi-agent

### Types Removed

- `DesignPreferences` — inception-specific
- `HumanTask` — inception-specific (third-party service setup)
- `ProjectStatus` type (linear progression) — replaced by `scanStatus` on Project

---

## Storage

### New per-project collections

Same pattern as existing backlog, sprints, etc.:

```
getFeatures(slug) / saveFeatures(slug, features: FeatureModule[])
getIssues(slug) / saveIssues(slug, issues: CodeIssue[])
getScanHistory(slug) / saveScanHistory(slug, snapshots: ScanSnapshot[])
```

### Existing collections (unchanged)

```
getTasks / saveTasks
getBacklog / saveBacklog
getSprints / saveSprints
getPlanningChats / savePlanningChats
getGitEvents / saveGitEvents
getDeployments / saveDeployments
getGapAnalysis / saveGapAnalysis
getGamification / saveGamification
getChatHistory / saveChatHistory
getPRD / savePRD  (canonical source for master PRD — NOT duplicated on Project type)
```

---

## Screens

### V1 scope

| Screen | Status | Notes |
|--------|--------|-------|
| `onboarding` | **Keep** | CLI setup, same as before |
| `home` | **Rework** | Project list, but "New Project" = import repo URL |
| `import` | **New** | Enter repo URL → clone → kick off initial scan |
| `scanning` | **New** | Progress screen during codebase scan |
| `project-home` | **New** | Dashboard hub — scan summary, stats, quick actions |
| `docs` | **New** | Master PRD + feature PRDs, editable |
| `issues` | **New** | Bug list from scanner, promote to backlog |
| `planning` | **Keep** | Backlog, sprints, planning chats |
| `building` | **Keep** | Task pipeline (parallel worktree builds) |
| `git-history` | **Keep** | Git event tracking |
| `settings` | **Keep** | Including multi-agent config |

### Deferred (fast follow)

| Screen | Notes |
|--------|-------|
| `gap-analysis` | Compare PRD to codebase — maps perfectly to v2 but defer for now |
| `deployments` | Keep infrastructure, wire up later |

### Archived (moved to `src/screens/_archive/`)

These screens are preserved in the codebase but removed from the active flow:

- `idea` — inception entry point
- `discovery` — inception brainstorming
- `prd-review` — inception PRD approval
- `previewing` — inception preview
- `deploying` — inception deploy
- `complete` — inception done state

---

## Screen Flow

```
onboarding → home → import → scanning → project-home
                                            ├── docs         (master PRD + feature PRDs)
                                            ├── issues       (discovered bugs/issues)
                                            ├── planning     (backlog, sprints, chats)
                                            ├── building     (task pipeline)
                                            ├── git-history  (git tracking)
                                            └── settings
```

`project-home` is the daily landing page. It shows:
- Scan summary and last scanned date
- Tech stack
- Feature count with quick links
- Open issue count by severity
- Recent git activity
- Quick action buttons: Re-scan, Plan Feature, View Docs, Start Build

---

## Scanning Architecture

### Initial scan

When a repo is imported, Houston kicks off a multi-step scan:

1. **File tree analysis** — Map out the directory structure, identify key files
2. **Tech stack detection** — Languages, frameworks, build tools
3. **Feature discovery** — Identify discrete features/modules from code patterns, routes, components, etc.
4. **Master PRD generation** — High-level "what does this app do" document
5. **Feature PRD generation** — Per-feature documentation
6. **Issue detection** — Bugs, security issues, dead code, performance problems

This can be a single large agent call or broken into steps. TBD during implementation based on what produces better results.

### Scan failure and retry

When a scan fails (agent error, timeout, network issue):
1. `scanStatus` is set to `'failed'`, `scanError` is populated with the error message
2. The scanning screen shows the error with a "Retry" button
3. Retry re-runs the full scan from scratch (no partial results in v1)
4. If the scan was a re-scan and it fails, the previous scan data is preserved — we never lose good data

### Security posture

Scanning happens via Claude/Codex CLI running **locally** in the project directory. Code is sent to the AI provider's API the same way it would be if the user ran `claude` or `codex` directly in their terminal. Houston adds no additional exposure beyond what the user has already opted into by installing these CLIs. No code is sent to Houston servers (there are none).

### Re-scan

Triggered manually ("Re-scan" button on project-home) or potentially auto-triggered after builds merge.

1. Agent receives: previous `ScanSnapshot` + current codebase state
2. Agent produces: new `ScanSnapshot` + `ScanDiff`
3. For features where `prdEditedByUser` is true, agent proposes updates instead of overwriting
4. `ScanDiff` is stored on the project and shown in a summary toast/modal

---

## Implementation Phases (rough)

### Phase 1: Data model + storage
- Add new types to `src/types/index.ts`
- Add storage methods
- Wire IPC + preload

### Phase 2: Import flow
- New `import` screen (repo URL input, clone)
- Rework `home` screen for new project creation flow

### Phase 3: Scanning
- Scanning agent (discovery prompts for existing codebases)
- `scanning` progress screen
- Store results (features, issues, master PRD, tech stack)

### Phase 4: Project home dashboard
- New `project-home` screen as the hub
- Summary cards, quick actions, recent activity

### Phase 5: Docs screen
- Master PRD viewer/editor
- Feature PRD list with viewer/editor
- `prdEditedByUser` tracking

### Phase 6: Issues screen
- Issue list with filtering (severity, category, status)
- One-click backlog promotion for quick fixes
- "Plan this" flow for larger issues

### Phase 7: Re-scanning + diffing
- Re-scan trigger from project-home
- Diff computation and display
- Handle user-edited PRDs during re-scan

### Phase 8: Archive old screens
- Move inception screens to `_archive/`
- Clean up navigation, remove old status flow
- Update `Screen` type

---

## What Carries Forward (no changes needed)

- **Build pipeline** (`useBuildPipeline.ts`) — branch, build, review, merge
- **Multi-agent mode** — Claude + Codex routing
- **Git integration** — all of `window.api.github.*`
- **Planning system** — backlog, sprints, planning chats
- **Code review** — review artifacts, findings
- **Git history** — event tracking, diff viewer
- **Gamification** — streaks, ranks
- **Settings** — CLI config, multi-agent, theme
- **Preflight checks** — CLI detection, auth verification
- **Toast system** — notifications
- **Resilient chat** — retry logic, timeout handling

---

## Risks

1. **Scan quality** — The usefulness of the entire app hinges on how good the initial scan is. Bad feature detection or shallow PRDs = the tool feels useless. Scan prompts need heavy iteration.

2. **Large repos** — Scanning a 10k+ file repo is different from a 50-file side project. May need file filtering, chunked scanning, or smart sampling.

3. **Re-scan conflicts** — When the user has edited PRDs and the codebase has changed, merging is tricky. V1 approach: flag conflicts and let the user choose. Don't try to be smart about auto-merging.

4. **Migration** — Existing Houston users (if any) have v1 projects. Need to decide: ignore them, or provide a migration path. Probably ignore for now.

---

## Resolved Questions (from Codex review)

1. **Canonical source for master PRD** — `getPRD/savePRD` is the single source of truth. Not duplicated on the Project type.
2. **Identity strategy for features/issues across scans** — Deterministic fingerprints. Features: hash of (normalized name + sorted primary file paths). Issues: hash of (category + file path + normalized description). Diffs match by fingerprint, not by ID.
3. **Scan failure contract** — `scanStatus: 'failed'` + `scanError` string. Retry re-runs from scratch. Previous good data is never lost on re-scan failure.
4. **Issue deduplication** — `fingerprint` + `firstSeen`/`lastSeen` timestamps. Issues matched by fingerprint on re-scan. Missing fingerprints auto-marked as `'fixed'`.
5. **Security posture** — No additional exposure beyond the user's existing CLI setup. Scans run locally via Claude/Codex CLI.

## Open Questions

1. **Scan chunking** — One big agent call or multiple focused calls (features, then bugs, then docs)? TBD during implementation.
2. **Auto re-scan** — Should re-scan trigger automatically after a build merges? Or always manual?
3. **File system access** — The scanner runs via Claude/Codex CLI in the project directory, so it has full file access. The renderer-side `fs:readdir` scope limit is irrelevant since scanning is agent-driven.
