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

  private unsubscribeAgents?: () => void;
  private unsubscribeFeed?: () => void;

  async init() {
    // Get all employees for name mapping once
    const employees = await this.employeeRepo.getAll();
    const nameMap = new Map<string, string>(
      employees.map((e) => [e.uid, e.displayName || 'Unknown'])
    );

    this.listenToAgents(nameMap);
    this.listenToFeed(nameMap);
  }

  destroy() {
    this.unsubscribeAgents?.();
    this.unsubscribeFeed?.();
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
    });
  }
}
