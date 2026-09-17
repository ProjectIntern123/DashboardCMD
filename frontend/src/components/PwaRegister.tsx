'use client';

import { useEffect } from 'react';

export default function PwaRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Register service worker immediately on client mount
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[PWA] Service Worker registered cleanly with scope:', reg.scope);

          // Listen for update checks
          reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[PWA] New version available and cached.');
                }
              };
            }
          };
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err.message);
        });
    }
  }, []);

  return null;
}
