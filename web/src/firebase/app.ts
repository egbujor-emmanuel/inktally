// Firebase bootstrap: App Check (required by AI Logic), anonymous Auth, offline-first Firestore,
// Remote Config (model names + prompts), and the AI Logic service.
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore,
} from 'firebase/firestore';
import { fetchAndActivate, getRemoteConfig, type RemoteConfig } from 'firebase/remote-config';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import { REMOTE_DEFAULTS } from '../ai/config';

declare global {
  // App Check debug hook read by the Firebase SDK (local development only).
  var FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean | undefined;
}

function requireEnv(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name];
  if (!value) throw new Error(`Missing ${name}. Copy web/.env.example to web/.env.local and fill it in.`);
  return value;
}

const firebaseConfig = {
  apiKey: requireEnv('VITE_FIREBASE_API_KEY'),
  authDomain: requireEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: requireEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: requireEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requireEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requireEnv('VITE_FIREBASE_APP_ID'),
};

// Debug tokens are for local development only and must never ship in a production bundle.
const debugToken = import.meta.env.DEV ? import.meta.env.VITE_APPCHECK_DEBUG_TOKEN : undefined;
if (debugToken) globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;

export const app: FirebaseApp = initializeApp(firebaseConfig);

initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_SITE_KEY || 'debug-provider-only'),
  isTokenAutoRefreshEnabled: true,
});

export const auth = getAuth(app);

/** Firestore with an IndexedDB cache: marks are saved instantly offline and sync when online. */
export const db: Firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const remoteConfig: RemoteConfig = getRemoteConfig(app);
remoteConfig.defaultConfig = REMOTE_DEFAULTS;
remoteConfig.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 60_000 : 3_600_000;

export const ai: AI = getAI(app, { backend: new GoogleAIBackend() });

/** Best effort: offline teachers keep the defaults (or last fetched values). */
export async function refreshRemoteConfig(): Promise<void> {
  try { await fetchAndActivate(remoteConfig); } catch { /* offline: cached or default values stay active */ }
}

/** Resolves with the signed-in user, signing in anonymously the first time. */
export function ensureUser(): Promise<User> {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, (user) => {
      if (user) { stop(); resolve(user); return; }
      signInAnonymously(auth).catch((err: unknown) => { stop(); reject(err); });
    });
  });
}
