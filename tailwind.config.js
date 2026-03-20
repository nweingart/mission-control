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
      sm: '4px',
      DEFAULT: '6px',
      md: '6px',
      lg: '8px',
      xl: '12px',
      '2xl': '16px',
      '3xl': '24px',
      full: '9999px',
    },
    boxShadow: {
      none: 'none',
      sm: '0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.12)',
      DEFAULT: '0 2px 8px rgba(0,0,0,0.24), 0 1px 3px rgba(0,0,0,0.16)',
      md: '0 4px 12px rgba(0,0,0,0.28), 0 2px 4px rgba(0,0,0,0.16)',
      lg: '0 10px 24px rgba(0,0,0,0.32), 0 4px 8px rgba(0,0,0,0.16)',
      xl: '0 20px 40px rgba(0,0,0,0.36)',
      '2xl': '0 25px 50px rgba(0,0,0,0.4)',
      inner: 'none',
      'focus-ring': '0 0 0 2px rgba(34,197,94,0.2)',
      'glow-green': '0 2px 16px rgba(34,197,94,0.3), 0 0 40px rgba(34,197,94,0.06)',
      'glow-red': '0 2px 16px rgba(239,68,68,0.3)',
      'glow-blue': '0 2px 16px rgba(59,130,246,0.3)',
      'glow-amber': '0 2px 16px rgba(234,179,8,0.3)',
    },
    extend: {
      fontFamily: {
        'display': ['"Inter"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        'sans': ['"Inter"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        'body': ['"JetBrains Mono"', '"IBM Plex Mono"', '"SF Mono"', '"Fira Code"', 'Consolas', 'monospace'],
        'mono': ['"JetBrains Mono"', '"IBM Plex Mono"', '"SF Mono"', '"Fira Code"', 'Consolas', 'monospace'],
      },
      colors: {
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          light: 'rgb(var(--color-surface-light) / <alpha-value>)',
          card: 'rgb(var(--color-surface-light) / <alpha-value>)',
          hover: 'rgb(var(--color-surface-hover) / <alpha-value>)',
          sidebar: 'rgb(var(--color-surface-sidebar) / <alpha-value>)',
          bright: 'rgb(var(--color-surface-bright) / <alpha-value>)',
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
        'mc-blue': {
          DEFAULT: 'rgb(var(--color-mc-blue) / <alpha-value>)',
          soft: 'rgb(var(--color-mc-blue-soft) / <alpha-value>)',
          deep: 'rgb(var(--color-mc-blue-deep) / <alpha-value>)',
        },
        'mc-red': {
          DEFAULT: 'rgb(var(--color-mc-red) / <alpha-value>)',
          soft: 'rgb(var(--color-mc-red-soft) / <alpha-value>)',
          deep: 'rgb(var(--color-mc-red-deep) / <alpha-value>)',
        },
        'mc-amber': {
          DEFAULT: 'rgb(var(--color-mc-amber) / <alpha-value>)',
          soft: 'rgb(var(--color-mc-amber-soft) / <alpha-value>)',
        },
        'mc-green': {
          DEFAULT: 'rgb(var(--color-mc-green) / <alpha-value>)',
          soft: 'rgb(var(--color-mc-green-soft) / <alpha-value>)',
          deep: 'rgb(var(--color-mc-green-deep) / <alpha-value>)',
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
      transitionDuration: {
        600: '600ms',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-out-left': 'slideOutLeft 0.25s ease-in forwards',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'pulse-hold': 'pulseHold 3s ease-in-out infinite',
        'flash-complete': 'flashComplete 0.6s ease-out',
        'mc-pulse': 'mcPulse 2s ease-in-out infinite',
        'mc-bounce': 'mcBounce 0.8s ease-in-out 3',
        'mc-blink': 'mcBlink 1.5s ease-in-out infinite',
        'mc-nod': 'mcNod 1s ease-in-out 1',
        'card-complete': 'cardComplete 0.4s ease-out',
        'sprint-complete': 'sprintComplete 0.8s ease-out',
        'hold-fill': 'holdFill 1s linear forwards',
        'particle-rise': 'particleRise 1s ease-out forwards',
        'start-flash': 'startFlash 0.5s ease-out',
        'nudge-amber': 'nudgeAmber 2s ease-in-out infinite',
        'nudge-green': 'nudgeGreen 2s ease-in-out infinite',
        'mc-wake-up': 'mcWakeUp 0.8s ease-out',
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
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideOutLeft: {
          '0%': { opacity: '1', transform: 'translateX(0)' },
          '100%': { opacity: '0', transform: 'translateX(-100%)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        pulseHold: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        flashComplete: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '50%': { opacity: '1', transform: 'scale(1.02)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        mcPulse: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(34,197,94,0.3)' },
          '50%': { boxShadow: '0 0 18px rgba(34,197,94,0.6)' },
        },
        mcBounce: {
          '0%, 100%': { transform: 'translateY(0)' },
          '30%': { transform: 'translateY(-6px)' },
          '60%': { transform: 'translateY(-3px)' },
        },
        mcBlink: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(239,68,68,0.3)' },
          '50%': { boxShadow: '0 0 18px rgba(239,68,68,0.6)' },
        },
        mcNod: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(4deg)' },
          '75%': { transform: 'rotate(-4deg)' },
        },
        cardComplete: {
          '0%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0)' },
          '40%': { boxShadow: '0 0 16px 2px rgba(34, 197, 94, 0.25)' },
          '100%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0)' },
        },
        sprintComplete: {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' },
        },
        holdFill: {
          '0%': { width: '0%' },
          '100%': { width: '100%' },
        },
        particleRise: {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-40px) scale(0.5)' },
        },
        startFlash: {
          '0%': { opacity: '1', boxShadow: '0 0 24px rgba(34, 197, 94, 0.5)' },
          '100%': { opacity: '1', boxShadow: '0 0 0 rgba(34, 197, 94, 0)' },
        },
        nudgeAmber: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(234, 179, 8, 0.2)' },
          '50%': { boxShadow: '0 0 20px rgba(234, 179, 8, 0.45)' },
        },
        nudgeGreen: {
          '0%, 100%': { boxShadow: '0 0 4px rgba(34, 197, 94, 0.15)' },
          '50%': { boxShadow: '0 0 14px rgba(34, 197, 94, 0.35)' },
        },
        mcWakeUp: {
          '0%': { transform: 'scale(1)', filter: 'grayscale(100%) brightness(0.7)' },
          '50%': { transform: 'scale(1.15)', filter: 'grayscale(0%) brightness(1.2)' },
          '100%': { transform: 'scale(1)', filter: 'grayscale(0%) brightness(1)' },
        },
      },
    },
  },
  plugins: [],
}
