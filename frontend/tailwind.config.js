import animate from 'tailwindcss-animate';

/**
 * Palette is taken straight from the Smart Life brand guideline:
 *   #1D174C deep indigo (primary)   #01C2F3 cyan (secondary)
 *   #44489D violet                  #C36BA9 orchid
 * The guideline calls for gradients and a holographic feel, hence the mesh utilities.
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#F2F1F8',
          100: '#E4E2F1',
          200: '#C6C2E0',
          300: '#9B95C6',
          400: '#6E68AC',
          500: '#44489D',
          600: '#343069',
          700: '#28224F',
          800: '#1D174C',
          900: '#141033',
          950: '#0B0820',
        },
        cyan: { brand: '#01C2F3' },
        orchid: { brand: '#C36BA9' },
        ink: '#1D174C',

        /* Semantic tokens — driven by CSS variables so one set of classes
           serves both themes. See the :root / .dark blocks in index.css. */
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        elevated: 'rgb(var(--elevated) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        fg: {
          DEFAULT: 'rgb(var(--fg) / <alpha-value>)',
          muted: 'rgb(var(--fg-muted) / <alpha-value>)',
          subtle: 'rgb(var(--fg-subtle) / <alpha-value>)',
        },
        tawal: { DEFAULT: '#0E2841', accent: '#F59042' },
      },
      fontFamily: {
        sans: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(29,23,76,.04), 0 8px 24px -12px rgba(29,23,76,.18)',
        lift: '0 2px 6px rgba(29,23,76,.06), 0 24px 48px -24px rgba(29,23,76,.35)',
        glow: '0 0 0 1px rgba(1,194,243,.25), 0 12px 32px -12px rgba(1,194,243,.45)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(120deg, #1D174C 0%, #44489D 45%, #C36BA9 75%, #01C2F3 100%)',
        'brand-soft': 'linear-gradient(140deg, #F7F6FC 0%, #EEF6FD 100%)',
        'mesh':
          'radial-gradient(at 12% 18%, rgba(195,107,169,.20) 0px, transparent 55%),' +
          'radial-gradient(at 84% 8%, rgba(1,194,243,.20) 0px, transparent 50%),' +
          'radial-gradient(at 60% 92%, rgba(68,72,157,.18) 0px, transparent 55%)',
      },
      keyframes: {
        float: {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '33%': { transform: 'translate3d(3%,-4%,0) scale(1.08)' },
          '66%': { transform: 'translate3d(-3%,3%,0) scale(.95)' },
        },
        drift: {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1.05)' },
          '50%': { transform: 'translate3d(-5%,5%,0) scale(1)' },
        },
        'gradient-pan': {
          '0%,100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'fade-up': { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(1,194,243,.55)' },
          '70%': { boxShadow: '0 0 0 12px rgba(1,194,243,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(1,194,243,0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .5s cubic-bezier(.22,1,.36,1) both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(.66,0,0,1) infinite',
        float: 'float 18s ease-in-out infinite',
        drift: 'drift 24s ease-in-out infinite',
        'gradient-pan': 'gradient-pan 8s ease infinite',
      },
    },
  },
  plugins: [animate],
};
