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

export interface Screenshot {
  id: string;
  userId: string;
  imageUrl: string;
  thumbnailUrl?: string;
  capturedAt: Date;
  appName?: string;
  windowTitle?: string;
}

function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  if (
    val &&
    typeof val === 'object' &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    return (val as { toDate: () => Date }).toDate();
  }
  return new Date(val as number);
}

@Injectable({ providedIn: 'root' })
export class ScreenshotService {
  async getScreenshotsForUser(
    userId: string,
    from: Date,
    to: Date
  ): Promise<Screenshot[]> {
    const col = collection(db, 'screenshots');
    const q = query(
      col,
      where('userId', '==', userId),
      where('capturedAt', '>=', Timestamp.fromDate(from)),
      where('capturedAt', '<=', Timestamp.fromDate(to)),
      orderBy('capturedAt', 'asc'),
      limit(500)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: data['userId'],
        imageUrl: data['imageUrl'] ?? '',
        thumbnailUrl: data['thumbnailUrl'] ?? data['imageUrl'] ?? '',
        capturedAt: toDate(data['capturedAt']),
        appName: data['appName'] ?? '',
        windowTitle: data['windowTitle'] ?? '',
      } as Screenshot;
    });
  }

  async getScreenshotsForTeam(from: Date, to: Date): Promise<Screenshot[]> {
    const col = collection(db, 'screenshots');
    const q = query(
      col,
      where('capturedAt', '>=', Timestamp.fromDate(from)),
      where('capturedAt', '<=', Timestamp.fromDate(to)),
      orderBy('capturedAt', 'asc'),
      limit(1000)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: data['userId'],
        imageUrl: data['imageUrl'] ?? '',
        thumbnailUrl: data['thumbnailUrl'] ?? data['imageUrl'] ?? '',
        capturedAt: toDate(data['capturedAt']),
        appName: data['appName'] ?? '',
        windowTitle: data['windowTitle'] ?? '',
      } as Screenshot;
    });
  }

  groupByHour(screenshots: Screenshot[]): Map<number, Screenshot[]> {
    const map = new Map<number, Screenshot[]>();
    for (let h = 0; h < 24; h++) map.set(h, []);
    for (const s of screenshots) {
      const hour = s.capturedAt.getHours();
      map.get(hour)!.push(s);
    }
    return map;
  }
}