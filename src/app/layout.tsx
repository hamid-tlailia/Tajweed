import type { Metadata, Viewport } from 'next';
import PWARegister from '@/components/PWARegister';
import './globals.css';

export const metadata: Metadata = {
  title: 'تَحَقُّق — تعلّم التجويد وسجّل تلاوتك بثقة',
  description:
    'تطبيق عربي للتدريب على تلاوة القرآن بالتجويد: يسمع تلاوتك على جهازك دون إنترنت، ويعرض لك أحكام المدود والغنن والراءات وغيرها لكل كلمة مع تقييم نطقك لها.',
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
        <meta name="description" content="تطبيق التدريب على تجويد التلاوة — يعمل على جهازك دون رفع صوتك إلى الإنترنت" />
        {/* الخطوط محلية بالكامل: لا يُطلب أي خطٍّ من الشبكة (بلا Google Fonts)،
            فيعمل التطبيق كاملًا دون إنترنت ولا يُرسَل أي طلب خارجي عند الفتح. */}
      </head>
      <body className="min-h-screen overflow-x-clip bg-ink-950 font-sans text-slate-100 antialiased">
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
