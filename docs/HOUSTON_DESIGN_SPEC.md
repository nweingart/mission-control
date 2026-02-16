# Houston Design System — Final Spec

**Single source of truth. Dark mode only. Star field background is already implemented.**

This document covers: UI components, typography, navigation, gamification mechanics, animations, Houston character behaviors, and UX patterns. It does NOT cover the background treatment or base color palette — those are already in the codebase.

---

## 1. Theme & Mode

**Dark mode only. No light mode. No toggle.** The star field background is already implemented and should remain as-is. All component specs below are designed for dark surfaces.

### Surface Tokens (reference — already in use)

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg` | `#0D1117` | App background (behind star field) |
| `--bg-raised` | `#151B23` | Elevated panels |
| `--surface` | `#1C2333` | Cards, panels |
| `--surface-hover` | `#232B3A` | Hovered cards |
| `--surface-bright` | `#2A3444` | Active/selected surfaces |
| `--border` | `#2A3444` | Card borders, dividers |
| `--border-glow` | `#3A4556` | Emphasized borders |

### Signal Colors (reference — already in use)

| Token | Hex | Role |
|-------|-----|------|
| `--blue` | `#5B9EC9` | Primary / active |
| `--blue-glow` | `rgba(91, 158, 201, 0.15)` | Blue backgrounds |
| `--blue-bright` | `#7BB4D8` | Emphasized blue |
| `--red` | `#E05A4F` | Urgent / energy / Houston |
| `--red-glow` | `rgba(224, 90, 79, 0.15)` | Red backgrounds |
| `--amber` | `#E0A030` | Warning / caution / streaks |
| `--amber-glow` | `rgba(224, 160, 48, 0.15)` | Amber backgrounds |
| `--green` | `#4ADE80` | Success / go / landed |
| `--green-glow` | `rgba(74, 222, 128, 0.12)` | Green backgrounds |

### Text Tokens

| Token | Hex | Usage |
|-------|-----|-------|
| `--text` | `#E8E2D9` | Primary content (warm off-white) |
| `--text-secondary` | `#9CA3AF` | Labels, descriptions |
| `--text-muted` | `#5C6370` | Placeholders, disabled, timestamps |
| `--text-bright` | `#FFFFFF` | High-emphasis: countdowns, active labels, numbers |

---

## 2. Typography

### Fonts

| Role | Font |
|------|------|
| UI (everything) | Outfit |
| Code, data, readouts | IBM Plex Mono |

### Scale

| Element | Font | Size | Weight | Color |
|---------|------|------|--------|-------|
| Page title | Outfit | 24px | 700 | `--text-bright` |
| Section header | Outfit | 18px | 700 | `--text` |
| Card title | Outfit | 16px | 600 | `--text` |
| Body text | Outfit | 14px | 400–500 | `--text-secondary` |
| Small / caption | Outfit | 12–13px | 500 | `--text-muted` |
| Button text | Outfit | 13–14px | 600 | |
| Badge text | Outfit | 11px | 700 | Uppercase, signal color |
| Readout / counter | IBM Plex Mono | 20–28px | 600–700 | Signal colors |
| Code / data | IBM Plex Mono | 13px | 400 | `--text-secondary` |
| Dock labels | IBM Plex Mono | 10–11px | 500 | |

### Rules

- Outfit for all UI. IBM Plex Mono only for data values, code, countdowns, and dock labels.
- Large text (18px+) gets letter-spacing: -0.02em.
- Line-height: 1.5–1.6 for body text.
- `--text-bright` (#FFFFFF) only for numbers, countdowns, and active labels. Not body text.

---

## 3. Navigation — Bottom Dock

### Structure

5 icons, fixed bottom center, floating over content:

| # | Label | Contains |
|---|-------|----------|
| 1 | Plan | Planning + Backlog + Roadmap |
| 2 | Docs | Documents (PRDs, specs, notes) |
| 3 | Build | Kanban / live coding workspace |
| 4 | Ship | Git History + Deployments |
| 5 | Data | Database visualizer |

### Dock Styling

```css
.dock {
  background: rgba(21, 27, 35, 0.85);
  backdrop-filter: blur(16px);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 8px 20px;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.3);
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
}
```

### Dock Icon States

| State | Color | Effect |
|-------|-------|--------|
| Inactive | `--text-muted` | No glow |
| Hover | Station color at 60% opacity | Subtle glow halo |
| Active | Station bright color | Glow halo + dot below |

Station colors: Plan = blue, Docs = amber, Build = red, Ship = red, Data = green.

Active dot:
```css
.dock-icon.active::after {
  content: '';
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--station-color);
  box-shadow: 0 0 6px var(--station-color);
  position: absolute;
  bottom: -6px;
}
```

### Sub-Navigation (Plan & Ship)

Segmented control for sub-views:

**Plan tabs:** Planning, Backlog, Roadmap
**Ship tabs:** Commits, Deploys

```css
.segmented-control {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 3px;
}
.segment.active {
  background: var(--surface-bright);
  color: var(--text-bright);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
.segment.inactive {
  color: var(--text-muted);
}
```

Tab switching is instant — no route change, no transition. State preserved when navigating away and back.

---

## 4. Mission Status Language

Replace all generic PM terminology:

| Generic | Houston Term | Color |
|---------|-------------|-------|
| To Do / Queued | **On the Pad** | `--text-muted` |
| In Progress | **In Orbit** | `--blue` |
| In Review | **Re-entry** | `--amber` |
| Done | **Landed** | `--green` |
| Blocked | **Hold** | `--red` |
| Sprint | **Mission** | |
| Backlog Item | **Payload** | |
| Deploy | **Launch** | |
| PRD Ready | **Flight Plan Ready** | `--green` |
| PRD Draft | **Briefing Draft** | `--amber` |

### Status Indicator (Light Component)

8px circle next to every task. Not a text badge — a **light**.

```
On the Pad:  border only, no fill, dim
In Orbit:    filled --blue, pulsing glow (2s ease-in-out infinite)
In Re-entry: filled --amber, steady glow (no animation)
Landed:      filled --green, solid. On TRANSITION: 400ms scale-up + flash
Hold:        filled --red, slow pulse (3s — slower than In Orbit)
```

Status changes always animate — color transitions over 300ms, never instant swap.

---

## 5. Components

### Cards

```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--status-color); /* matches task status */
  border-radius: 12px;
  padding: 20px 24px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}
.card:hover {
  border-color: var(--border-glow);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  transform: translateY(-2px);
}
```

When status is In Orbit or Hold, the left border also glows:
```css
.card[data-status="in-orbit"] {
  box-shadow: -4px 0 12px rgba(91, 158, 201, 0.08);
}
```

### Card Data Readouts

Small metadata items (SP, task count, flight plan status) at bottom of cards:
```css
.readout {
  background: var(--bg);
  border-radius: 6px;
  padding: 4px 8px;
  font: 500 12px 'IBM Plex Mono';
  color: var(--text-secondary);
}
.readout.success {
  color: var(--green);
}
```

### Buttons

**Primary (blue):**
```css
.btn-primary {
  background: var(--blue);
  color: #FFFFFF;
  font: 600 14px 'Outfit';
  padding: 10px 22px;
  border: none;
  border-radius: 10px;
  box-shadow: 0 0 16px rgba(91, 158, 201, 0.2), 0 2px 8px rgba(0, 0, 0, 0.2);
}
.btn-primary:hover {
  background: var(--blue-bright);
  box-shadow: 0 0 24px rgba(91, 158, 201, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2);
}
.btn-primary:active {
  transform: translateY(1px);
}
```

**Destructive (red):**
```css
.btn-danger {
  background: var(--red);
  box-shadow: 0 0 16px rgba(224, 90, 79, 0.2), 0 2px 8px rgba(0, 0, 0, 0.2);
}
```

**Secondary (ghost with border):**
```css
.btn-secondary {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border-glow);
  border-radius: 10px;
  padding: 10px 22px;
}
.btn-secondary:hover {
  background: var(--surface);
  border-color: var(--blue);
}
```

### Badges

Colored text on glow background — like LED readouts:

```css
.badge {
  font: 700 11px 'Outfit';
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 3px 10px;
  border-radius: 5px;
}
.badge-on-the-pad { color: var(--text-muted); background: rgba(92, 99, 112, 0.2); }
.badge-in-orbit   { color: var(--blue-bright); background: var(--blue-glow); }
.badge-re-entry   { color: var(--amber-bright); background: var(--amber-glow); }
.badge-landed     { color: var(--green-bright); background: var(--green-glow); }
.badge-hold       { color: var(--red-bright); background: var(--red-glow); }
.badge-high       { color: var(--red-bright); background: var(--red-glow); }
.badge-medium     { color: var(--amber-bright); background: var(--amber-glow); }
.badge-low        { color: var(--blue-bright); background: var(--blue-glow); }
```

### Form Inputs

```css
input, textarea, select {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  font: 400 14px 'Outfit';
  padding: 10px 14px;
  color: var(--text);
}
input:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px var(--blue-glow), 0 0 12px rgba(91, 158, 201, 0.1);
}
```

### Progress Ring (Sprint/Mission)

SVG circle showing SP completed vs total.

```
Size: 48px on sprint cards, 64px on detail view
Stroke-width: 3px
Empty: var(--border)
Fill: var(--blue), animated 600ms ease-out
Complete: transitions to var(--green), scale pulse 1.05x over 300ms, glow intensifies
Label (center): SP fraction in IBM Plex Mono (e.g., "14/21"). At 100%: checkmark icon in green.
```

### Countdown Timer

Sprint deadlines as live countdowns, not dates.

```
Font: IBM Plex Mono, 14-16px, bold
>3 days:  "4d 12h" — --text-secondary
1-3 days: "1d 6h"  — --amber, steady glow
<24h:     "3h 22m" — --red, 1.5s pulse
Overtime: "+2d 4h" — --red-bright, static
```

Updates every minute. Color transition from amber to red is gradual over the last 24 hours.

---

## 6. Gamification

### Streak

Tracks consecutive days with at least one qualifying action (task landed, deploy, doc written).

- Display: flame icon (custom SVG, not emoji) + number in top nav, IBM Plex Mono 16px bold, amber color
- 1 missed day = auto-freeze (1 free per week). 2 missed = reset
- Milestones at 7, 14, 30 days — Houston callout banner, auto-dismiss 4s

### Launch Counter

Total successful deploys.

- Display: "12 Launches" with rocket icon in profile/stats
- Each launch: number ticks up, rocket does 200ms lift animation

### Mission Rank

| Rank | Requirements | Badge Color |
|------|-------------|-------------|
| Cadet | New user | `--text-muted` |
| Flight Controller | 10 tasks landed | `--blue` |
| Mission Specialist | 50 tasks + 5 launches | `--amber` |
| Mission Commander | 100 tasks + 20 launches + 14-day streak | `--red` |
| Houston Actual | 200 tasks + 50 launches + 30-day streak | `--green-bright` |

Rank-up: banner slides from top, Houston congratulates, badge animates to new color. Auto-dismiss 5s.

---

## 7. Houston Character

### Avatar

- Circle, red gradient (`--red` → `--red-deep`)
- Visor with two dot eyes, antenna with amber tip
- Glow: `box-shadow: 0 0 12px rgba(224, 90, 79, 0.3)`
- Position: floating bottom-right, ~48px. Click opens slide-up chat panel.

### States

| State | Trigger | Visual |
|-------|---------|--------|
| Idle | Nothing happening | Calm eyes, steady glow |
| Working | AI generating | Focused eyes, blue pulsing ring |
| Celebrating | Task landed, deploy, milestone | Happy eyes, bounce, green glow |
| Alert | Deadline close, error | Wide eyes, amber/red glow, antenna blinks |
| Greeting | App opened | Wave/nod animation |

### Empty State Callouts

| Screen | Houston Says | CTA |
|--------|-------------|-----|
| Planning (empty) | "No missions planned. Brainstorm one?" | "Plan with Houston" |
| Backlog (empty) | "Pad is clear. Load some payloads." | "Add to Backlog" |
| Roadmap (no sprints) | "No orbits mapped. Create one?" | "New Mission" |
| Build (no work) | "Standing by, Commander." | "Start Building" |
| Ship (no deploys) | "Nothing launched yet." | "View Build" |
| Data (no db) | "No data banks connected." | "Connect Database" |

### Context-Aware Greetings (on app open)

```
Sprint on track:     "8 SP left, 3 days to go."
Sprint behind:       "14 SP left, 1 day on the clock."
Streak active:       "Day 12."
Just shipped:        "Yesterday's launch landed clean."
Default:             "Ready when you are."
```

---

## 8. Animations & Micro-Interactions

### Standard Transitions

| Element | Effect | Duration |
|---------|--------|----------|
| Card hover | Glow + lift (translateY -2px) | 150ms ease |
| Card drag | Lift + shadow + scale 1.01x | 150ms |
| Button hover | Glow intensifies | 150ms ease |
| Button press | translateY 1px | 100ms |
| Dock icon hover | Glow halo | 150ms |
| Status change | Color transition | 300ms |
| Progress ring fill | Stroke animation | 600ms ease-out |

### Celebration Animations

| Trigger | Effect | Duration |
|---------|--------|----------|
| Task → Landed | Green flash on card + status light scale-up | 400ms |
| Sprint complete | Ring → green, scale pulse 1.05x, Houston celebrates | 800ms |
| Deploy success | Ship tab flashes green, particle burst (6-8 dots rising), Houston callout | 1s |
| Streak milestone | Flame grows, amber flash, banner slides down | 500ms |
| Rank up | Banner from top, badge color transition | 5s (auto-dismiss) |

### Deploy "Hold to Launch"

Deploy is a hold-to-confirm interaction:

1. User presses Launch button
2. Button fills with color L→R over 1 second
3. Release early = abort (resets)
4. Hold full 1s = deploy triggers
5. Button flashes, particles emit, Houston: "We have liftoff."

### Pulsing Status Indicators

```css
@keyframes pulse-orbit {
  0%, 100% { box-shadow: 0 0 8px rgba(91, 158, 201, 0.3); }
  50% { box-shadow: 0 0 16px rgba(91, 158, 201, 0.6); }
}
.status-in-orbit {
  animation: pulse-orbit 2s ease-in-out infinite;
}

@keyframes pulse-hold {
  0%, 100% { box-shadow: 0 0 8px rgba(224, 90, 79, 0.3); }
  50% { box-shadow: 0 0 14px rgba(224, 90, 79, 0.5); }
}
.status-hold {
  animation: pulse-hold 3s ease-in-out infinite;
}
```

---

## 9. Behavioral Nudges

| User State | Nudge |
|-----------|-------|
| Has backlog, no active sprint | Amber pulse on "New Mission" button. Houston: "Payloads ready." |
| Sprint active, nothing in progress | Blue highlight on top unstarted task |
| Task in orbit >2 days, no changes | Amber indicator. Houston: "Need a hand with [task]?" |
| No activity 24h during sprint | Houston greeting with sprint status on next open |
| Sprint complete, no new sprint | Houston: "Clean landing. Next orbit?" + CTA |

---

## 10. Toast Notifications

```
Position: top-center, slides down
Background: var(--surface) with colored left border
Auto-dismiss: 4 seconds
```

- [green dot] "Auth flow has landed." [View]
- [flame icon] "7-day streak." [dismiss]
- [rocket icon] "Deploy successful." [View logs]
- [amber dot] "Mission 2 deadline in 24 hours." [View]

**Urgent (persistent):**
```
Background: var(--red-glow) with red border
Does NOT auto-dismiss
```
- [Houston] "Deploy failed. Missing DATABASE_URL." [Fix] [Logs]

---

## Anti-Patterns

- No light mode. No toggle. Dark only.
- No pure black (#000) or pure white (#FFF) for backgrounds.
- No generic PM language — use mission control terms.
- No static numbers — if it's a count, it animates.
- No empty states without Houston.
- No colorless cards — every card has a status indicator.
- No silent completions — landing/shipping always has visual reward.
- No accidental deploys — hold-to-launch required.
- No fonts besides Outfit and IBM Plex Mono.
