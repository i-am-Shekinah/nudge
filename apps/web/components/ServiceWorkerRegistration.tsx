'use client';

import { useEffect } from 'react';

// Registered on every load: iOS requires an installed service worker before
// Notification.requestPermission() can succeed, which push.ts assumes.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const { protocol } = window.location;
    // The Capacitor WebView serves from a custom scheme; push lives on the web origin.
    if (protocol !== 'http:' && protocol !== 'https:') {
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
