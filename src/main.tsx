import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import App from './App.tsx';
import './index.css';

// Tag native Capacitor runtime and configure native Android status bar
if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('is-native-app');
  if (Capacitor.getPlatform() === 'android') {
    document.documentElement.classList.add('is-android-native');
    try {
      // Solid crimson red status bar across camera notch and top
      StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
      StatusBar.setBackgroundColor({ color: '#991B1B' }).catch(() => {});
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    } catch {
      /* safe fallback if plugin is unavailable */
    }
  }
}

// The service worker is for the browser/PWA only. Inside the Android app it is not needed and could serve stale files.
if (typeof window !== 'undefined' && Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
}

// No spell-check red underlines anywhere (tapping a suggestion made the keyboard close).
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', e => {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
      el.setAttribute('spellcheck', 'false');
      el.setAttribute('autocorrect', 'off');
    }
  });
}

createRoot(document.getElementById('root')!).render(<App />);

// Offline support (installable PWA). Only in production builds.
if ('serviceWorker' in navigator && import.meta.env.PROD && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* offline caching is optional; ignore registration errors */
    });
  });
}
