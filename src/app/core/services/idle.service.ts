import { Injectable } from '@angular/core';
import {
  collection,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { getDocsAllPages } from '../firestore/paginated-query';

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

const DEFAULT_IDLE_REPORT_THRESHOLD = 300;

export interface BreakTotalOptions {
  thresholdSeconds?: number;
  perUserThreshold?: Map<string, number>;
}

@Injectable({ providedIn: 'root' })
export class IdleService {
  private cache = new Map<string, { data: IdleSession[]; ts: number }>();

  async getIdleSessionsForUser(
    userId: string,
    from: Date,
    to: Date
  ): Promise<IdleSession[]> {
    const key = `${userId}|${from.toISOString()}|${to.toISOString()}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now - cached.ts < 5 * 60 * 1000) {
      return cached.data;
    }

    const col = collection(db, 'idle_sessions');
    const baseConstraints = [
      where('userId', '==', userId),
      where('startTime', '>=', Timestamp.fromDate(from)),
      where('startTime', '<=', Timestamp.fromDate(to)),
      orderBy('startTime', 'desc'),
    ];
    const docs = await getDocsAllPages(col, baseConstraints);
    const mapped = docs.map((d) => {
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

    this.cache.set(key, { data: mapped, ts: now });
    return mapped;
  }

  async getAllIdleSessions(from: Date, to: Date): Promise<IdleSession[]> {
    const key = `TEAM|${from.toISOString()}|${to.toISOString()}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now - cached.ts < 5 * 60 * 1000) {
      return cached.data;
    }

    const col = collection(db, 'idle_sessions');
    const baseConstraints = [
      where('startTime', '>=', Timestamp.fromDate(from)),
      where('startTime', '<=', Timestamp.fromDate(to)),
      orderBy('startTime', 'desc'),
    ];
    const docs = await getDocsAllPages(col, baseConstraints);
    const mapped = docs.map((d) => {
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

    this.cache.set(key, { data: mapped, ts: now });
    return mapped;
  }

  getTotalBreakSeconds(sessions: IdleSession[], options?: BreakTotalOptions): number {
    const perUser = options?.perUserThreshold;
    const single = options?.thresholdSeconds ?? DEFAULT_IDLE_REPORT_THRESHOLD;
    let sum = 0;
    for (const s of sessions) {
      const t = perUser?.get(s.userId) ?? single;
      if (s.durationSeconds >= t) {
        sum += s.durationSeconds;
      }
    }
    return sum;
  }
}
