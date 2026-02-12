/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    borderRadius: {
      none: '0',
      sm: '6px',
      DEFAULT: '8px',
      md: '8px',
      lg: '12px',
      xl: '16px',
      '2xl': '20px',
      '3xl': '28px',
      full: '9999px',
    },
    boxShadow: {
      none: 'none',
      sm: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
      DEFAULT: '0 2px 8px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)',
      md: '0 4px 12px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06)',
      lg: '0 10px 24px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.06)',
      xl: '0 20px 40px rgba(0,0,0,0.14)',
      '2xl': '0 25px 50px rgba(0,0,0,0.16)',
      inner: 'none',
      'focus-ring': '0 0 0 3px rgba(62,138,194,0.18)',
      'glow-blue': '0 2px 16px rgba(62,138,194,0.3), 0 0 40px rgba(62,138,194,0.06)',
      'glow-red': '0 2px 16px rgba(204,68,52,0.3)',
      'glow-green': '0 2px 16px rgba(68,146,86,0.3)',
      'glow-amber': '0 2px 16px rgba(192,130,42,0.3)',
    },
    extend: {
      fontFamily: {
        'display': ['"Outfit"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        'sans': ['"Outfit"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        'body': ['"IBM Plex Mono"', '"SF Mono"', '"Fira Code"', 'Consolas', 'monospace'],
        'mono': ['"IBM Plex Mono"', '"SF Mono"', '"Fira Code"', 'Consolas', 'monospace'],
      },
      colors: {
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          light: 'rgb(var(--color-surface-light) / <alpha-value>)',
          card: 'rgb(var(--color-surface-light) / <alpha-value>)',
          hover: 'rgb(var(--color-surface-hover) / <alpha-value>)',
          sidebar: 'rgb(var(--color-surface-sidebar) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',
          secondary: 'rgb(var(--color-ink-secondary) / <alpha-value>)',
          muted: 'rgb(var(--color-ink-muted) / <alpha-value>)',
          inverse: 'rgb(var(--color-ink-inverse) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          hover: 'rgb(var(--color-accent-hover) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--color-secondary) / <alpha-value>)',
          hover: 'rgb(var(--color-secondary-hover) / <alpha-value>)',
        },
        'spectrum-red': 'rgb(var(--color-spectrum-red) / <alpha-value>)',
        'spectrum-orange': 'rgb(var(--color-spectrum-orange) / <alpha-value>)',
        'spectrum-yellow': 'rgb(var(--color-spectrum-yellow) / <alpha-value>)',
        'spectrum-green': 'rgb(var(--color-spectrum-green) / <alpha-value>)',
        'spectrum-blue': 'rgb(var(--color-spectrum-blue) / <alpha-value>)',
        'spectrum-purple': 'rgb(var(--color-spectrum-purple) / <alpha-value>)',
        'houston-blue': {
          DEFAULT: 'rgb(var(--color-houston-blue) / <alpha-value>)',
          soft: 'rgb(var(--color-houston-blue-soft) / <alpha-value>)',
          deep: 'rgb(var(--color-houston-blue-deep) / <alpha-value>)',
        },
        'houston-red': {
          DEFAULT: 'rgb(var(--color-houston-red) / <alpha-value>)',
          soft: 'rgb(var(--color-houston-red-soft) / <alpha-value>)',
          deep: 'rgb(var(--color-houston-red-deep) / <alpha-value>)',
        },
        'houston-amber': {
          DEFAULT: 'rgb(var(--color-houston-amber) / <alpha-value>)',
          soft: 'rgb(var(--color-houston-amber-soft) / <alpha-value>)',
        },
        'houston-green': {
          DEFAULT: 'rgb(var(--color-houston-green) / <alpha-value>)',
          soft: 'rgb(var(--color-houston-green-soft) / <alpha-value>)',
        },
        info: 'rgb(var(--color-info) / <alpha-value>)',
        success: {
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
          hover: 'rgb(var(--color-success-hover) / <alpha-value>)',
        },
        error: 'rgb(var(--color-error) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        border: {
          DEFAULT: 'rgb(var(--color-border) / <alpha-value>)',
          subtle: 'rgb(var(--color-border-subtle) / <alpha-value>)',
          strong: 'rgb(var(--color-border-strong) / <alpha-value>)',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
