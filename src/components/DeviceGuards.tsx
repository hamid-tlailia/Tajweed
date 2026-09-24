'use client';

import { useEffect } from 'react';

/**
 * حُرّاس الجهاز:
 *  - قفل الاتجاه الرأسي حيث يسمح المتصفح (التطبيق المثبَّت/ملء الشاشة على أندرويد؛
 *    ولا يسمح به iOS في المتصفح — وهناك تتكفّل طبقة التغطية في globals.css).
 *  - منع التكبير: قرصُ الأصابع (gesturestart في سفاري، ولمستان في touchmove)،
 *    وعجلة الفأرة مع Ctrl/⌘، واختصارات Ctrl/⌘ مع + − 0 — والنقرُ المزدوج يمنعه
 *    touch-action في globals.css.
 * كلّ ذلك بلا أثرٍ على التمرير العادي.
 */
export default function DeviceGuards() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // ---- الاتجاه ----
    const lockPortrait = () => {
      const so: any = (screen as any).orientation;
      if (so && typeof so.lock === 'function') {
        so.lock('portrait').catch(() => {
          /* غير مسموح خارج التطبيق المثبَّت — تتكفّل به طبقة التغطية */
        });
      }
    };
    lockPortrait();
    // بعض المتصفحات لا تقبل القفل إلا بعد إيماءة من المستخدم
    const onFirstGesture = () => {
      lockPortrait();
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
    window.addEventListener('pointerdown', onFirstGesture, { passive: true });
    window.addEventListener('keydown', onFirstGesture);

    // ---- التكبير ----
    const prevent = (e: Event) => e.preventDefault();
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (['+', '-', '=', '0', 'Add', 'Subtract'].includes(e.key) || e.code === 'NumpadAdd' || e.code === 'NumpadSubtract' || e.code === 'Numpad0') {
        e.preventDefault();
      }
    };
    document.addEventListener('gesturestart', prevent, { passive: false });
    document.addEventListener('gesturechange', prevent, { passive: false });
    document.addEventListener('gestureend', prevent, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
      document.removeEventListener('gesturestart', prevent);
      document.removeEventListener('gesturechange', prevent);
      document.removeEventListener('gestureend', prevent);
      document.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  return null;
}
