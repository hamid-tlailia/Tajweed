import type { Metadata, Viewport } from 'next';
import DeviceGuards from '@/components/DeviceGuards';
import PWARegister from '@/components/PWARegister';
import './globals.css';

export const metadata: Metadata = {
  title: 'تَحَقُّق — تعلّم التجويد وسجّل تلاوتك بثقة',
  description:
    'تطبيق عربي للتدريب على تلاوة القرآن بالتجويد: يسمع تلاوتك على جهازك دون إنترنت، ويعرض لك أحكام المدود والغنن والراءات وغيرها لكل كلمة مع تقييم نطقك لها.',
};

export const viewport: Viewport = {
  themeColor: '#070B10',
  width: 'device-width',
  initialScale: 1,
  // لا تكبير بالأصابع ولا بالفأرة: واجهة التطبيق ثابتة المقياس (يُكمَّل في DeviceGuards)
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

const FAVICON =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><rect x='9' y='9' width='30' height='30' rx='7' transform='rotate(45 24 24)' fill='%23070B10' stroke='%23D4AF37' stroke-width='2.5'/><text x='24' y='31' font-size='17' text-anchor='middle' fill='%23E8C766' font-family='serif'>ت</text></svg>";

/**
 * يُطبَّق الثيم المحفوظ قبل أول طلاء (بلا وميض): يقرأ الإعدادات من localStorage
 * ويضع صنف theme-day على <html> ويضبط لون شريط المتصفح قبل أن يظهر أي محتوى.
 */
const THEME_INIT = `(function(){try{var s=JSON.parse(localStorage.getItem('tahqiq-settings-v1')||'{}');if(s&&s.theme==='day'){document.documentElement.classList.add('theme-day');document.documentElement.style.colorScheme='light';var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','#F4F0E7');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html dir="rtl" lang="ar" suppressHydrationWarning>
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
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-screen overflow-x-clip bg-ink-950 font-sans text-slate-100 antialiased">
        <PWARegister />
        <DeviceGuards />
        {children}
        <div className="orientation-guard" role="dialog" aria-live="polite">
          <span className="rotate-icon" aria-hidden>
            📱
          </span>
          <p className="font-quran text-xl">أدِر هاتفك إلى الوضع الرأسي</p>
          <p className="text-sm text-slate-400">تطبيق تَحَقُّق يعمل في الوضع الرأسي فقط.</p>
        </div>
      </body>
    </html>
  );
}
