import { Injectable } from '@angular/core';
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { db } from '../firebase';
import { getDocsAllPages } from '../firestore/paginated-query';

export interface ShiftSession {
  id: string;
  userId: string;
  shiftDate: string;
  shiftStart: Date;
  shiftEnd: Date;
  loginTime: Date;
  logoutTime: Date;
  totalActiveSeconds: number;
  status: 'active' | 'closed';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate();
  }
  return new Date(val as number);
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

@Injectable({ providedIn: 'root' })
export class ShiftService {
  private cache = new Map<string, { data: any; ts: number }>();

  private toShiftSession(id: string, data: Record<string, unknown>): ShiftSession {
    return {
      id,
      userId: (data['userId'] as string) ?? '',
      shiftDate: (data['shiftDate'] as string) ?? '',
      shiftStart: toDate(data['shiftStart']),
      shiftEnd: toDate(data['shiftEnd']),
      loginTime: toDate(data['loginTime']),
      logoutTime: toDate(data['logoutTime']),
      totalActiveSeconds: (data['totalActiveSeconds'] as number) ?? 0,
      status: (data['status'] as 'active' | 'closed') ?? 'closed',
    };
  }

  async getShiftsForUser(userId: string, from: Date, to: Date): Promise<ShiftSession[]> {
    const fromStr = toDateStr(from);
    const toStr = toDateStr(to);
    const key = `${userId}|${fromStr}|${toStr}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now - cached.ts < 5 * 60 * 1000) {
      return cached.data;
    }

    const col = collection(db, 'shifts');
    const baseConstraints = [
      where('userId', '==', userId),
      where('shiftDate', '>=', fromStr),
      where('shiftDate', '<=', toStr),
      orderBy('shiftDate', 'desc'),
    ];
    const docs = await getDocsAllPages(col, baseConstraints);
    const mapped = docs.map((d) => this.toShiftSession(d.id, d.data() as Record<string, unknown>));
    this.cache.set(key, { data: mapped, ts: now });
    return mapped;
  }

  async getAllShifts(from: Date, to: Date): Promise<ShiftSession[]> {
    const fromStr = toDateStr(from);
    const toStr = toDateStr(to);
    const key = `TEAM|${fromStr}|${toStr}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now - cached.ts < 5 * 60 * 1000) {
      return cached.data;
    }

    const col = collection(db, 'shifts');
    const baseConstraints = [
      where('shiftDate', '>=', fromStr),
      where('shiftDate', '<=', toStr),
      orderBy('shiftDate', 'desc'),
    ];
    const docs = await getDocsAllPages(col, baseConstraints);
    const mapped = docs.map((d) => this.toShiftSession(d.id, d.data() as Record<string, unknown>));
    this.cache.set(key, { data: mapped, ts: now });
    return mapped;
  }

  listenShiftsForUser(
    userId: string,
    from: Date,
    to: Date,
    callback: (shifts: ShiftSession[]) => void
  ): Unsubscribe {
    const fromStr = toDateStr(from);
    const toStr = toDateStr(to);
    const q = query(
      collection(db, 'shifts'),
      where('userId', '==', userId),
      where('shiftDate', '>=', fromStr),
      where('shiftDate', '<=', toStr),
      orderBy('shiftDate', 'desc')
    );
    return onSnapshot(q, (snap) => {
      const shifts = snap.docs.map((d) => this.toShiftSession(d.id, d.data() as Record<string, unknown>));
      callback(shifts);
    });
  }

  async getActiveShift(userId: string): Promise<ShiftSession | null> {
    const key = `active|${userId}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now - cached.ts < 5 * 60 * 1000) {
      return cached.data;
    }

    const q = query(
      collection(db, 'shifts'),
      where('userId', '==', userId),
      where('status', '==', 'active'),
      orderBy('shiftDate', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      this.cache.set(key, { data: null, ts: now });
      return null;
    }
    const d = snap.docs[0]!;
    const mapped = this.toShiftSession(d.id, d.data() as Record<string, unknown>);
    this.cache.set(key, { data: mapped, ts: now });
    return mapped;
  }

  async getLatestShiftForUser(userId: string): Promise<ShiftSession | null> {
    const key = `latest|${userId}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now - cached.ts < 5 * 60 * 1000) {
      return cached.data;
    }

    const q = query(
      collection(db, 'shifts'),
      where('userId', '==', userId),
      orderBy('shiftDate', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      this.cache.set(key, { data: null, ts: now });
      return null;
    }
    const d = snap.docs[0]!;
    const mapped = this.toShiftSession(d.id, d.data() as Record<string, unknown>);
    this.cache.set(key, { data: mapped, ts: now });
    return mapped;
  }
}

