import { Injectable } from '@angular/core';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export interface IdleSession {
  id: string;
  userId: string;
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
  type: 'break';
}

function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  if (val && typeof val === 'object' && 'toDate' in val) {
    return (val as { toDate: () => Date }).toDate();
  }
  return new Date(val as number);
}

@Injectable({ providedIn: 'root' })
export class IdleService {
  async getIdleSessionsForUser(
    userId: string,
    from: Date,
    to: Date
  ): Promise<IdleSession[]> {
    const q = query(
      collection(db, 'idle_sessions'),
      where('userId', '==', userId),
      where('startTime', '>=', Timestamp.fromDate(from)),
      where('startTime', '<=', Timestamp.fromDate(to)),
      orderBy('startTime', 'desc'),
      limit(200)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: data['userId'],
        startTime: toDate(data['startTime']),
        endTime: toDate(data['endTime']),
        durationSeconds: data['durationSeconds'] ?? 0,
        type: 'break',
      } as IdleSession;
    });
  }

  async getAllIdleSessions(from: Date, to: Date): Promise<IdleSession[]> {
    const q = query(
      collection(db, 'idle_sessions'),
      where('startTime', '>=', Timestamp.fromDate(from)),
      where('startTime', '<=', Timestamp.fromDate(to)),
      orderBy('startTime', 'desc'),
      limit(500)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: data['userId'],
        startTime: toDate(data['startTime']),
        endTime: toDate(data['endTime']),
        durationSeconds: data['durationSeconds'] ?? 0,
        type: 'break',
      } as IdleSession;
    });
  }

  getTotalBreakSeconds(sessions: IdleSession[]): number {
    return sessions.reduce((s, i) => s + i.durationSeconds, 0);
  }
}

