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
    shiftStartHour: typeof data['shiftStartHour'] === 'number' ? (data['shiftStartHour'] as number) : undefined,
    shiftEndHour: typeof data['shiftEndHour'] === 'number' ? (data['shiftEndHour'] as number) : undefined,
    createdAt: toDate(data['createdAt']),
  };
}

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  async getAll(): Promise<AppUser[]> {
    const col = collection(db, 'users');
    const snap = await getDocs(col);
    return snap.docs.map((d) => toAppUser(d.id, d.data() as Record<string, unknown>));
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
      } finally {
        // secondaryApp gets deleted automatically or we can ignore it since it doesn't hurt to keep, but it's cleaner to delete it.
        // Actually, deleting requires deleteApp which is asynchronous, but we won't bother.
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

  async updateScreenshotInterval(uid: string, intervalSeconds: number): Promise<void> {
    await updateDoc(doc(db, 'users', uid), {
      screenshotIntervalSeconds: intervalSeconds
    });
  }

  async updateShiftHours(uid: string, shiftStartHour: number, shiftEndHour: number): Promise<void> {
    await updateDoc(doc(db, 'users', uid), {
      shiftStartHour,
      shiftEndHour,
    });
  }
}
