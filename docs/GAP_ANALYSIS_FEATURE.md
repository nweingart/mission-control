# Gap Analysis Feature - Implementation Plan

## Overview

After all build tasks complete, run an automated quality gate that compares the built codebase against the PRD. Produces a grade (0-100), identifies gaps, attempts one auto-fix pass if needed, and surfaces the full quality report in the preview screen. This sits between the Build and Preview phases as a new screen.

**Depends on:** Git History feature (uses GitEvent system for timeline integration).

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Pipeline position | New `gap-analysis` screen after build, before preview | BuildScreen is already 47KB. Distinct phase with its own state deserves its own screen. |
| Below-95 behavior | One auto-fix attempt, then show to user | Balances automation with user control. Avoids burning API credits on futile loops. |
| Two-pass system | Analysis → meta-review → (optional fix → re-analysis) | Meta-review validates findings before acting on them. |
| Review display | Quality Report sidebar in PreviewScreen | Distinct from Git History (timeline). This is a focused quality view. |
| Claude interaction | Claude Code CLI with structured JSON output prompts | Same spawning pattern as existing build tasks. |

---

## Pipeline Flow

```
BuildScreen (all tasks complete)
        │
        ▼
┌─ GapAnalysisScreen ─────────────────────────────┐
│                                                   │
│  Phase 1: INITIAL ANALYSIS                        │
│  ├─ Spawn Claude Code with PRD + analysis prompt  │
│  ├─ Parse structured response                     │
│  └─ Produces: findings[], grade, summary          │
│                                                   │
│  Phase 2: META-REVIEW                             │
│  ├─ Send first analysis back to Claude            │
│  ├─ Claude validates/adjusts findings + grade     │
│  └─ Produces: validatedGrade, adjustedFindings[]  │
│                                                   │
│  Decision: Is validatedGrade >= 95?               │
│  ├─ YES → Note remaining items → proceed          │
│  └─ NO  → Phase 3                                 │
│                                                   │
│  Phase 3: AUTO-FIX (conditional)                  │
│  ├─ Claude attempts to fix identified gaps        │
│  ├─ Commits fixes to main branch                  │
│  └─ Emits GitEvents (committed, auto_fixed)       │
│                                                   │
│  Phase 4: RE-ANALYSIS (conditional)               │
│  ├─ Run gap analysis again on fixed code          │
│  └─ Produces: new grade + findings                │
│                                                   │
│  Final Decision:                                  │
│  ├─ Grade >= 95 → auto-proceed to preview         │
│  └─ Grade < 95  → show report, user decides       │
│                                                   │
└───────────────────────────────────────────────────┘
        │
        ▼
   PreviewScreen (with Quality Report sidebar)
```

---

## Data Model

### New Types: `GapAnalysis` and `GapFinding`

```typescript
// src/types/index.ts

interface GapFinding {
  category: string;           // e.g. "Authentication", "UI Layout", "API Endpoints"
  description: string;        // what's missing or wrong
  prdSection?: string;        // which part of the PRD this relates to
  severity: 'missing' | 'incomplete' | 'deviation';
  resolved: boolean;          // set to true if auto-fix addressed it
}

interface GapAnalysis {
  id: string;
  pass: 1 | 2;               // first analysis or post-fix re-analysis
  grade: number;              // 0-100 raw grade
  validatedGrade: number;     // grade after meta-review adjustment
  findings: GapFinding[];
  summary: string;
  fixesApplied: boolean;
  fixCommitHash?: string;     // commit hash of the fix, if applied
  remainingItems: string[];   // human-readable list of what still needs work
  timestamp: string;
}
```

### Storage

Persisted as `gap-analysis.json` per project:

```
~/.kiln/projects/<slug>/
  ├── project.json
  ├── tasks.json
  ├── chat-history.json
  ├── backlog.json
  ├── planning-chats.json
  ├── git-events.json
  └── gap-analysis.json       ← NEW (array of GapAnalysis, typically 1-2 entries)
```

---

## Claude Prompts

### Prompt 1: Initial Gap Analysis

Spawned as a Claude Code session in the project directory so Claude has full codebase access:

```
Review this codebase against the following PRD. For each requirement in the PRD,
determine if it has been fully implemented, partially implemented, or is missing.

PRD:
---
{prd content}
---

Respond with ONLY valid JSON in this exact format:
{
  "grade": <number 0-100>,
  "summary": "<2-3 sentence overall assessment>",
  "findings": [
    {
      "category": "<feature area>",
      "description": "<what is missing or incomplete>",
      "prdSection": "<relevant PRD section>",
      "severity": "missing" | "incomplete" | "deviation"
    }
  ],
  "remainingItems": ["<human readable item 1>", "<item 2>"]
}
```

### Prompt 2: Meta-Review

```
You are reviewing a gap analysis report that compared a codebase against its PRD.
Validate the findings. Check for false positives (things marked missing that actually
exist), false negatives (real gaps that were missed), and whether the grade is fair.

Original PRD:
---
{prd content}
---

Gap Analysis Report:
---
{JSON from prompt 1}
---

Respond with ONLY valid JSON in this exact format:
{
  "validatedGrade": <adjusted number 0-100>,
  "adjustedFindings": [<same finding format, corrected>],
  "summary": "<assessment of the analysis quality and adjusted verdict>",
  "remainingItems": ["<validated remaining items>"]
}
```

### Prompt 3: Auto-Fix (conditional, only if validatedGrade < 95)

```
The following gaps were identified between the codebase and its PRD.
Fix as many of these issues as you can. Focus on the most impactful items first.

Gaps to fix:
---
{validated findings as bullet list}
---

Original PRD for reference:
---
{prd content}
---

Make the changes directly in the codebase. After making changes, respond with
a brief summary of what you fixed.
```

### Prompt 4: Re-Analysis (same as Prompt 1, run after fixes)

Same prompt as Prompt 1, producing a second `GapAnalysis` entry with `pass: 2`.

---

## Files to Modify

### 1. Types — `src/types/index.ts`

- Add `GapFinding` interface
- Add `GapAnalysis` interface
- Add `'gap-analysis'` to the `Screen` union type

### 2. Storage Service — `electron/services/storage.ts`

Add two methods:

```typescript
async getGapAnalysis(slug: string): Promise<GapAnalysis[]>
async saveGapAnalysis(slug: string, analyses: GapAnalysis[]): Promise<void>
```

### 3. IPC Wiring — `electron/main.ts`

Add IPC handlers:

```typescript
ipcMain.handle('storage:getGapAnalysis', async (_, slug) => {
  return storageService.getGapAnalysis(slug);
});

ipcMain.handle('storage:saveGapAnalysis', async (_, slug, analyses) => {
  await storageService.saveGapAnalysis(slug, analyses);
});
```

### 4. Preload — `electron/preload.ts`

```typescript
getGapAnalysis: (slug: string) => ipcRenderer.invoke('storage:getGapAnalysis', slug),
saveGapAnalysis: (slug: string, analyses: GapAnalysis[]) => ipcRenderer.invoke('storage:saveGapAnalysis', slug, analyses),
```

### 5. Electron API Type — `src/types/electron.d.ts`

Add to the `storage` section:

```typescript
getGapAnalysis: (slug: string) => Promise<GapAnalysis[]>;
saveGapAnalysis: (slug: string, analyses: GapAnalysis[]) => Promise<void>;
```

### 6. Store — `src/store/useAppStore.ts`

Add to state:

```typescript
gapAnalyses: GapAnalysis[];
```

Add actions:

```typescript
addGapAnalysis: (analysis: Omit<GapAnalysis, 'id' | 'timestamp'>) => void;
saveGapAnalyses: () => Promise<void>;
loadGapAnalyses: () => Promise<void>;
goToGapAnalysis: () => void;  // sets screen to 'gap-analysis'
```

Update `loadProject` to call `loadGapAnalyses()`.

Add `'gap-analysis'` status handling — though the project status doesn't need a new value. The project stays in `'building'` status until gap analysis passes, then transitions to `'previewing'`. This keeps the existing status flow clean.

### 7. BuildScreen — `src/screens/BuildScreen.tsx`

**Minimal change:** When all tasks are complete and the build pipeline finishes, instead of transitioning directly to preview, transition to gap analysis:

```typescript
// Current: navigates to preview when all tasks done
// Change to:
store.getState().setScreen('gap-analysis');
```

One line change in the task completion logic.

### 8. PreviewScreen — `src/screens/PreviewScreen.tsx`

Add a collapsible **Quality Report sidebar** on the right side:

```
┌──────────────────────────────────┬──────────────────┐
│                                  │ Quality Report    │
│                                  │                   │
│                                  │ Grade: 96/100 ✓   │
│      Preview content             │                   │
│      (existing)                  │ ── Gap Analysis ──│
│                                  │ 2 items noted     │
│                                  │ [expand]          │
│                                  │                   │
│                                  │ ── Task Reviews ──│
│                                  │ Task 3: 2 warn    │
│                                  │ Task 2: clean     │
│                                  │ Task 1: clean     │
│                                  │ [expand each]     │
│                                  │                   │
└──────────────────────────────────┴──────────────────┘
```

**Sidebar contents:**
- Grade badge (color-coded: green >= 95, amber 80-94, red < 80)
- Gap analysis findings (expandable)
- Remaining items list
- Per-task review artifacts (from build phase, loaded from git events)
- Collapse/expand toggle

Data comes from:
- `gapAnalyses` in the store (gap analysis data)
- `gitEvents` filtered to `type === 'review_completed'` (per-task reviews)

### 9. App.tsx

Add the gap-analysis route to `renderProjectScreen()`:

```typescript
case 'gap-analysis':
  return <GapAnalysisScreen />;
```

This is inside the `ProjectLayout` wrapper (from Git History feature), so the nav bar is present.

### 10. ProjectLayout — `src/components/ProjectLayout.tsx`

No changes needed if already built from Git History feature. The gap-analysis screen is automatically wrapped.

---

## New Files

### 11. GapAnalysisScreen — `src/screens/GapAnalysisScreen.tsx`

**UI Layout:**

```
┌─────────────────────────────────────────────────────┐
│              Gap Analysis                            │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  ● Phase 1: Analyzing codebase vs PRD...    │    │
│  │    ████████████░░░░░░░░  60%                │    │
│  │                                             │    │
│  │  Streaming output from Claude appears here  │    │
│  │  as the analysis runs...                    │    │
│  │                                             │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  Phase status indicators:                           │
│  [✓ Analysis] [● Meta-Review] [○ Fix] [○ Re-grade] │
│                                                     │
└─────────────────────────────────────────────────────┘
```

After completion (passed):

```
┌─────────────────────────────────────────────────────┐
│              Gap Analysis Complete                   │
│                                                     │
│         ┌──────────────────────┐                    │
│         │                      │                    │
│         │     96 / 100         │                    │
│         │       PASS           │                    │
│         │                      │                    │
│         └──────────────────────┘                    │
│                                                     │
│  Summary: Strong implementation covering all core   │
│  features. Minor gaps in error handling and edge    │
│  cases for form validation.                         │
│                                                     │
│  Remaining Items:                                   │
│  • Add loading state to settings page               │
│  • Handle empty state in dashboard                  │
│                                                     │
│  ┌─────────────┐                                    │
│  │ Continue to  │                                    │
│  │   Preview →  │                                    │
│  └─────────────┘                                    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

After completion (below 95, post-fix):

```
┌─────────────────────────────────────────────────────┐
│              Gap Analysis Complete                   │
│                                                     │
│         ┌──────────────────────┐                    │
│         │                      │                    │
│         │     82 / 100         │                    │
│         │   NEEDS REVIEW       │                    │
│         │                      │                    │
│         └──────────────────────┘                    │
│                                                     │
│  Auto-fix was applied but some gaps remain.         │
│                                                     │
│  Remaining Items:                                   │
│  • Authentication flow incomplete (missing OAuth)   │
│  • No error boundaries on main routes               │
│  • Dashboard charts not implemented                 │
│                                                     │
│  ┌─────────────────┐  ┌─────────────────┐           │
│  │ Continue to      │  │ View Full       │           │
│  │   Preview →      │  │   Report        │           │
│  └─────────────────┘  └─────────────────┘           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**State management within the screen:**

```typescript
type GapPhase =
  | 'analyzing'      // Phase 1: running initial analysis
  | 'meta-reviewing' // Phase 2: validating findings
  | 'fixing'         // Phase 3: auto-fixing (conditional)
  | 're-analyzing'   // Phase 4: re-grading (conditional)
  | 'passed'         // grade >= 95
  | 'needs-review'   // grade < 95 after fix attempt
  | 'error';
```

**Internal logic:**

1. On mount, load PRD from project storage
2. Spawn Claude Code session with gap analysis prompt
3. Stream output to screen (user sees Claude thinking)
4. Parse JSON response → store as GapAnalysis with `pass: 1`
5. Spawn meta-review session → parse → update validatedGrade
6. If validatedGrade >= 95 → set phase to `'passed'`
7. If < 95 → set phase to `'fixing'`, spawn Claude fix session
8. After fix → commit → emit GitEvents (`committed`, `auto_fixed`)
9. Re-run analysis → store as GapAnalysis with `pass: 2`
10. Final grade check → `'passed'` or `'needs-review'`
11. On "Continue to Preview" → update project status to `'previewing'`, navigate

### 12. QualityReportSidebar — `src/components/QualityReportSidebar.tsx`

Reusable sidebar component used in PreviewScreen. Props:

```typescript
interface QualityReportSidebarProps {
  gapAnalyses: GapAnalysis[];
  reviewArtifacts: ReviewArtifact[];  // from git events
  collapsed: boolean;
  onToggle: () => void;
}
```

Renders:
- Grade badge (from latest gap analysis)
- Gap findings (expandable sections)
- Remaining items
- Per-task review summaries (expandable)
- Collapsible via toggle button

---

## Git History Integration

Gap Analysis emits events to the GitEvent timeline (from the Git History feature):

| Action | GitEvent Type | Data |
|--------|---------------|------|
| Analysis complete | `gap_analysis_complete` | grade, finding count |
| Auto-fix committed | `committed` + `auto_fixed` | commit hash, fix summary |
| Re-analysis complete | `gap_analysis_complete` | new grade, pass: 2 |

This requires adding `'gap_analysis_complete'` to the `GitEvent.type` union in `src/types/index.ts`.

The Git History screen will then naturally show:

```
● Gap Analysis
  ├─ Analysis: 82/100 (3 missing, 2 incomplete)
  ├─ Auto-fix applied: 4 issues resolved
  └─ Re-analysis: 96/100 ✓ PASS
```

---

## Implementation Order

### Phase 1: Data Layer

1. Add `GapFinding`, `GapAnalysis` types to `src/types/index.ts`
2. Add `'gap-analysis'` to `Screen` type
3. Add `'gap_analysis_complete'` to `GitEvent.type` union
4. Add `getGapAnalysis` / `saveGapAnalysis` to `storage.ts`
5. Add IPC handlers in `main.ts`
6. Add to preload bridge in `preload.ts`
7. Add to `ElectronAPI` type in `electron.d.ts`
8. Add `gapAnalyses` state + actions to `useAppStore.ts`

### Phase 2: Gap Analysis Screen

9. Create `GapAnalysisScreen.tsx` with phase state machine
10. Implement Claude prompt logic (analyze → meta-review → fix → re-analyze)
11. Add JSON response parsing with error handling
12. Add route in `App.tsx`
13. Wire BuildScreen completion to navigate to `gap-analysis`

### Phase 3: Git Event Integration

14. Emit `gap_analysis_complete` events from GapAnalysisScreen
15. Emit `committed` / `auto_fixed` events when fix is applied
16. Verify events show up in Git History screen

### Phase 4: Quality Report Sidebar

17. Create `QualityReportSidebar.tsx` component
18. Integrate into `PreviewScreen.tsx`
19. Load gap analysis data + review artifacts from store
20. Style and polish

---

## Edge Cases to Handle

- **PRD not found**: If project has no stored PRD, skip gap analysis and go straight to preview with a warning
- **Claude parsing failure**: If JSON response is malformed, retry once with a stricter prompt, then fall back to showing raw output with a "manual review needed" state
- **Empty diff / no changes**: If the codebase has no meaningful code yet, handle gracefully
- **Fix attempt makes things worse**: The re-analysis will catch this — grade could go down, which is fine, user sees the report
- **User navigates away mid-analysis**: Save partial state so they can return (gap analysis phase persists in project state)

---

## Future Extensions (not in this PR)

- **Fix iteration**: Allow user to trigger additional fix attempts from the needs-review screen
- **Selective fixes**: Let user pick which findings to auto-fix vs. ignore
- **PRD section linking**: Deep-link findings to specific PRD sections
- **Grade history**: Track grades across multiple builds of the same project
- **Multi-Agent awareness**: When Multi-Agent ships, gap analysis can report per-agent quality
