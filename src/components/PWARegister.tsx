'use client';

import { useEffect } from 'react';

/** Registers the service worker (production only) to enable install + offline shell */
export default function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* offline install not critical */
      });
    };
    if (document.readyState === 'complete') register();
    else {
      window.addEventListener('load', register, { once: true });
    }
  }, []);
  return null;
}
