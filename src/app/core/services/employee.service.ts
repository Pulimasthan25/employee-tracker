import { Injectable } from '@angular/core';
import {
  collection,
  doc,
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
  }): Promise<void> {
    const col = collection(db, 'users');
    await addDoc(col, {
      email: data.email,
      displayName: data.displayName,
      teamId: data.teamId ?? null,
      role: data.role,
      active: true,
      screenshotIntervalSeconds: data.screenshotIntervalSeconds,
      createdAt: Timestamp.fromDate(new Date()),
    });
  }

  async deactivate(uid: string): Promise<void> {
    await updateDoc(doc(db, 'users', uid), { active: false });
  }

  async updateScreenshotInterval(uid: string, intervalSeconds: number): Promise<void> {
    await updateDoc(doc(db, 'users', uid), {
      screenshotIntervalSeconds: intervalSeconds
    });
  }
}
