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

/**
 * الثيمات (ليلي/نهاري): كل الألوان متغيّرات CSS تُعرَّف قيمها في globals.css
 * (‏:root لليلي و html.theme-day للنهاري) — فتتبدّل الواجهة كلها بتبديل صنفٍ
 * واحد على عنصر <html> دون أي إعادة بناء، وتعمل الشفافيات (/70 وغيرها) كما هي.
 */
const varColor = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: varColor('--c-ink-950'),
          900: varColor('--c-ink-900'),
          850: varColor('--c-ink-850'),
          800: varColor('--c-ink-800'),
          750: varColor('--c-ink-750'),
          700: varColor('--c-ink-700'),
          600: varColor('--c-ink-600'),
        },
        line: varColor('--c-line'),
        gold: {
          100: varColor('--c-gold-100'),
          200: varColor('--c-gold-200'),
          300: varColor('--c-gold-300'),
          400: varColor('--c-gold-400'),
          500: varColor('--c-gold-500'),
          600: varColor('--c-gold-600'),
          700: varColor('--c-gold-700'),
        },
        mint: {
          100: varColor('--c-mint-100'),
          200: varColor('--c-mint-200'),
          300: varColor('--c-mint-300'),
          400: varColor('--c-mint-400'),
          500: varColor('--c-mint-500'),
          600: varColor('--c-mint-600'),
        },
        warn: {
          300: varColor('--c-warn-300'),
          400: varColor('--c-warn-400'),
          500: varColor('--c-warn-500'),
        },
        danger: {
          300: varColor('--c-danger-300'),
          400: varColor('--c-danger-400'),
          500: varColor('--c-danger-500'),
          600: varColor('--c-danger-600'),
        },
        slate: {
          50: varColor('--c-slate-50'),
          100: varColor('--c-slate-100'),
          200: varColor('--c-slate-200'),
          300: varColor('--c-slate-300'),
          400: varColor('--c-slate-400'),
          500: varColor('--c-slate-500'),
          600: varColor('--c-slate-600'),
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
        panel: 'var(--shadow-panel)',
        dock: 'var(--shadow-dock)',
      },
    },
  },
  plugins: [],
};

export default config;
