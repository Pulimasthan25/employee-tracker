import { Injectable } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
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
    this.cache.set(key, { data: mapped, ts: now });
    return mapped;
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
    let authUid: string | null = null;

    if (data.password) {
      // Initialize a secondary app so the current admin doesn't get logged out
      const secondaryApp = initializeApp(environment.firebase, 'SecondaryApp' + Date.now());
      const secondaryAuth = getAuth(secondaryApp);
      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, data.email, data.password);
        authUid = cred.user.uid;
      } catch (e: any) {
        if (e.code === 'auth/email-already-in-use') {
          throw new Error('User already exists. If you previously deleted this user from the tracker, you must also delete their account from the Console before re-inviting.');
        }
        throw e;
      } finally {
        // We could delete the secondary app here if needed
      }
    }

    const userData = {
      email: data.email,
      displayName: data.displayName,
      teamId: data.teamId ?? null,
      role: data.role,
      active: true,
      screenshotIntervalSeconds: data.screenshotIntervalSeconds,
      createdAt: Timestamp.fromDate(new Date()),
    };

    if (authUid) {
      await setDoc(doc(db, 'users', authUid), { ...userData, uid: authUid });
    } else {
      const col = collection(db, 'users');
      await addDoc(col, userData);
    }
  }

  async deactivate(uid: string): Promise<void> {
    await updateDoc(doc(db, 'users', uid), { active: false });
  }

  async repairAgent(uid: string): Promise<void> {
    await updateDoc(doc(db, 'users', uid), { pendingCommand: 'repair' });
  }

  async reactivate(uid: string): Promise<void> {
    await updateDoc(doc(db, 'users', uid), { active: true });
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
  }

  async updateScreenshotInterval(uid: string, intervalSeconds: number): Promise<void> {
    await updateDoc(doc(db, 'users', uid), {
      screenshotIntervalSeconds: intervalSeconds
    });
  }

  async updateIdleThreshold(uid: string, idleThresholdSeconds: number): Promise<void> {
    await updateDoc(doc(db, 'users', uid), { idleThresholdSeconds });
  }

  async updateShiftHours(uid: string, shiftStartHour: number, shiftEndHour: number): Promise<void> {
    await updateDoc(doc(db, 'users', uid), {
      shiftStartHour,
      shiftEndHour,
    });
  }
}
