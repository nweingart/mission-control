# Kiln Design Directions — Brainstorm Reference

Saved so we don't lose these options. Direction 3 was chosen for initial implementation.

---

## Direction 1: "Forge" — Lean into the kiln/craft metaphor (TRIED — didn't love)

- **Palette:** Deep charcoal (`#1C1917`) + warm cream (`#FAF7F2`) + ember orange (`#E8713A`) primary + muted clay (`#A68A6B`) secondary
- **Fonts:** "Inter" or "Geist" for UI, IBM Plex Mono for code
- **Surfaces:** Almost-white with warm undertones, not parchment-yellow
- **Borders/shapes:** Small radius (4-6px), thin borders (1px), subtle warm shadows instead of bevels
- **Vibe:** Modern craft tool. Figma meets ceramics studio. Professional but warm.
- **Spectrum bar:** Single gradient ember strip (dark red -> orange -> gold)

---

## Direction 2: "Terminal Luxe" — Premium dark dev tool (warm variant)

- **Background:** Warm dark `#121110` (slightly brown-black, like soot/charcoal)
- **Accent:** Warm amber-orange (`#F59E0B`) — reads as "heat", differentiates from Linear/Vercel blue
- **Text:** White (`#F5F5F5`) primary, warm gray (`#A8A29E`) secondary — stone-toned, not cool gray
- **Cards:** `#1C1B19` with 1px `rgba(255,255,255,0.06)` border. Hover gets faint amber glow.
- **Signature:** When builds/deploys run, thin amber line pulses across top. Idle = dim warm line. Active = glow.
- **Fonts:** "Geist Sans" / "Geist Mono" or "Inter" + "JetBrains Mono"
- **Buttons:** Solid fills, no bevels. Primary = amber on charcoal. Secondary = transparent with warm-gray border. 6px radius.
- **Vibe:** A blacksmith's terminal. Dark, warm, precise.

---

## Direction 3: "Pixel Workshop" — Refined retro (SELECTED FOR IMPLEMENTATION)

Keep the retro soul but make it more cohesive and less NES-rainbow.

### Color Overhaul — duo, not rainbow:
| Role | Old | New | Hex |
|------|-----|-----|-----|
| Primary accent | NES Blue #51A5FE | Warm amber | `#D4A032` |
| Secondary accent | (none) | Slate blue | `#5B7A94` |
| Background | Parchment #F5F0E8 | Cooler parchment | `#F0ECE4` |
| Cards | #FFFDF7 | Warm white | `#FDFCF9` |
| Ink primary | #1A1A1A | (same) | `#1A1A1A` |
| Ink muted | Cool gray #7A7A7A | Warm muted | `#5C5549` |
| Error | NES Red #FE7269 | Desaturated red | `#D4453A` |
| Success | NES Green #51DF21 | Desaturated green | `#4A9E3F` |
| Border | #C4BDB0 | (same) | `#C4BDB0` |

### Typography:
- "Press Start 2P" — ONLY for app logo/wordmark and big screen titles. Never below ~14px.
- Body/UI: **"Space Grotesk"** — geometric, slightly retro, pairs well with pixel fonts. Replaces DM Sans.
- Code/terminal: **"JetBrains Mono"** — still monospace, slightly pixelated character, better readability than IBM Plex Mono at small sizes.

### Component Refinements:
- Border width: 3px -> **2px** everywhere
- Keep **zero border-radius** (retro identity)
- Softer bevels: reduce color contrast on edges (`#D0C9BD` / `#9E9588` instead of `#C4BDB0` / `#8A7E75`)
- **Kiln bar** replaces 6-color spectrum: 3-stop gradient `#8B5E3C` -> `#D4A032` -> `#E8C96A` (clay -> amber -> pale gold)

### Mood:
Pixel-art indie game settings menu. Cozy, intentional, readable.

---

## Direction 4: "Earthworks" — Organic + modern

### Full Palette:
| Role | Color | Hex |
|------|-------|-----|
| Background | Stone white | `#F2EFEB` |
| Card/Surface | Warm white | `#FAFAF8` |
| Primary text | Kiln black | `#2C2520` |
| Secondary text | Warm gray | `#78716C` |
| Primary accent | Terracotta | `#C05621` |
| Accent hover | Deep terracotta | `#9C4418` |
| Secondary accent | Sage | `#6B8065` |
| Border | Sandstone | `#D6D0C8` |
| Error | Brick red | `#B83232` |
| Success | Sage green | `#5A7A52` |
| Info | Dusty blue | `#5878A0` |

### Typography:
- **Headings:** "Plus Jakarta Sans" (700) — modern, warm
- **Body/UI:** "Plus Jakarta Sans" (400/500)
- **Code/terminal:** "JetBrains Mono" or "IBM Plex Mono"
- Alternative heading: **"Fraunces"** — variable serif, handcrafted feel

### Components:
- Solid fill buttons, 6px radius, 1px border. Primary = terracotta + white text.
- Cards: `#FAFAF8`, 1px sandstone border, 8px radius, warm shadow `0 1px 3px rgba(44,37,32,0.06)`
- Inputs: White bg, 1px sandstone border, inset shadow. Focus ring terracotta.
- **Heat Strip:** 4px bar, gradient `#2C2520` -> `#9C4418` -> `#C05621` -> `#D4873A` -> `#E8B96A`

### Signature Interactions:
- Progress bars use heat gradient (cold/dark left -> hot/bright right)
- Build phases subtly warm the background tint
- Completed states get faint golden glow

### Mood:
Architect's drafting table. Earthy, confident, distinctive.
