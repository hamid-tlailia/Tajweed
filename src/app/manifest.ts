import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'تَحَقُّق — تدريب التلاوة بالتجويد',
    short_name: 'تَحَقُّق',
    description:
      'سجّل تلاوتك واقرأ حكمها كلمةً كلمة: المدود والغنن وأحكام التجويد — صوتك يُعالَج على جهازك ولا يُرفَع إلى الإنترنت',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    lang: 'ar',
    dir: 'rtl',
    background_color: '#070B10',
    theme_color: '#070B10',
    categories: ['education', 'utilities', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
