import { Capacitor } from '@capacitor/core';

const native = Capacitor.isNativePlatform();

// The Android app always talks to the production API; the web build reads it from env.
export const API_URL = (native ? import.meta.env.VITE_NATIVE_BACKEND_URL : import.meta.env.VITE_BACKEND_URL)
    || import.meta.env.VITE_BACKEND_URL
    || 'http://localhost:3001';

export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '2.0.0';
export const IS_NATIVE = native;
export const PLATFORM = native ? 'android' : (/Android/i.test(navigator.userAgent) ? 'android-web' : 'web');
export const COOKIE_AUTH = import.meta.env.VITE_AUTH_MODE === 'cookie';
