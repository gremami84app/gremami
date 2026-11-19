/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        raven: {
          bg: '#0A1128',
          bgDark: '#070C1E',
          card: '#121B2D',
          cardHover: '#18243C',
          surface: '#1A253D',
          border: '#1F2D48',
          borderLight: '#2D3E61',
          red: '#E02424',
          redHover: '#C81E1E',
          redGlow: '#FF3838',
          muted: '#8C9BB4'
        },
        btc: {
          orange: '#F7931A',
          orangeHover: '#E07D09',
          gold: '#F0B90B',
          goldDark: '#C99400'
        },
        crypto: {
          green: '#0ECB81',
          greenDark: '#0A8A56',
          muted: '#8C9BB4',
          light: '#EAECEF'
        },
        // (S09.5/S09.9) Acento dinámico con canales RGB → soporta alpha nativo
        accent: {
          DEFAULT: 'rgb(var(--accent-rgb) / <alpha-value>)',
          strong: 'var(--accent-strong)',
          soft: 'var(--accent-soft)',
          ring: 'var(--accent-ring)'
        },
        // (S09.7) Superficies semánticas: Día / Noche vía data-mode en <html>
        app: 'var(--bg-app)',
        card: 'var(--bg-card)',
        elev: 'var(--bg-elev)',
        line: 'var(--border)',
        ink1: 'var(--text-1)',
        ink2: 'var(--text-2)',
        ink3: 'var(--text-3)'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace']
      },
      // (S09.1) Design tokens: área táctil mínima accesible en móvil
      minHeight: {
        touch: '44px'
      },
      minWidth: {
        touch: '44px'
      },
      // (S06) Rampa tipográfica única: 11/12/13/15/17/22/32
      fontSize: {
        '2xs': ['11px', { lineHeight: '1.35' }],
        xs: ['12px', { lineHeight: '1.45' }],
        sm: ['13px', { lineHeight: '1.5' }],
        base: ['15px', { lineHeight: '1.5' }],
        md: ['17px', { lineHeight: '1.3' }],
        xl: ['22px', { lineHeight: '1.25' }],
        '3xl': ['32px', { lineHeight: '1.1' }]
      },
      letterSpacing: {
        tight: '-0.02em',
        tighter: '-0.03em'
      },
      borderRadius: {
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
        sheet: 'var(--radius-sheet)'
      },
      boxShadow: {
        elev1: 'var(--elev-1)',
        elev2: '0 8px 24px -8px rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.12)',
        elev3: '0 16px 40px -12px rgba(0,0,0,.45)',
        'inset-hi': 'inset 0 1px 0 rgba(255,255,255,.07)',
        elev2: 'var(--elev-2)',
        'glow-orange': '0 0 18px -2px rgba(247, 147, 26, 0.45)',
        'glow-raven': '0 0 18px -2px rgba(224, 36, 36, 0.45)',
        'glow-gold': '0 0 18px -2px rgba(240, 185, 11, 0.45)',
        'glow-green': '0 0 18px -2px rgba(14, 203, 129, 0.45)',
      }
    },
  },
  plugins: [],
}
