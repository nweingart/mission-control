# Style Duel Feature - Implementation Plan

## Overview

While the AI builds the MVP (BuildScreen), the user currently watches terminal output and a kanban board — they're passive. **Style Duel** fills this dead time with an engaging, opinionated design questionnaire presented as a series of A-vs-B card duels. The user swipes/clicks through ~8-12 rounds of visual comparisons (dark vs light, dense vs airy, rounded vs sharp, etc.) and the system distills their choices into a Tailwind theme config. When the build completes, a final "apply theme" task injects the user's chosen styles into the codebase.

**Key insight:** The user is idle during the build. This turns waiting into something productive and fun.

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| When it runs | Concurrent with BuildScreen, as an overlay/tab | User is idle during build. Don't block the pipeline — run alongside it. |
| UI paradigm | Binary card duel (pick A or B) | Low cognitive load. Pinterest/Tinder-style swiping is intuitive. Avoids decision paralysis of sliders or multi-option menus. |
| **Theme coherence** | **Design harmonization engine** | **Choices are independent inputs. A rule-based harmonizer takes the full set of preferences and generates tokens that work together — like a design compiler. No presets. Infinite combinations, all cohesive. See "Design Harmonization" below.** |
| Output format | Tailwind `theme.extend` config (colors, fonts, spacing, border-radius, etc.) | Already using Tailwind. Direct mapping from choices to config values. No new tooling needed. |
| Application timing | Final build task after all other tasks complete | Keeps design choices separate from feature code. Clean git diff. Easy to revert. |
| Persistence | `styleProfile` on the Project model | Survives page reload. Can be re-used or edited later. |
| How styles are applied | Claude Code task: "Apply this Tailwind theme to the project" | Leverages existing build pipeline. Claude understands Tailwind and can update both config and component classes. |

---

## User Flow

```
BuildScreen starts (AI building tasks)
        │
        ▼
┌─ Style Duel Tab/Overlay ─────────────────────────┐
│                                                    │
│  "While your app is being built, let's figure     │
│   out how it should look."                         │
│                                                    │
│  ┌──────────────┐    ┌──────────────┐             │
│  │              │    │              │             │
│  │   Option A   │ vs │   Option B   │             │
│  │              │    │              │             │
│  │  Dark mode   │    │  Light mode  │             │
│  │  ██████████  │    │  ░░░░░░░░░░  │             │
│  └──────────────┘    └──────────────┘             │
│                                                    │
│  Round 3 of 10          ●●●○○○○○○○                │
│                                                    │
│  [Skip this round]                                │
│                                                    │
└────────────────────────────────────────────────────┘
        │
        ▼ (user completes all rounds)
        │
┌─ Style Summary ──────────────────────────────────┐
│                                                    │
│  "Here's your design system"                       │
│                                                    │
│  Dark · Warm · Spacious · Rounded · Subtle         │
│                                                    │
│  ┌─────────────────────────────────────────────┐  │
│  │                                             │  │
│  │   [Live preview mockup: nav bar, card,      │  │
│  │    button, input, table row — all rendered   │  │
│  │    in the harmonized theme so the user sees  │  │
│  │    how everything works together]            │  │
│  │                                             │  │
│  └─────────────────────────────────────────────┘  │
│                                                    │
│  Your choices → palette, spacing, type, and        │
│  borders have been tuned to work as a system.      │
│                                                    │
│  [Apply to my project]        [Redo]              │
│                                                    │
└────────────────────────────────────────────────────┘
        │
        ▼ (confirmed)
        │
  styleProfile saved to project
  Final build task queued: "Apply design theme"
```

---

## Design Harmonization

### The Problem

The user picks dark + warm + compact + rounded + monospace + bold. Are those choices compatible? Individually, sure. But naively combining them — just mapping each toggle to raw token values — produces themes where the pieces don't feel like they belong together. Design is about *relationships* between decisions, not individual settings.

### The Solution: A Design Compiler

Instead of presets, we build a **harmonization engine** — a pure function that takes the user's raw preferences and generates a complete set of Tailwind tokens where every value has been adjusted to work with every other value. The rules encode the same design principles a human designer would apply:

> "If they want dark + warm, I'd use warm grays (stone), not cool grays (slate). And the accent should be amber-ish, not blue — blue accent on warm dark backgrounds feels disconnected."

The user's choices are **inputs to the compiler**, not direct token values. The compiler's **design rules** ensure the output is always cohesive, no matter what combination of inputs it receives.

### Design Rules (Examples)

These are the kinds of cross-cutting adjustments the harmonizer makes:

**Color coherence:**
- Dark + warm → gray scale shifts to `stone`/`neutral` (not `slate`/`zinc`)
- Dark + cool → gray scale shifts to `slate`/`gray`
- Light + warm → cream/ivory backgrounds, not pure white
- Accent color saturation adjusts to the mode: more saturated on dark (needs to pop against dark bg), slightly desaturated on light (avoids feeling garish)
- Muted accent preference → accent is still present but at lower chroma; the system auto-generates a secondary accent at 60% saturation for hover states

**Spatial harmony:**
- Compact + rounded → border-radius capped at `md` (pill shapes in tight spaces look broken)
- Spacious + sharp → generous inner padding prevents the layout from feeling sterile
- Compact density scales `font-size` down proportionally and tightens `line-height`
- Spacious density increases `gap` between sections, not just padding inside them

**Typographic relationships:**
- Monospace font → letter-spacing tightens slightly, line-height increases to compensate for the wider character width
- Sans-serif + bold weight → heavier font-weight for headings (700), because clean sans at 600 can feel timid
- Sans-serif + subtle weight → lighter font-weight for headings (500), body stays 400
- Font size scale ratio changes with density: compact uses a tighter type scale (1.2), spacious uses a more dramatic one (1.333)

**Visual weight coherence:**
- Bold + dark → borders use a lighter shade (e.g., `border-slate-600` not `border-slate-800`) for visibility
- Bold + light → borders can be darker and thinner, they're already visible
- Subtle + dark → rely on surface-color differentiation instead of borders; card bg is a shade lighter than page bg
- Subtle + light → thin 1px borders in very light gray; shadows are nearly invisible
- Shadow color adapts to mode: dark mode uses colored/translucent shadows (not pure black, which disappears); light mode uses standard gray shadows

**Layout integration:**
- Card-based + bold → visible card borders, elevated shadow
- Card-based + subtle → no border, very faint shadow or just background color shift
- Flat + compact → uses horizontal rules or whitespace to separate sections
- Flat + spacious → generous whitespace alone creates visual grouping

**Contrast as a modifier:**
- High contrast adjusts the delta between foreground/background, border/surface, and primary/muted — it doesn't just make things darker or lighter
- Low contrast brings surfaces closer together in lightness, softens borders to near-invisible, makes the whole UI feel more blended
- Contrast preference also affects text: high contrast = pure black/white text; low contrast = slightly muted text colors

**Animation coherence:**
- Snappy → `150ms` transitions, `ease-out`, no overshoot
- Smooth → `300ms` transitions, `cubic-bezier(0.34, 1.56, 0.64, 1)` (spring), subtle scale transforms on hover

### Why This Works

Every combination the user can pick has a valid path through the rules. There's no "bad" combination because the harmonizer adjusts tokens relative to each other, not in isolation. Dark + warm + compact + monospace + bold produces a *different* shade of warm gray and a *different* border weight than dark + warm + spacious + sans-serif + subtle — because the rules understand those relationships.

The output space is continuous, not discrete. There aren't 8 possible themes — there are hundreds, all valid.

---

## Duel Rounds

Each round presents two visual cards. The cards are **rendered UI mockups** (not images), built with inline Tailwind classes so they look real and responsive. Each card shows a mini-component preview (a card, a button, a nav bar) styled according to that option.

The preview cards should show the choice **in context** — not just a color swatch, but a small piece of UI that demonstrates what the choice actually feels like. The "dark" card shows a full mini-UI on a dark background, not just a black rectangle.

### Round Definitions

| # | Question | Option A | Option B | Preference captured |
|---|----------|----------|----------|---------------------|
| 1 | **Set the mood** | Dark, immersive interface | Bright, open interface | `colorMode: 'dark' \| 'light'` |
| 2 | **Pick a temperature** | Cool tones (steel, blue, slate) | Warm tones (amber, cream, stone) | `temperature: 'cool' \| 'warm'` |
| 3 | **How should it pop?** | Vibrant, saturated accent | Muted, understated accent | `accentIntensity: 'vibrant' \| 'muted'` |
| 4 | **How much breathing room?** | Packed tight — every pixel counts | Room to breathe — generous whitespace | `density: 'compact' \| 'spacious'` |
| 5 | **Shape the edges** | Crisp, sharp corners | Soft, rounded corners | `radius: 'sharp' \| 'rounded'` |
| 6 | **Pick your typeface** | Clean sans-serif | Code-forward monospace | `typeface: 'sans' \| 'mono'` |
| 7 | **Visual confidence** | Bold: solid buttons, strong borders | Light touch: ghost buttons, thin lines | `weight: 'bold' \| 'subtle'` |
| 8 | **Content structure** | Distinct cards and sections | Seamless, flowing content | `layout: 'cards' \| 'flat'` |
| 9 | **How lively?** | Snappy — quick and crisp | Smooth — gentle and springy | `motion: 'snappy' \| 'smooth'` |
| 10 | **Contrast** | High — strong separation | Low — blended and soft | `contrast: 'high' \| 'low'` |

### Bonus rounds (if build still running):

| # | Question | Option A | Option B | Preference captured |
|---|----------|----------|----------|---------------------|
| 11 | **Icon language** | Outlined / line icons | Filled / solid icons | `iconStyle: 'outlined' \| 'filled'` |
| 12 | **Call to action** | Solid filled buttons | Outlined / ghost buttons | `buttonStyle: 'filled' \| 'ghost'` |

---

## Data Model

### DesignPreferences — the raw user input

```typescript
// The user's raw choices — each round captures one dimension
interface DesignPreferences {
  colorMode: 'dark' | 'light';
  temperature: 'cool' | 'warm';
  accentIntensity: 'vibrant' | 'muted';
  density: 'compact' | 'spacious';
  radius: 'sharp' | 'rounded';
  typeface: 'sans' | 'mono';
  weight: 'bold' | 'subtle';
  layout: 'cards' | 'flat';
  motion: 'snappy' | 'smooth';
  contrast: 'high' | 'low';
  // Bonus (optional)
  iconStyle?: 'outlined' | 'filled';
  buttonStyle?: 'filled' | 'ghost';
}

// Track each round's choice for undo/resume
interface StyleChoice {
  roundId: string;         // key of DesignPreferences, e.g. "colorMode"
  choice: 'a' | 'b';
  skipped: boolean;
}
```

### StyleProfile — the harmonized output

```typescript
interface StyleProfile {
  id: string;
  preferences: DesignPreferences;          // what the user picked
  choices: StyleChoice[];                   // round-by-round log
  tailwindConfig: TailwindThemeOverrides;   // harmonized output
  designPhilosophy: string;                // human-readable summary for Claude Code prompt
  completedAt: string;
  appliedAt?: string;
}
```

### TailwindThemeOverrides — what gets applied

```typescript
interface TailwindThemeOverrides {
  colors: {
    background: string;
    foreground: string;
    primary: string;
    primaryForeground: string;
    accent: string;
    accentForeground: string;
    muted: string;
    mutedForeground: string;
    border: string;
    card: string;
    cardForeground: string;
    destructive: string;
    success: string;
  };
  borderRadius: {
    DEFAULT: string;
    lg: string;
    sm: string;
  };
  fontFamily: {
    sans: string[];
    mono: string[];
  };
  fontSize: {
    base: string;
    scaleRatio: number;     // e.g. 1.2 for compact, 1.333 for spacious
  };
  spacing: {
    unit: string;
    sectionGap: string;
    cardPadding: string;
    inputPadding: string;
  };
  boxShadow: {
    sm: string;
    DEFAULT: string;
    lg: string;
  };
  borderWidth: {
    DEFAULT: string;
    card: string;
  };
  transitionDuration: {
    fast: string;
    DEFAULT: string;
  };
  transitionTimingFunction: {
    DEFAULT: string;
  };
}
```

### Project model additions

```typescript
interface Project {
  // ... existing fields
  styleProfile?: StyleProfile;
}
```

---

## Component Architecture

### New components

| Component | Responsibility |
|-----------|---------------|
| `StyleDuel.tsx` | Main container. Manages round progression, tracks choices, shows progress dots. |
| `DuelCard.tsx` | Single option card. Renders a live mini-UI preview using the option's Tailwind classes. Self-contained — just receives theme tokens as props. |
| `DuelRound.tsx` | One round: title, two DuelCards side by side, skip button. Handles selection animation. |
| `StyleSummary.tsx` | Post-duel summary. Shows all choices, a combined live preview, and confirm/redo buttons. |
| `StylePreviewMockup.tsx` | Small rendered mockup (nav + card + button + input) that applies the full derived theme. Used in the summary screen. |

### Integration with BuildScreen

The Style Duel appears as a **tab** alongside the existing Build and Plan tabs in BuildScreen:

```
[ Build ]  [ Plan ]  [ Style ]
```

- The **Style** tab is highlighted/pulsing when the user hasn't completed it yet
- A small badge shows "New" or progress ("4/10")
- Once completed, the tab shows a checkmark
- The duel state persists across tab switches

---

## The Harmonizer: `harmonize(preferences) → theme`

This is the core of the feature — a pure function that takes raw `DesignPreferences` and produces a complete, cohesive `TailwindThemeOverrides`. It encodes design principles as code.

### Implementation approach

```typescript
function harmonize(prefs: DesignPreferences): {
  theme: TailwindThemeOverrides;
  philosophy: string;
} {
  // 1. Resolve the gray palette (depends on mode + temperature)
  const grayScale = resolveGrayScale(prefs.colorMode, prefs.temperature);

  // 2. Resolve accent colors (depends on mode + temperature + intensity)
  const accent = resolveAccent(prefs.colorMode, prefs.temperature, prefs.accentIntensity);

  // 3. Build the color system (depends on mode + gray + accent + contrast)
  const colors = buildColorSystem(prefs.colorMode, grayScale, accent, prefs.contrast);

  // 4. Resolve spatial tokens (density + radius interact)
  const spatial = resolveSpatial(prefs.density, prefs.radius);

  // 5. Resolve typography (typeface + density interact)
  const type = resolveTypography(prefs.typeface, prefs.density);

  // 6. Resolve visual weight (weight + mode + layout interact)
  const chrome = resolveChrome(prefs.weight, prefs.colorMode, prefs.layout, grayScale);

  // 7. Resolve motion
  const motion = resolveMotion(prefs.motion);

  // 8. Generate human-readable philosophy summary
  const philosophy = describePhilosophy(prefs);

  return {
    theme: { colors, ...spatial, ...type, ...chrome, ...motion },
    philosophy,
  };
}
```

### Example: `resolveGrayScale`

```typescript
function resolveGrayScale(mode: 'dark' | 'light', temp: 'cool' | 'warm') {
  // Tailwind gray families, selected by temperature
  // Cool → slate (blue undertone) or gray (neutral-cool)
  // Warm → stone (yellow undertone) or neutral (balanced warm)
  if (temp === 'cool') {
    return mode === 'dark'
      ? { bg: 'slate-950', surface: 'slate-900', border: 'slate-700', muted: 'slate-400', fg: 'slate-50' }
      : { bg: 'slate-50', surface: 'white', border: 'slate-200', muted: 'slate-500', fg: 'slate-900' };
  } else {
    return mode === 'dark'
      ? { bg: 'stone-950', surface: 'stone-900', border: 'stone-700', muted: 'stone-400', fg: 'stone-50' }
      : { bg: 'stone-50', surface: 'white', border: 'stone-200', muted: 'stone-500', fg: 'stone-900' };
  }
}
```

### Example: `resolveSpatial` (where cross-cutting rules live)

```typescript
function resolveSpatial(density: 'compact' | 'spacious', radius: 'sharp' | 'rounded') {
  // KEY RULE: radius scales DOWN in compact mode
  // Pill shapes (rounded-full) in tight spaces looks broken,
  // so compact + rounded caps at 'md', while spacious + rounded goes to 'xl'
  const radiusMap = {
    'compact-sharp':   { DEFAULT: '0.125rem', lg: '0.25rem',  sm: '0' },
    'compact-rounded': { DEFAULT: '0.375rem', lg: '0.5rem',   sm: '0.25rem' },   // capped
    'spacious-sharp':  { DEFAULT: '0.25rem',  lg: '0.375rem', sm: '0.125rem' },
    'spacious-rounded':{ DEFAULT: '0.75rem',  lg: '1rem',     sm: '0.5rem' },     // full expression
  };

  const spacingMap = {
    compact:  { unit: '0.25rem', sectionGap: '1rem',   cardPadding: '0.75rem', inputPadding: '0.375rem 0.625rem' },
    spacious: { unit: '0.5rem',  sectionGap: '2.5rem', cardPadding: '1.5rem',  inputPadding: '0.625rem 1rem' },
  };

  return {
    borderRadius: radiusMap[`${density}-${radius}`],
    spacing: spacingMap[density],
  };
}
```

### `describePhilosophy` — human-readable design intent

This generates a prose summary that gets passed to Claude Code alongside the tokens. It helps Claude understand the *intent*, not just the values, so it can make judgment calls on edge cases.

```typescript
function describePhilosophy(prefs: DesignPreferences): string {
  const mode = prefs.colorMode === 'dark' ? 'dark, immersive' : 'bright, open';
  const temp = prefs.temperature === 'warm' ? 'warm and inviting' : 'cool and professional';
  const feel = prefs.density === 'compact' ? 'information-dense and efficient' : 'spacious and breathable';
  const edges = prefs.radius === 'rounded' ? 'soft, rounded edges' : 'crisp, sharp edges';
  const voice = prefs.weight === 'bold' ? 'confident and prominent' : 'subtle and understated';

  return `This app uses a ${mode} interface with ${temp} tones. ` +
    `The layout is ${feel} with ${edges}. ` +
    `UI elements are ${voice}. ` +
    `Typography is ${prefs.typeface === 'mono' ? 'monospace-forward, giving a technical feel' : 'clean sans-serif for broad readability'}. ` +
    `Transitions are ${prefs.motion === 'snappy' ? 'quick and crisp' : 'smooth with gentle easing'}. ` +
    `Contrast is ${prefs.contrast === 'high' ? 'high — elements are clearly separated' : 'low — surfaces blend softly into each other'}.`;
}
```

### Defaults for skipped rounds

If the user skips a round, the harmonizer uses a sensible default:

| Dimension | Default | Why |
|-----------|---------|-----|
| colorMode | `light` | Safer for accessibility, most common |
| temperature | `cool` | More neutral / universally acceptable |
| accentIntensity | `vibrant` | Users generally want their accent to stand out |
| density | `spacious` | Better for first-time users, less overwhelming |
| radius | `rounded` | Current design trend, feels friendlier |
| typeface | `sans` | Broadest readability |
| weight | `subtle` | Harder to get wrong; bold requires more careful tuning |
| layout | `cards` | More structured, easier for Claude to implement |
| motion | `smooth` | Feels more polished |
| contrast | `high` | Better accessibility |

---

## Applying the Theme (Final Build Task)

When the user confirms their style profile AND all build tasks are complete, a final task is enqueued:

**Task title:** "Apply design theme to project"

**Claude Code prompt:**
```
Apply the following design system to this project.

Design philosophy:
{styleProfile.designPhilosophy}

Tailwind theme configuration to add to tailwind.config.js theme.extend:
{JSON of styleProfile.tailwindConfig}

Instructions:
1. Update tailwind.config.js with the theme overrides above
2. Update component classes to use the new design tokens consistently
3. Ensure all pages feel cohesive — this is a unified design system, not
   piecemeal changes. Every screen should feel like it belongs to the same product.
4. If the project uses CSS variables, update those to match
5. Add any required font imports (Google Fonts link or @font-face)
6. Use the "Design philosophy" description above to guide judgment calls —
   when you're not sure how to style something, refer back to the intent.

Do NOT change any functionality. Only modify visual styling.
```

This task:
- Runs after all feature tasks complete
- Uses the same build pipeline (branch, build, commit, review, merge)
- Is skippable — user can choose to apply styles later or not at all

---

## State Management

### New store additions

```typescript
// In AppState interface
styleProfile: StyleProfile | null;
styleDuelProgress: number;  // current round index (0-based)

// Actions
setStyleProfile: (profile: StyleProfile) => void;
saveStyleProfile: () => Promise<void>;
loadStyleProfile: () => Promise<void>;
advanceStyleDuel: (choice: StyleChoice) => void;
resetStyleDuel: () => void;
```

### Storage

Follow the existing pattern:
- IPC handler in `electron/main.ts`
- Bridge in `electron/preload.ts`
- Storage methods in `electron/services/storage.ts`
- Save as `style-profile.json` inside the project directory

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| User doesn't complete duel before build finishes | Show a prompt: "Finish your style choices?" with option to skip entirely. No theme task is enqueued if skipped. |
| User completes duel but wants to redo | "Redo" button on summary. Resets choices and starts over. |
| Build has 0 tasks (edge case) | Don't show the Style tab. |
| User returns to project later | Load saved styleProfile. Show summary view if completed, or resume from where they left off. |
| Style task fails | Same error handling as any other build task. User can retry or skip. |
| Project already has custom styles | The Claude Code prompt handles this — it merges/overwrites. Note in summary: "This will update your existing styles." |

---

## Implementation Order

1. **Types & data model** — Add `DesignPreferences`, `StyleChoice`, `StyleProfile`, `TailwindThemeOverrides` to `src/types/index.ts`
2. **Harmonization engine** — The `harmonize()` function and all its sub-resolvers. This is the core of the feature. Write it as a pure function in `src/utils/designHarmonizer.ts` with unit tests for key cross-cutting rules.
3. **Storage layer** — IPC + storage methods for style profile persistence
4. **Store actions** — Zustand state + actions for duel progression
5. **DuelCard + DuelRound** — The core visual components (most of the fun is here)
6. **StyleDuel container** — Round management, progress tracking
7. **Round definitions** — The 10-12 round configs with their preview components
8. **StyleSummary + StylePreviewMockup** — Post-duel confirmation with live preview
9. **BuildScreen integration** — Add as a tab, wire up the "apply theme" task
10. **Test runner updates** — Add new state arrays to cleanup in E2ETestRunner + FlowTestRunner

---

## Open Questions

- **Should the duel auto-start** when the build begins, or wait for the user to click the Style tab? (Recommendation: gentle nudge animation after 5s, but don't force it.)
- **Should we offer a "surprise me" option** that randomizes all preferences and shows the harmonized result? Low effort, fun for indecisive users. They can redo if they don't like it.
- **Live preview during the duel?** As the user makes choices, should the preview mockup at the bottom of the screen update in real-time to show the harmonized theme *so far* (with defaults for remaining rounds)? This would let them see their design system taking shape. Could be very compelling but adds complexity.
- **Font loading** — Non-system fonts (Inter, JetBrains Mono, etc.) in the duel card previews: Google Fonts for the preview, then the Claude Code task adds them to the actual project.
- **How detailed should the harmonizer be in v1?** The rules above are comprehensive. Could ship with simpler rules first (mode + temperature → palette, density → spacing, radius standalone) and add cross-cutting refinements iteratively.
- **Accent color hue selection?** Currently temperature drives the hue family (cool → blue/indigo, warm → amber/orange). Should we add a round specifically for hue? Or is the temperature + intensity combo enough?
