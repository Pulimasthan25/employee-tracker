import { Injectable, inject, signal } from '@angular/core';
import {
  collection,
  query,
  onSnapshot,
  Timestamp,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase';
import { EmployeeService } from './employee.service';

export interface AgentStatus {
  userId: string;
  userName: string;
  version: string;
  platform: string;
  arch: string;
  hostname: string;
  lastSeenAt: Date | null;
  trackingPaused: boolean;
  screenshotsPaused: boolean;
  isIdle: boolean;
  lastActivityAt: string | null;
  lastScreenshotAt: string | null;
  lastError: string | null;
}

export interface LiveActivity {
  id: string;
  userId: string;
  userName: string;
  appName: string;
  windowTitle: string;
  category: 'productive' | 'unproductive' | 'neutral';
  timestamp: Date;
}

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly employeeRepo = inject(EmployeeService);

  readonly agents = signal<AgentStatus[]>([]);
  readonly liveFeed = signal<LiveActivity[]>([]);
  readonly feedLoading = signal(false);

  private unsubscribeAgents?: () => void;
  private unsubscribeFeed?: () => void;
  private initialized = false;

  /**
   * Start Firestore real-time listeners.
   * Pass a pre-built nameMap (from already-loaded employees) to avoid a
   * duplicate Firestore read. The listeners are WebSocket-based — they do NOT
   * poll; updates are pushed by Firestore automatically.
   */
  async init(nameMap?: Map<string, string>) {
    if (this.initialized) return;   // already subscribed — no-op
    this.initialized = true;
    this.feedLoading.set(true);

    const map = nameMap ?? await this.buildNameMap();
    this.listenToAgents(map);
    this.listenToFeed(map);
  }

  private async buildNameMap(): Promise<Map<string, string>> {
    const employees = await this.employeeRepo.getAll();
    return new Map(employees.map((e) => [e.uid, e.displayName || 'Unknown']));
  }

  destroy() {
    this.unsubscribeAgents?.();
    this.unsubscribeFeed?.();
    this.initialized = false;  // allow re-init on next dashboard visit
    this.feedLoading.set(false);
  }

  private listenToAgents(nameMap: Map<string, string>) {
    const col = collection(db, 'agent_status');
    this.unsubscribeAgents = onSnapshot(col, (snap) => {
      const statuses = snap.docs.map((d) => {
        const data = d.data();
        const userId = d.id;
        return {
          userId,
          userName: nameMap.get(userId) ?? 'Unknown User',
          version: data['version'] ?? 'Unknown',
          platform: data['platform'] ?? 'Unknown',
          arch: data['arch'] ?? '',
          hostname: data['hostname'] ?? '',
          lastSeenAt: data['lastSeenAt']?.toDate() ?? null,
          trackingPaused: !!data['trackingPaused'],
          screenshotsPaused: !!data['screenshotsPaused'],
          isIdle: !!data['isIdle'],
          lastActivityAt: data['lastActivityAt'],
          lastScreenshotAt: data['lastScreenshotAt'],
          lastError: data['lastError'],
        } as AgentStatus;
      });
      this.agents.set(statuses);
    });
  }

  private listenToFeed(nameMap: Map<string, string>) {
    // For live feed, we take the last 20 activities across the team
    const col = collection(db, 'activities');
    const q = query(col, orderBy('startTime', 'desc'), limit(20));

    this.unsubscribeFeed = onSnapshot(q, (snap) => {
      const feed = snap.docs.map((d) => {
        const data = d.data();
        const userId = data['userId'];
        return {
          id: d.id,
          userId,
          userName: nameMap.get(userId) ?? 'Unknown',
          appName: data['appName'] ?? 'Unknown',
          windowTitle: data['windowTitle'] ?? '',
          category: data['category'] ?? 'neutral',
          timestamp: data['startTime']?.toDate() ?? new Date(),
        } as LiveActivity;
      });
      this.liveFeed.set(feed);
      this.feedLoading.set(false);
    });
  }
}
