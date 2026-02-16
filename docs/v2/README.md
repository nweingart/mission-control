# Houston V2 Roadmap

## Overview

V1 is a local-first desktop app: local files, local CLIs, Supabase for auth/billing only. V2 introduces cloud features that require a persistent server and database. The two highest-priority items are cross-device sync and project backup — both address the risk of data loss inherent in a local-only architecture.

---

## Major Features (detailed plans in separate docs)

### 1. Project Backup & Recovery
**Priority: High**
Cloud backup of project state (PRD, tasks, config, build logs). If a machine dies or a user reinstalls, they can restore everything except the local git repo (which lives on GitHub anyway).

See: [project-backup.md](./project-backup.md)

### 2. Cross-Device Sync
**Priority: High**
Work on a project on one machine, continue on another. Requires backup infrastructure plus real-time or pull-based sync between devices.

See: [cross-device-sync.md](./cross-device-sync.md)

### 3. Collaboration
**Priority: Medium**
Multiple users on the same project — shared PRD editing, task assignment, build visibility. Significant architectural lift since the current model assumes one user per project.

See: [collaboration.md](./collaboration.md)

---

## Medium Features

### 4. Houston Chat Persistence
Currently, Houston chat context is ephemeral — it resets between sessions. Persisting chat history would let users pick up conversations where they left off, and give Houston more context about past decisions.

**Approach:** Store chat messages in Supabase (or locally with sync). Load last N messages as context when reopening a project. Could also feed chat history into PRD/task generation for better continuity.

**Depends on:** Project backup infrastructure (same storage layer).

### 5. Project Templates
Start a new project from a template instead of a blank idea. Templates could include pre-written PRD sections, common tech stack choices, or even partial task plans.

**Approach:** Ship built-in templates as JSON files bundled with the app. Later, allow community-submitted templates stored in Supabase. Template = partial PRD + suggested tech stack + optional starter tasks.

**Standalone — no server dependency for built-in templates.**

### 6. Auto-Updates
Ship new versions without requiring users to manually download. Electron has built-in support for this via `electron-updater`.

**Approach:** Use `electron-builder`'s auto-update with GitHub Releases as the update source. On launch, app checks for new version, downloads in background, prompts to restart. Requires code signing for macOS.

**Standalone — uses GitHub Releases, no custom server needed.**

### 7. Build Queue / Parallel Builds
Currently Houston builds one task at a time, sequentially. A build queue would let users queue multiple projects or parallelize independent tasks within a project.

**Approach:** Task dependency graph already exists. Independent tasks (no shared files) could run in parallel Claude Code sessions. Requires careful git branch management to avoid conflicts. Resource-intensive — multiple Claude Code instances consume API credits fast.

**Local only — no server needed, but needs careful orchestration.**

---

## Smaller Features

### 8. Windows & Linux Support
The `houston://` protocol handler currently uses macOS `open-url`. Windows uses a registry-based protocol handler, Linux uses `.desktop` files. Electron supports all three, but each needs platform-specific setup.

### 9. Custom Domain Deployment
Let users deploy to a custom domain instead of `*.vercel.app`. Vercel CLI supports this, just needs UI for domain configuration and DNS verification.

### 10. Rollback / Version History
Roll back a project to a previous state (specific task completion, specific deploy). Git history already tracks code changes. Would need to also snapshot PRD/task state at each milestone.

### 11. Usage Analytics
Track anonymized usage patterns — which features are used, where users drop off, common error states. Helps prioritize V3. Could use a lightweight service like PostHog or Supabase's built-in analytics.

### 12. Team / Org Billing
Shared billing for teams — one subscription covers multiple seats. Requires org concept in the database, invite flow, and per-seat or flat-rate pricing in Stripe.

---

## Architecture Note

Features 1-4 all benefit from the same infrastructure: a cloud database (Supabase) storing project state alongside auth/billing. The recommendation is to build project backup first, then layer sync, chat persistence, and collaboration on top of the same storage layer. This avoids building separate systems for each feature.
