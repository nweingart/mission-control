# Collaboration

## Problem

Houston is currently single-user. One person owns and works on a project. In practice, many MVPs are built by small teams (2-5 people) — a founder and a technical co-founder, a designer and a developer, a small agency building for a client. There's no way to share a project's progress, divide tasks, or let someone else trigger builds.

## Goal

Let multiple users view and contribute to the same Houston project. Not real-time collaborative editing (Google Docs style), but shared visibility and task ownership — closer to a shared Trello board backed by an automated build system.

---

## User Stories

1. **Invite a collaborator:** Project owner shares an invite link. Collaborator signs in and sees the project on their home screen.
2. **Shared PRD:** All collaborators see the same PRD. Anyone can edit it (last-save-wins, or locking).
3. **Task assignment:** Owner or collaborators can assign tasks to specific people. "You handle the API routes, I'll do the UI."
4. **Build visibility:** When someone triggers a build, all collaborators see the progress in real time.
5. **Activity feed:** See what happened while you were away — "Alice updated the PRD", "Bob completed Task 3".

---

## Architecture Impact

This is the biggest architectural shift from V1. Key changes:

### Project ownership moves to the cloud

In V1, a project is a folder on disk. In collab mode, the project must live in Supabase as the source of truth, with local copies on each collaborator's machine synced via the backup/sync infrastructure.

### New database tables

```sql
-- Project collaborators
CREATE TABLE public.project_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_slug text NOT NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  member_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL DEFAULT 'editor',  -- 'owner', 'editor', 'viewer'
  invited_at timestamptz DEFAULT now() NOT NULL,
  accepted_at timestamptz,
  UNIQUE(project_slug, owner_id, member_id)
);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Members can see projects they belong to
CREATE POLICY "Members see own memberships"
  ON public.project_members FOR SELECT
  USING (auth.uid() = member_id OR auth.uid() = owner_id);

-- Only owners can manage members
CREATE POLICY "Owners manage members"
  ON public.project_members FOR ALL
  USING (auth.uid() = owner_id);

-- Activity feed
CREATE TABLE public.project_activity (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_slug text NOT NULL,
  owner_id uuid NOT NULL,
  actor_id uuid REFERENCES auth.users(id) NOT NULL,
  action text NOT NULL,        -- 'prd_updated', 'task_completed', 'build_started', etc.
  details jsonb,               -- action-specific payload
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.project_activity ENABLE ROW LEVEL SECURITY;

-- Project members can view activity
CREATE POLICY "Members view activity"
  ON public.project_activity FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_slug = project_activity.project_slug
        AND owner_id = project_activity.owner_id
        AND (member_id = auth.uid() OR owner_id = auth.uid())
    )
  );
```

### Sync becomes real-time (for active collaborators)

When two people have the same project open, use Supabase Realtime to push updates:
- Task state changes
- Build progress
- PRD edits
- Activity feed entries

This is the first time Houston would use Supabase Realtime subscriptions.

---

## Implementation Phases

### Phase 1: Invite flow

1. Project settings > "Invite Collaborator" > generates a unique invite link
2. Link opens the Houston website with an accept page
3. Accepting the invite adds a row to `project_members`
4. Collaborator's Houston app sees the shared project on next sync

**Invite link format:** `https://houston-app.com/invite/{token}`
Token maps to a row in an `invites` table with expiration.

### Phase 2: Shared project view

1. When a collaborator opens a shared project, it syncs from cloud (same as cross-device sync)
2. PRD, tasks, and config are pulled from `project_backups` (owned by the project owner)
3. Local changes push to cloud, other collaborators pull on next refresh

**No simultaneous editing in Phase 2.** If two people edit the PRD at the same time, last save wins. Acceptable for small teams.

### Phase 3: Task assignment

1. Tasks get an `assigned_to` field (user ID)
2. UI shows avatar/initials next to each task
3. Filter tasks by "My tasks" / "All tasks"
4. Only the assigned person (or owner) can trigger a build for that task

### Phase 4: Real-time updates

1. Subscribe to Supabase Realtime channel for the project
2. When a collaborator saves the PRD, other open clients see the update
3. Build progress streams to all connected clients
4. Activity feed updates live

### Phase 5: Activity feed

1. Log all mutations to `project_activity`
2. Show feed in project sidebar or dedicated panel
3. "Alice updated the PRD — 5 minutes ago"
4. "Bob started build for Task 3 — just now"

---

## Roles & Permissions

| Action | Owner | Editor | Viewer |
|--------|-------|--------|--------|
| View PRD & tasks | Yes | Yes | Yes |
| Edit PRD | Yes | Yes | No |
| Trigger builds | Yes | Yes | No |
| Manage tasks | Yes | Yes | No |
| Deploy | Yes | Yes | No |
| Invite members | Yes | No | No |
| Remove members | Yes | No | No |
| Delete project | Yes | No | No |

---

## Billing Model Options

1. **Per-seat pricing:** $8/mo per user. Each collaborator needs Pro.
2. **Per-project pricing:** Project owner pays, collaborators are free. Simpler but less revenue.
3. **Team plan:** Flat rate for up to N seats ($20/mo for 5 seats). Common SaaS model.

Recommendation: Start with option 1 (each user needs Pro). Simplest to implement — no new billing logic. Add team plans later if there's demand.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Merge conflicts in PRD | Last-save-wins for Phase 2. Consider operational transforms or CRDT for Phase 4+ if needed. |
| Two people building the same task | Task locking — once a build starts, the task is locked until it completes or is manually unlocked. |
| Git conflicts from parallel builds | Each task already uses a separate branch. Conflicts only happen at merge, which Houston's review step handles. |
| Complexity explosion | Ship phases incrementally. Phase 1-2 alone (invite + shared view) are useful without real-time. |

---

## Dependencies

- Project Backup (required — cloud is the source of truth)
- Cross-Device Sync (required — collaborators need to pull project state)
- Supabase Realtime (Phase 4 only)

---

## Estimated Scope

| Phase | Effort | Value |
|-------|--------|-------|
| 1. Invite flow | Medium | Unlocks sharing |
| 2. Shared view | Medium | Core collab experience |
| 3. Task assignment | Small | Team coordination |
| 4. Real-time | Large | Polish, feels alive |
| 5. Activity feed | Small | Awareness |

Total: ~3-5 weeks. Phases 1-2 are the MVP of collaboration and could ship independently.
