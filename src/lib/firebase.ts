import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Initialize Firestore with memory cache and auto-detect long polling
// to prevent WebChannel stream race conditions and INTERNAL ASSERTION FAILED (ca9 / b815)
export const db = initializeFirestore(
  app,
  {
    localCache: memoryLocalCache(),
    experimentalAutoDetectLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId
);

export const storage = getStorage(app);
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

// Secondary app for admin to create users without being logged out
const secondaryApp = getApps().some(a => a.name === 'SecondaryApp') 
  ? getApp('SecondaryApp')
  : initializeApp(firebaseConfig, 'SecondaryApp');
export const secondaryAuth = getAuth(secondaryApp);
