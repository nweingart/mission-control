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
      'focus-ring': '0 0 0 3px rgba(91,158,201,0.18)',
      'glow-blue': '0 2px 16px rgba(91,158,201,0.3), 0 0 40px rgba(91,158,201,0.06)',
      'glow-red': '0 2px 16px rgba(224,90,79,0.3)',
      'glow-green': '0 2px 16px rgba(74,222,128,0.3)',
      'glow-amber': '0 2px 16px rgba(224,160,48,0.3)',
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
      transitionDuration: {
        600: '600ms',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-out-left': 'slideOutLeft 0.25s ease-in forwards',
        'pulse-orbit': 'pulseOrbit 2s ease-in-out infinite',
        'pulse-hold': 'pulseHold 3s ease-in-out infinite',
        'flash-landed': 'flashLanded 0.6s ease-out',
        'houston-pulse': 'houstonPulse 2s ease-in-out infinite',
        'houston-bounce': 'houstonBounce 0.8s ease-in-out 3',
        'houston-blink': 'houstonBlink 1.5s ease-in-out infinite',
        'houston-nod': 'houstonNod 1s ease-in-out 1',
        'card-landed': 'cardLanded 0.4s ease-out',
        'sprint-complete': 'sprintComplete 0.8s ease-out',
        'hold-fill': 'holdFill 1s linear forwards',
        'particle-rise': 'particleRise 1s ease-out forwards',
        'launch-flash': 'launchFlash 0.5s ease-out',
        'nudge-amber': 'nudgeAmber 2s ease-in-out infinite',
        'nudge-blue': 'nudgeBlue 2s ease-in-out infinite',
        'houston-wake-up': 'houstonWakeUp 0.8s ease-out',
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
        pulseOrbit: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        pulseHold: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        flashLanded: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '50%': { opacity: '1', transform: 'scale(1.02)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        houstonPulse: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(91,158,201,0.3)' },
          '50%': { boxShadow: '0 0 18px rgba(91,158,201,0.6)' },
        },
        houstonBounce: {
          '0%, 100%': { transform: 'translateY(0)' },
          '30%': { transform: 'translateY(-6px)' },
          '60%': { transform: 'translateY(-3px)' },
        },
        houstonBlink: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(224,90,79,0.3)' },
          '50%': { boxShadow: '0 0 18px rgba(224,90,79,0.6)' },
        },
        houstonNod: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(4deg)' },
          '75%': { transform: 'rotate(-4deg)' },
        },
        cardLanded: {
          '0%': { boxShadow: '0 0 0 0 rgba(74, 222, 128, 0)' },
          '40%': { boxShadow: '0 0 16px 2px rgba(74, 222, 128, 0.25)' },
          '100%': { boxShadow: '0 0 0 0 rgba(74, 222, 128, 0)' },
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
        launchFlash: {
          '0%': { opacity: '1', boxShadow: '0 0 24px rgba(74, 222, 128, 0.5)' },
          '100%': { opacity: '1', boxShadow: '0 0 0 rgba(74, 222, 128, 0)' },
        },
        nudgeAmber: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(224, 160, 48, 0.2)' },
          '50%': { boxShadow: '0 0 20px rgba(224, 160, 48, 0.45)' },
        },
        nudgeBlue: {
          '0%, 100%': { boxShadow: '0 0 4px rgba(91, 158, 201, 0.15)' },
          '50%': { boxShadow: '0 0 14px rgba(91, 158, 201, 0.35)' },
        },
        houstonWakeUp: {
          '0%': { transform: 'scale(1)', filter: 'grayscale(100%) brightness(0.7)' },
          '50%': { transform: 'scale(1.15)', filter: 'grayscale(0%) brightness(1.2)' },
          '100%': { transform: 'scale(1)', filter: 'grayscale(0%) brightness(1)' },
        },
      },
    },
  },
  plugins: [],
}
