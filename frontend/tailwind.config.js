/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#090e19',
          dim: '#090e19',
          container: '#131927',
          'container-low': '#0e131f',
          'container-high': '#191f2e',
          'container-highest': '#1f2636',
          bright: '#242c3d',
        },
        primary: {
          DEFAULT: '#99f7ff',
          dim: '#00e2ee',
          container: '#00f1fe',
          fixed: '#00f1fe',
          'fixed-dim': '#00e2ee',
        },
        secondary: {
          DEFAULT: '#22c55e',
          dim: '#16a34a',
          container: '#14532d',
          fixed: '#22c55e',
        },
        tertiary: {
          DEFAULT: '#ffd16f',
          dim: '#eeb200',
          container: '#ffbf00',
          fixed: '#ffbf00',
        },
        error: {
          DEFAULT: '#ff716c',
          dim: '#d7383b',
          container: '#9f0519',
        },
        'on-surface': {
          DEFAULT: '#e7eafb',
          variant: '#a6abba',
        },
        'on-primary': '#005f64',
        'on-secondary': '#0b5800',
        'on-tertiary': '#614700',
        'on-error': '#490006',
        outline: {
          DEFAULT: '#717583',
          variant: '#434855',
        },
        'inverse-surface': '#faf9ff',
        'inverse-primary': '#006a70',
        neon: '#5BC0BE',
        'brier-oxblood': '#A8344A',
        'brier-oxblood-light': '#7A1F2B',
        'calibration-slate': '#3A4B5C',
        'calibration-cyan': '#5BC0BE',
        'margin-ochre': '#C8893A',
        bone: '#F7F4EE',
        'press-ink': '#1C1A17',
      },
      fontFamily: {
        headline: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        body:     ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        label:    ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        serif:    ['IBM Plex Serif', 'Georgia', 'serif'],
        mono:     ['IBM Plex Mono', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        full: '9999px',
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'ticker': 'ticker 40s linear infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'ticker': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(-100%)' },
        },
      },
    },
  },
  plugins: [],
}
