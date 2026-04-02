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
    const col = collection(db, 'shifts');
    const fromStr = toDateStr(from);
    const toStr = toDateStr(to);
    const baseConstraints = [
      where('userId', '==', userId),
      where('shiftDate', '>=', fromStr),
      where('shiftDate', '<=', toStr),
      orderBy('shiftDate', 'desc'),
    ];
    const docs = await getDocsAllPages(col, baseConstraints);
    return docs.map((d) => this.toShiftSession(d.id, d.data() as Record<string, unknown>));
  }

  async getAllShifts(from: Date, to: Date): Promise<ShiftSession[]> {
    const col = collection(db, 'shifts');
    const fromStr = toDateStr(from);
    const toStr = toDateStr(to);
    const baseConstraints = [
      where('shiftDate', '>=', fromStr),
      where('shiftDate', '<=', toStr),
      orderBy('shiftDate', 'desc'),
    ];
    const docs = await getDocsAllPages(col, baseConstraints);
    return docs.map((d) => this.toShiftSession(d.id, d.data() as Record<string, unknown>));
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
    const q = query(
      collection(db, 'shifts'),
      where('userId', '==', userId),
      where('status', '==', 'active'),
      orderBy('shiftDate', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0]!;
    return this.toShiftSession(d.id, d.data() as Record<string, unknown>);
  }

  async getLatestShiftForUser(userId: string): Promise<ShiftSession | null> {
    const q = query(
      collection(db, 'shifts'),
      where('userId', '==', userId),
      orderBy('shiftDate', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0]!;
    return this.toShiftSession(d.id, d.data() as Record<string, unknown>);
  }
}

