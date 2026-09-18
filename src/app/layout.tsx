import type { Metadata, Viewport } from 'next';
import PWARegister from '@/components/PWARegister';
import './globals.css';

export const metadata: Metadata = {
  title: 'تحقيق · TAHQĪQ — محرِّك التحقق من التلاوة على الجهاز',
  description:
    'منصّة ويب للتحقق من التلاوة القرآنية عبر Whisper (WASM/ONNX) مع التراصف القسري (Teacher Forcing) وتقييم أزمنة المدود والغنن — كل المعالجة على جهازك.',
};

export const viewport: Viewport = {
  themeColor: '#070B10',
};

const FAVICON =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><rect x='9' y='9' width='30' height='30' rx='7' transform='rotate(45 24 24)' fill='%23070B10' stroke='%23D4AF37' stroke-width='2.5'/><text x='24' y='31' font-size='17' text-anchor='middle' fill='%23E8C766' font-family='serif'>ت</text></svg>";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html dir="rtl" lang="ar">
      <head>
        <link rel="icon" href={FAVICON} />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="تحقيق" />
        <meta name="theme-color" content="#070B10" />
        <meta name="description" content="محرّك التحقق من التلاوة القرآنية على الجهاز — Whisper WASM/ONNX مع التراصف القسري" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-ink-950 font-sans text-slate-100 antialiased">
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
