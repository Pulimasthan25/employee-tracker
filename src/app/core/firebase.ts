import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, Firestore, enableIndexedDbPersistence, clearIndexedDbPersistence, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, FirebaseStorage, connectStorageEmulator } from 'firebase/storage';
import { environment } from '../../environments/environment';

const app: FirebaseApp = initializeApp(environment.firebase);

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

if (environment.useEmulators) {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8081);
  connectStorageEmulator(storage, 'localhost', 9199);
}

// Enable offline persistence
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
    } else if (err.code === 'unimplemented') {
      console.warn('The current browser does not support all of the features required to enable persistence');
    }
  });
}

/**
 * Clears the Firestore IndexedDB offline cache.
 * Call on logout to remove sensitive cached data (screenshots, activities, users)
 * from shared computers. Non-fatal — errors are silently ignored.
 */
export async function clearOfflineCache(): Promise<void> {
  try {
    await clearIndexedDbPersistence(db);
  } catch {
    // Non-fatal — db may still be running; cache will be cleared on next cold start
  }
}
