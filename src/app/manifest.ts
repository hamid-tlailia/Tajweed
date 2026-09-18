import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'تحقيق · TAHQĪQ — محرِّك التحقق من التلاوة',
    short_name: 'تحقيق',
    description:
      'منصّة التحقق من التلاوة القرآنية — Whisper (WASM/ONNX) على جهازك، تراصف قسري وتقييم أزمنة المدود والغنن',
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
