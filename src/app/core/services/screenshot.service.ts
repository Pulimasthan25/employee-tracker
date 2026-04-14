import { Injectable } from '@angular/core';
import {
  collection,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { getDocsAllPages } from '../firestore/paginated-query';
import { environment } from '../../../environments/environment';

export interface Screenshot {
  id: string;
  userId: string;
  imageUrl: string;
  thumbnailUrl?: string;
  storagePath?: string;
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
  private cache = new Map<string, { data: Screenshot[]; ts: number }>();
  private signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
  private readonly signedUrlTtlSeconds = 120;
  private readonly cacheDriftMs = 5_000;

  private async resolveScreenshotUrls(items: Screenshot[]): Promise<Screenshot[]> {
    const pathsToSign: string[] = [];
    const now = Date.now();
    for (const shot of items) {
      if (!shot.storagePath) continue;
      const cached = this.signedUrlCache.get(shot.storagePath);
      if (!cached || cached.expiresAt - this.cacheDriftMs <= now) {
        pathsToSign.push(shot.storagePath);
      }
    }

    if (pathsToSign.length > 0) {
      await this.signPathsInBatches(pathsToSign);
    }

    const out: Screenshot[] = [];
    for (const shot of items) {
      const imageUrl = this.getSignedUrlOrFallback(shot.storagePath, shot.imageUrl);
      out.push({
        ...shot,
        imageUrl,
        thumbnailUrl: imageUrl,
      });
    }
    return out;
  }

  private getSignedUrlOrFallback(path: string | undefined, fallback: string): string {
    if (!path) return fallback;
    const cached = this.signedUrlCache.get(path);
    if (cached) {
      return cached.url;
    }
    return fallback;
  }

  private async signPathsInBatches(paths: string[]): Promise<void> {
    const unique = [...new Set(paths)];
    const BATCH_SIZE = 100;
    const user = auth.currentUser;
    if (!user) return;

    const token = await user.getIdToken();
    const supabaseUrl = environment.supabase?.url ?? '';
    const supabaseAnonKey = environment.supabase?.anonKey ?? '';
    if (!supabaseUrl || !supabaseAnonKey) return;

    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
      const batch = unique.slice(i, i + BATCH_SIZE);
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/sign-screenshot-urls`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ paths: batch }),
        });

        if (!response.ok) {
          console.warn('Failed to fetch signed screenshot URLs:', response.status, response.statusText);
          continue;
        }

        const data = (await response.json()) as { urls?: Record<string, string>; expiresIn?: number };
        const urls = data.urls ?? {};
        const expiresIn = data.expiresIn ?? this.signedUrlTtlSeconds;
        const expiresAt = Date.now() + expiresIn * 1000;

        for (const [path, url] of Object.entries(urls)) {
          if (!url) continue;
          this.signedUrlCache.set(path, { url, expiresAt });
        }
      } catch (error) {
        console.warn('Failed to fetch signed screenshot URLs:', error);
      }
    }
  }

  async getScreenshotsForUser(
    userId: string,
    from: Date,
    to: Date
  ): Promise<Screenshot[]> {
    const key = `${userId}|${from.toISOString()}|${to.toISOString()}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now - cached.ts < 5 * 60 * 1000) {
      return cached.data;
    }

    const col = collection(db, 'screenshots');
    const baseConstraints = [
      where('userId', '==', userId),
      where('capturedAt', '>=', Timestamp.fromDate(from)),
      where('capturedAt', '<=', Timestamp.fromDate(to)),
      orderBy('capturedAt', 'asc'),
    ];
    const docs = await getDocsAllPages(col, baseConstraints);
    const mapped = docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: data['userId'],
        imageUrl: data['imageUrl'] ?? '',
        thumbnailUrl: data['thumbnailUrl'] ?? data['imageUrl'] ?? '',
        storagePath: data['storagePath'] ?? '',
        capturedAt: toDate(data['capturedAt']),
        appName: data['appName'] ?? '',
        windowTitle: data['windowTitle'] ?? '',
      } as Screenshot;
    });
    const resolved = await this.resolveScreenshotUrls(mapped);
    this.cache.set(key, { data: resolved, ts: now });
    return resolved;
  }

  async getScreenshotsForTeam(from: Date, to: Date): Promise<Screenshot[]> {
    const key = `TEAM|${from.toISOString()}|${to.toISOString()}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now - cached.ts < 5 * 60 * 1000) {
      return cached.data;
    }

    const col = collection(db, 'screenshots');
    const baseConstraints = [
      where('capturedAt', '>=', Timestamp.fromDate(from)),
      where('capturedAt', '<=', Timestamp.fromDate(to)),
      orderBy('capturedAt', 'asc'),
    ];
    const docs = await getDocsAllPages(col, baseConstraints);
    const mapped = docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: data['userId'],
        imageUrl: data['imageUrl'] ?? '',
        thumbnailUrl: data['thumbnailUrl'] ?? data['imageUrl'] ?? '',
        storagePath: data['storagePath'] ?? '',
        capturedAt: toDate(data['capturedAt']),
        appName: data['appName'] ?? '',
        windowTitle: data['windowTitle'] ?? '',
      } as Screenshot;
    });
    const resolved = await this.resolveScreenshotUrls(mapped);
    this.cache.set(key, { data: resolved, ts: now });
    return resolved;
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