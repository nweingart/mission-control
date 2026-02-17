import type { DesignPreferences } from '../types';

export interface PreviewStyles {
  background: string;
  text: string;
  accent: string;
  accentText: string;
  border: string;
  inputBg: string;
  cardBg: string;
  fontFamily: string;
  borderRadius: string;
  shadow: string;
}

export interface DesignQuestion {
  id: keyof DesignPreferences;
  title: string;
  subtitle: string;
  optionA: { value: string; label: string; styles: PreviewStyles };
  optionB: { value: string; label: string; styles: PreviewStyles };
}

const BASE_STYLES: PreviewStyles = {
  background: '#f8f9fa',
  text: '#1a1a2e',
  accent: '#6366f1',
  accentText: '#ffffff',
  border: '#e2e8f0',
  inputBg: '#ffffff',
  cardBg: '#ffffff',
  fontFamily: 'system-ui, sans-serif',
  borderRadius: '8px',
  shadow: '0 1px 3px rgba(0,0,0,0.1)',
};

export const DESIGN_QUESTIONS: DesignQuestion[] = [
  {
    id: 'colorTemp',
    title: 'Color Palette',
    subtitle: 'What color mood fits your app?',
    optionA: {
      value: 'warm',
      label: 'Warm & Earthy',
      styles: {
        ...BASE_STYLES,
        background: '#fef7ed',
        accent: '#ea580c',
        border: '#fed7aa',
        cardBg: '#fff7ed',
        inputBg: '#fffbf5',
      },
    },
    optionB: {
      value: 'cool',
      label: 'Cool & Clean',
      styles: {
        ...BASE_STYLES,
        background: '#f0f4f8',
        accent: '#3b82f6',
        border: '#bfdbfe',
        cardBg: '#f0f9ff',
        inputBg: '#f8fafc',
      },
    },
  },
  {
    id: 'saturation',
    title: 'Color Intensity',
    subtitle: 'How bold should the colors be?',
    optionA: {
      value: 'vibrant',
      label: 'Vibrant & Bold',
      styles: {
        ...BASE_STYLES,
        accent: '#7c3aed',
        background: '#faf5ff',
        border: '#c4b5fd',
        cardBg: '#f5f3ff',
      },
    },
    optionB: {
      value: 'muted',
      label: 'Muted & Soft',
      styles: {
        ...BASE_STYLES,
        accent: '#94a3b8',
        background: '#f8fafc',
        text: '#475569',
        border: '#e2e8f0',
        cardBg: '#f1f5f9',
      },
    },
  },
  {
    id: 'typography',
    title: 'Typography',
    subtitle: 'What type style feels right?',
    optionA: {
      value: 'modern',
      label: 'Modern Sans',
      styles: {
        ...BASE_STYLES,
        fontFamily: 'Inter, system-ui, sans-serif',
      },
    },
    optionB: {
      value: 'classic',
      label: 'Classic Serif',
      styles: {
        ...BASE_STYLES,
        fontFamily: 'Georgia, "Times New Roman", serif',
      },
    },
  },
  {
    id: 'spacing',
    title: 'Layout Density',
    subtitle: 'How much breathing room?',
    optionA: {
      value: 'spacious',
      label: 'Spacious & Airy',
      styles: BASE_STYLES,
    },
    optionB: {
      value: 'compact',
      label: 'Dense & Compact',
      styles: BASE_STYLES,
    },
  },
  {
    id: 'corners',
    title: 'Border Style',
    subtitle: 'Rounded or sharp edges?',
    optionA: {
      value: 'rounded',
      label: 'Rounded & Soft',
      styles: {
        ...BASE_STYLES,
        borderRadius: '12px',
      },
    },
    optionB: {
      value: 'sharp',
      label: 'Sharp & Angular',
      styles: {
        ...BASE_STYLES,
        borderRadius: '0px',
      },
    },
  },
  {
    id: 'depth',
    title: 'Visual Depth',
    subtitle: 'Flat or elevated surfaces?',
    optionA: {
      value: 'flat',
      label: 'Flat & Minimal',
      styles: {
        ...BASE_STYLES,
        shadow: 'none',
        border: '#d1d5db',
      },
    },
    optionB: {
      value: 'elevated',
      label: 'Elevated & Layered',
      styles: {
        ...BASE_STYLES,
        shadow: '0 4px 12px rgba(0,0,0,0.15)',
        border: 'transparent',
      },
    },
  },
  {
    id: 'contrast',
    title: 'Contrast Level',
    subtitle: 'Subtle or high contrast?',
    optionA: {
      value: 'soft',
      label: 'Soft & Subtle',
      styles: {
        ...BASE_STYLES,
        text: '#64748b',
        background: '#f8fafc',
        accent: '#818cf8',
        border: '#e2e8f0',
      },
    },
    optionB: {
      value: 'bold',
      label: 'Bold & High',
      styles: {
        ...BASE_STYLES,
        text: '#0f172a',
        background: '#ffffff',
        accent: '#1d4ed8',
        border: '#1e293b',
      },
    },
  },
  {
    id: 'style',
    title: 'Surface Style',
    subtitle: 'Clean or detailed surfaces?',
    optionA: {
      value: 'minimal',
      label: 'Clean & Simple',
      styles: {
        ...BASE_STYLES,
        border: '#f1f5f9',
        shadow: 'none',
        cardBg: '#fafafa',
      },
    },
    optionB: {
      value: 'rich',
      label: 'Rich & Detailed',
      styles: {
        ...BASE_STYLES,
        border: '#c7d2fe',
        shadow: '0 2px 8px rgba(99,102,241,0.1)',
        cardBg: '#eef2ff',
        accent: '#4f46e5',
      },
    },
  },
  {
    id: 'theme',
    title: 'Default Theme',
    subtitle: 'Light or dark mode?',
    optionA: {
      value: 'light',
      label: 'Light Mode',
      styles: BASE_STYLES,
    },
    optionB: {
      value: 'dark',
      label: 'Dark Mode',
      styles: {
        ...BASE_STYLES,
        background: '#1e1e2e',
        text: '#cdd6f4',
        accent: '#89b4fa',
        accentText: '#1e1e2e',
        border: '#313244',
        inputBg: '#313244',
        cardBg: '#181825',
      },
    },
  },
  {
    id: 'vibe',
    title: 'Overall Vibe',
    subtitle: 'What personality should it have?',
    optionA: {
      value: 'professional',
      label: 'Professional',
      styles: {
        ...BASE_STYLES,
        accent: '#1e40af',
        text: '#1e293b',
        border: '#cbd5e1',
      },
    },
    optionB: {
      value: 'playful',
      label: 'Playful',
      styles: {
        ...BASE_STYLES,
        accent: '#ec4899',
        background: '#fdf2f8',
        border: '#fbcfe8',
        cardBg: '#fce7f3',
      },
    },
  },
];

const PREF_DESCRIPTIONS: Record<keyof DesignPreferences, Record<string, string>> = {
  colorTemp: {
    warm: 'warm (earthy oranges, ambers, warm grays)',
    cool: 'cool (blues, slates, clean whites)',
  },
  saturation: {
    vibrant: 'vibrant (rich, saturated colors)',
    muted: 'muted (desaturated, pastel tones)',
  },
  typography: {
    modern: 'modern sans-serif (use Inter or Geist Sans via @import)',
    classic: 'classic serif (use Georgia or a similar serif stack)',
  },
  spacing: {
    spacious: 'spacious (generous padding and margins)',
    compact: 'compact (tight, dense layout)',
  },
  corners: {
    rounded: 'rounded (border-radius 8-12px)',
    sharp: 'sharp (border-radius 0-2px)',
  },
  depth: {
    flat: 'flat (no box shadows, border-based separation)',
    elevated: 'elevated (use box shadows for cards and elevated elements)',
  },
  contrast: {
    soft: 'soft (low contrast, subtle differences)',
    bold: 'bold (high contrast between text and backgrounds)',
  },
  style: {
    minimal: 'minimal (clean surfaces, no gradients)',
    rich: 'rich (detailed surfaces, subtle gradients, decorative borders)',
  },
  theme: {
    light: 'light mode',
    dark: 'dark mode',
  },
  vibe: {
    professional: 'professional (polished, restrained)',
    playful: 'playful (fun, energetic, colorful)',
  },
};

export function buildDesignTaskDescription(prefs: DesignPreferences): string {
  const lines = Object.entries(prefs).map(([key, value]) => {
    const desc = PREF_DESCRIPTIONS[key as keyof DesignPreferences]?.[value] ?? value;
    const label = key.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, c => c.toUpperCase());
    return `- ${label}: ${desc}`;
  });

  return `Apply a design system based on user preferences. Update the tailwind.config (or create one) and globals.css.

Design Preferences:
${lines.join('\n')}

Requirements:
- Generate/update tailwind.config.ts with custom theme (colors, fonts, spacing, borderRadius, boxShadow)
- Generate/update globals.css with @import for chosen fonts and CSS custom properties
- Use a cohesive color palette that matches the temperature, saturation, and vibe
- Ensure sufficient contrast for accessibility
- Do NOT change any component code — only config and global styles`;
}
