import { Injectable } from '@angular/core';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { db } from '../firebase';
import type { AppUser } from './auth.service';

export interface ActivityLog {
  id?: string;
  userId: string;
  appName: string;
  windowTitle: string;
  url?: string;
  category: 'productive' | 'unproductive' | 'neutral';
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
}

function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate();
  }
  return new Date(val as number);
}

@Injectable({ providedIn: 'root' })
export class ActivityService {
  async getActivityForUser(
    userId: string,
    from: Date,
    to: Date
  ): Promise<ActivityLog[]> {
    const col = collection(db, 'activities');
    const q = query(
      col,
      where('userId', '==', userId),
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
        appName: data['appName'] ?? '',
        windowTitle: data['windowTitle'] ?? '',
        url: data['url'],
        category: data['category'] ?? 'neutral',
        startTime: toDate(data['startTime']),
        endTime: toDate(data['endTime']),
        durationSeconds: data['durationSeconds'] ?? 0,
      } as ActivityLog;
    });
  }

  async getTeamActivitySummary(from: Date, to: Date): Promise<ActivityLog[]> {
    const col = collection(db, 'activities');
    const q = query(
      col,
      where('startTime', '>=', Timestamp.fromDate(from)),
      where('startTime', '<=', Timestamp.fromDate(to)),
      orderBy('startTime', 'desc'),
      limit(1000)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: data['userId'],
        appName: data['appName'] ?? '',
        windowTitle: data['windowTitle'] ?? '',
        url: data['url'],
        category: data['category'] ?? 'neutral',
        startTime: toDate(data['startTime']),
        endTime: toDate(data['endTime']),
        durationSeconds: data['durationSeconds'] ?? 0,
      } as ActivityLog;
    });
  }

  listenActivityForUser(
    userId: string,
    from: Date,
    to: Date,
    callback: (logs: ActivityLog[]) => void
  ): Unsubscribe {
    const q = query(
      collection(db, 'activities'),
      where('userId', '==', userId),
      where('startTime', '>=', Timestamp.fromDate(from)),
      where('startTime', '<=', Timestamp.fromDate(to)),
      orderBy('startTime', 'desc'),
      limit(500)
    );
    return onSnapshot(q, (snap) => {
      const logs = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: data['userId'],
          appName: data['appName'] ?? '',
          windowTitle: data['windowTitle'] ?? '',
          url: data['url'],
          category: data['category'] ?? 'neutral',
          startTime: toDate(data['startTime']),
          endTime: toDate(data['endTime']),
          durationSeconds: data['durationSeconds'] ?? 0,
        } as ActivityLog;
      });
      callback(logs);
    });
  }

  listenTeamActivity(
    from: Date,
    to: Date,
    callback: (logs: ActivityLog[]) => void
  ): Unsubscribe {
    const q = query(
      collection(db, 'activities'),
      where('startTime', '>=', Timestamp.fromDate(from)),
      where('startTime', '<=', Timestamp.fromDate(to)),
      orderBy('startTime', 'desc'),
      limit(1000)
    );
    return onSnapshot(q, (snap) => {
      const logs = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: data['userId'],
          appName: data['appName'] ?? '',
          windowTitle: data['windowTitle'] ?? '',
          url: data['url'],
          category: data['category'] ?? 'neutral',
          startTime: toDate(data['startTime']),
          endTime: toDate(data['endTime']),
          durationSeconds: data['durationSeconds'] ?? 0,
        } as ActivityLog;
      });
      callback(logs);
    });
  }

  getDailyProductivityScore(logs: ActivityLog[]): number {
    if (logs.length === 0) return 0;
    let productive = 0;
    let total = 0;
    for (const log of logs) {
      total += log.durationSeconds;
      if (log.category === 'productive') productive += log.durationSeconds;
    }
    if (total === 0) return 0;
    return Math.round((productive / total) * 100);
  }

  groupByApp(
    logs: ActivityLog[]
  ): { appName: string; totalSeconds: number; category: ActivityLog['category'] }[] {
    const totalMap = new Map<string, number>();
    const categoryMap = new Map<
      string,
      { productive: number; unproductive: number; neutral: number }
    >();
    for (const log of logs) {
      const key = log.appName || 'Unknown';
      totalMap.set(key, (totalMap.get(key) ?? 0) + log.durationSeconds);
      const cat = categoryMap.get(key) ?? {
        productive: 0,
        unproductive: 0,
        neutral: 0,
      };
      if (log.category === 'productive') cat.productive += log.durationSeconds;
      else if (log.category === 'unproductive')
        cat.unproductive += log.durationSeconds;
      else cat.neutral += log.durationSeconds;
      categoryMap.set(key, cat);
    }
    return Array.from(totalMap.entries())
      .map(([appName, totalSeconds]) => {
        const cat = categoryMap.get(appName)!;
        const category: ActivityLog['category'] =
          cat.productive >= cat.unproductive && cat.productive >= cat.neutral
            ? 'productive'
            : cat.unproductive >= cat.neutral
              ? 'unproductive'
              : 'neutral';
        return { appName, totalSeconds, category };
      })
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
      .slice(0, 10);
  }

  groupByDomain(
    logs: ActivityLog[]
  ): { domain: string; totalSeconds: number; visitCount: number; category: ActivityLog['category'] }[] {
    const domainMap = new Map<string, { totalSeconds: number; visitCount: number; categoryMap: { productive: number; unproductive: number; neutral: number } }>();

    for (const log of logs) {
      if (!log.url) continue;

      let domain = '-';
      try {
        const urlObj = new URL(log.url);
        domain = urlObj.hostname.replace(/^www\./, '');
      } catch {
        continue;
      }

      const existing = domainMap.get(domain) ?? {
        totalSeconds: 0,
        visitCount: 0,
        categoryMap: { productive: 0, unproductive: 0, neutral: 0 }
      };

      existing.totalSeconds += log.durationSeconds;
      existing.visitCount += 1;

      if (log.category === 'productive') existing.categoryMap.productive += log.durationSeconds;
      else if (log.category === 'unproductive') existing.categoryMap.unproductive += log.durationSeconds;
      else existing.categoryMap.neutral += log.durationSeconds;

      domainMap.set(domain, existing);
    }

    return Array.from(domainMap.entries())
      .map(([domain, data]) => {
        const cat = data.categoryMap;
        const category: ActivityLog['category'] =
          cat.productive >= cat.unproductive && cat.productive >= cat.neutral
            ? 'productive'
            : cat.unproductive >= cat.neutral
              ? 'unproductive'
              : 'neutral';
        return { domain, totalSeconds: data.totalSeconds, visitCount: data.visitCount, category };
      })
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
      .slice(0, 20);
  }

  groupByHour(
    logs: ActivityLog[],
    date: Date
  ): { hour: number; productiveSeconds: number; totalSeconds: number }[] {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const buckets = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      productiveSeconds: 0,
      totalSeconds: 0,
    }));

    for (const log of logs) {
      const start = log.startTime.getTime();
      const end = log.endTime.getTime();
      const logDayStart = new Date(log.startTime);
      logDayStart.setHours(0, 0, 0, 0);
      if (logDayStart.getTime() !== dayStart.getTime()) continue;

      for (let h = 0; h < 24; h++) {
        const hourStart = new Date(dayStart);
        hourStart.setHours(h, 0, 0, 0);
        const hourEnd = new Date(hourStart);
        hourEnd.setHours(h + 1, 0, 0, 0);
        const overlapStart = Math.max(start, hourStart.getTime());
        const overlapEnd = Math.min(end, hourEnd.getTime());
        if (overlapStart < overlapEnd) {
          const secs = (overlapEnd - overlapStart) / 1000;
          buckets[h].totalSeconds += secs;
          if (log.category === 'productive') buckets[h].productiveSeconds += secs;
        }
      }
    }
    return buckets;
  }
  /**
   * Aggregates logs into daily buckets between `from` and `to` (inclusive).
   * Returns one entry per day with productive/total seconds.
   */
  groupByDay(
    logs: ActivityLog[],
    from: Date,
    to: Date
  ): { date: Date; label: string; productiveSeconds: number; totalSeconds: number }[] {
    // Build a bucket for each calendar day in the range
    const buckets: { date: Date; label: string; productiveSeconds: number; totalSeconds: number }[] = [];
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);

    while (cursor <= end) {
      const label = cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      buckets.push({ date: new Date(cursor), label, productiveSeconds: 0, totalSeconds: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    for (const log of logs) {
      const dayKey = new Date(log.startTime);
      dayKey.setHours(0, 0, 0, 0);
      const bucket = buckets.find(b => b.date.getTime() === dayKey.getTime());
      if (!bucket) continue;
      bucket.totalSeconds += log.durationSeconds;
      if (log.category === 'productive') bucket.productiveSeconds += log.durationSeconds;
    }

    return buckets;
  }
}

export async function seedFakeActivities(userId: string): Promise<void> {
  const { collection, addDoc, Timestamp } = await import('firebase/firestore');
  const { db } = await import('../firebase');

  const apps = [
    { name: 'VS Code', category: 'productive' as const },
    { name: 'Chrome', category: 'productive' as const },
    { name: 'Slack', category: 'neutral' as const },
    { name: 'YouTube', category: 'unproductive' as const },
    { name: 'Outlook', category: 'productive' as const },
    { name: 'Terminal', category: 'productive' as const },
    { name: 'Figma', category: 'productive' as const },
    { name: 'Twitter', category: 'unproductive' as const },
  ];

  const col = collection(db, 'activities');
  const now = new Date();

  for (let i = 0; i < 50; i++) {
    const app = apps[i % apps.length];
    const start = new Date(now);
    start.setHours(start.getHours() - (i % 8));
    start.setMinutes(start.getMinutes() - (i * 7));
    const duration = 60 + Math.floor(Math.random() * 600);
    const end = new Date(start.getTime() + duration * 1000);

    await addDoc(col, {
      userId,
      appName: app.name,
      windowTitle: `${app.name} — Window ${i}`,
      category: app.category,
      startTime: Timestamp.fromDate(start),
      endTime: Timestamp.fromDate(end),
      durationSeconds: duration,
    });
  }
  console.log('Seeded 50 fake activity logs for', userId);
}
