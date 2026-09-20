import type { Config } from 'tailwindcss';

/** خطوط الواجهة: المتوفّرة في أنظمة الجوّال والحاسوب العربية أولًا */
const LOCAL_UI_STACK = [
  '"SF Arabic"',
  '"Geeza Pro"',
  '"Segoe UI"',
  '"Noto Sans Arabic"',
  'Cairo',
  'Tahoma',
  'ui-sans-serif',
  'system-ui',
  'sans-serif',
];

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
      // خطوط محلية من الجهاز نفسه — لا تُحمَّل أي خطوط من الإنترنت.
      // الترتيب يبدأ بخطوط المصحف المثبَّتة على الأنظمة (كفهد/أميري/شهرزاد)،
      // ثم خطوط النظام العربية، ثم بدائل عامة.
      fontFamily: {
        quran: [
          '"KFGQPC Uthmanic Script HAFS"',
          '"KFGQPC HAFS Uthmanic Script"',
          '"Amiri Quran"',
          'Amiri',
          '"Scheherazade New"',
          '"Noto Naskh Arabic"',
          '"Al Bayan"',
          '"Traditional Arabic"',
          '"Times New Roman"',
          'serif',
        ],
        brand: LOCAL_UI_STACK,
        sans: LOCAL_UI_STACK,
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
