import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070B10',
          900: '#0B1017',
          850: '#0E141D',
          800: '#121A25',
          750: '#16202E',
          700: '#1B2637',
          600: '#24304A',
        },
        line: '#20304A',
        gold: {
          100: '#FBF3DC',
          200: '#F7EBC4',
          300: '#F1DC9B',
          400: '#E8C766',
          500: '#D4AF37',
          600: '#B08D1F',
          700: '#8A6D14',
        },
        mint: {
          300: '#6EE7B7',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
        },
        warn: {
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
        },
        danger: {
          300: '#FDA4AF',
          400: '#FB7185',
          500: '#F43F5E',
          600: '#E11D48',
        },
      },
      fontFamily: {
        quran: ['"Amiri Quran"', 'Amiri', 'Noto Naskh Arabic', 'Traditional Arabic', 'serif'],
        brand: ['Cairo', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Cairo', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(212,175,55,0.18)',
        'glow-sm': '0 0 12px rgba(212,175,55,0.14)',
      },
    },
  },
  plugins: [],
};

export default config;
