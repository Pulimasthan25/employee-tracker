import { Injectable, inject } from '@angular/core';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, deleteUser, type User } from 'firebase/auth';
import { environment } from '../../../environments/environment';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { AppUser } from './auth.service';
import { FirebaseClaimsSyncService } from './firebase-claims-sync.service';

function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate();
  }
  return new Date(val as number);
}

function toAppUser(id: string, data: Record<string, unknown>): AppUser {
  return {
    uid: (data['uid'] as string) ?? id,
    email: (data['email'] as string) ?? '',
    displayName: (data['displayName'] as string) ?? '',
    role: (data['role'] as 'admin' | 'employee') ?? 'employee',
    teamId: data['teamId'] as string | undefined,
    active: (data['active'] as boolean) ?? true,
    screenshotIntervalSeconds: (data['screenshotIntervalSeconds'] as number) ?? 1800,
    idleThresholdSeconds:
      typeof data['idleThresholdSeconds'] === 'number'
        ? (data['idleThresholdSeconds'] as number)
        : undefined,
    shiftStartHour: typeof data['shiftStartHour'] === 'number' ? (data['shiftStartHour'] as number) : undefined,
    shiftEndHour: typeof data['shiftEndHour'] === 'number' ? (data['shiftEndHour'] as number) : undefined,
    createdAt: toDate(data['createdAt']),
  };
}

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private readonly claimsSync = inject(FirebaseClaimsSyncService);
  private cache = new Map<string, { data: AppUser[]; ts: number }>();

  async getAll(): Promise<AppUser[]> {
    const key = 'all';
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now - cached.ts < 5 * 60 * 1000) {
      return cached.data;
    }

    const col = collection(db, 'users');
    const snap = await getDocs(col);
    const mapped = snap.docs.map((d) => toAppUser(d.id, d.data() as Record<string, unknown>));

    // Sort alphabetically by name
    mapped.sort((a, b) => {
      const nameA = (a.displayName || a.email || '').toLowerCase();
      const nameB = (b.displayName || b.email || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    this.cache.set(key, { data: mapped, ts: now });
    return mapped;
  }

  invalidateCache() {
    this.cache.delete('all');
  }

  async getById(uid: string): Promise<AppUser | null> {
    const d = await getDoc(doc(db, 'users', uid));
    if (!d.exists()) return null;
    return toAppUser(d.id, d.data() as Record<string, unknown>);
  }



  async inviteEmployee(data: {
    email: string;
    displayName: string;
    teamId?: string;
    screenshotIntervalSeconds: number;
    role: 'admin' | 'employee';
    password?: string;
  }): Promise<void> {
    const userData = {
      email: data.email,
      displayName: data.displayName,
      teamId: data.teamId ?? null,
      role: data.role,
      active: true,
      screenshotIntervalSeconds: data.screenshotIntervalSeconds,
      createdAt: Timestamp.fromDate(new Date()),
    };

    if (data.password) {
      const secondaryApp = initializeApp(environment.firebase, 'SecondaryApp' + Date.now());
      const secondaryAuth = getAuth(secondaryApp);
      let createdUser: User | null = null;

      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, data.email, data.password);
        createdUser = cred.user;
        const authUid = cred.user.uid;

        // Write to Firestore while still in the cleanup-guarded block
        await setDoc(doc(db, 'users', authUid), { ...userData, uid: authUid });

        // Push Firestore role into Firebase Auth custom claims
        void this.claimsSync.syncUser(authUid);
      } catch (e: any) {
        // If Firestore write failed, cleanup the orphaned Auth account
        if (createdUser) {
          await deleteUser(createdUser).catch(() => { /* non-fatal secondary error */ });
        }

        if (e.code === 'auth/email-already-in-use') {
          throw new Error('User already exists in Authentication. Please delete them.');
        }
        throw e;
      } finally {
        await deleteApp(secondaryApp).catch(() => {});
      }
    } else {
      // Legacy path — just create Firestore doc
      const col = collection(db, 'users');
      await addDoc(col, userData);
    }

    this.invalidateCache();
  }

  async deactivate(uid: string): Promise<void> {
    await updateDoc(doc(db, 'users', uid), { active: false });
    this.invalidateCache();
  }

  async repairAgent(uid: string): Promise<void> {
    await updateDoc(doc(db, 'users', uid), { pendingCommand: 'repair' });
    this.invalidateCache();
  }

  async reactivate(uid: string): Promise<void> {
    await updateDoc(doc(db, 'users', uid), { active: true });
    this.invalidateCache();
  }

  async delete(uid: string): Promise<void> {
    const batch = writeBatch(db);

    // 1. Delete activities
    const activitiesQ = query(collection(db, 'activities'), where('userId', '==', uid));
    const activitySnaps = await getDocs(activitiesQ);
    activitySnaps.forEach((d) => batch.delete(d.ref));

    // 2. Delete screenshots
    const screenshotsQ = query(collection(db, 'screenshots'), where('userId', '==', uid));
    const screenshotSnaps = await getDocs(screenshotsQ);
    screenshotSnaps.forEach((d) => batch.delete(d.ref));

    // 3. Delete shifts
    const shiftsQ = query(collection(db, 'shifts'), where('userId', '==', uid));
    const shiftSnaps = await getDocs(shiftsQ);
    shiftSnaps.forEach((d) => batch.delete(d.ref));

    // 4. Delete user document
    batch.delete(doc(db, 'users', uid));

    // Commit all deletions
    await batch.commit();
    this.invalidateCache();
  }

  async updateScreenshotInterval(uid: string, intervalSeconds: number): Promise<void> {
    await updateDoc(doc(db, 'users', uid), {
      screenshotIntervalSeconds: intervalSeconds
    });
    this.invalidateCache();
  }

  async updateIdleThreshold(uid: string, idleThresholdSeconds: number): Promise<void> {
    await updateDoc(doc(db, 'users', uid), { idleThresholdSeconds });
    this.invalidateCache();
  }

  async updateShiftHours(uid: string, shiftStartHour: number, shiftEndHour: number): Promise<void> {
    await updateDoc(doc(db, 'users', uid), {
      shiftStartHour,
      shiftEndHour,
    });
    this.invalidateCache();
  }

  async updateTeam(uid: string, teamId: string | null): Promise<void> {
    await updateDoc(doc(db, 'users', uid), { teamId });
    this.invalidateCache();
  }
}
