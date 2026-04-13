import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
  effect,
  untracked,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, type AppUser } from '../../../core/services/auth.service';
import { ActivityService, type ActivityLog } from '../../../core/services/activity.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { ToastService } from '../../../core/services/toast.service';
import { fadeIn, staggerFadeIn, scaleIn } from '../../../shared/animations';
import { sumUniqueTimeSeconds } from '../../../core/utils/time-utils';

function formatDuration(seconds: number): string {
  if (!seconds) return '0m';
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

interface TimelineRow {
  userId: string;
  user?: AppUser;
  totalProductiveSeconds: number;
  timeWorkedStr: string;
  startTimeStr: string;
  endTimeStr: string;
  segments: { left: number; width: number }[];
}

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './timeline.html',
  styleUrl: './timeline.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeIn, staggerFadeIn, scaleIn]
})
export class TimelineReport {
  private readonly auth = inject(AuthService);
  private readonly employeeApi = inject(EmployeeService);
  private readonly activityService = inject(ActivityService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly employees = signal<AppUser[]>([]);
  readonly selectedDate = signal<string>(this.todayString());
  readonly selectedUserId = signal<string>('all');
  
  readonly isAdmin = this.auth.isAdmin;
  readonly isAllMode = computed(() => this.selectedUserId() === 'all');
  
  readonly timelineRows = signal<TimelineRow[]>([]);
  // Hours 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22
  readonly hours = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]; 

  private loadSeq = 0;

  constructor() {
    effect(() => {
      const ready = this.auth.authReady();
      if (!ready) return;
      untracked(() => { void this.init(); });
    });

    effect(() => {
      const date = this.selectedDate();
      const uid = this.selectedUserId();
      const ready = this.auth.authReady();
      if (!ready) return;
      untracked(() => { void this.loadData(); });
    });
  }

  private todayString(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private async init(): Promise<void> {
    this.toast.show('We are getting only a limited number of data directly as we are facing read limits issue.', 'warning', 6000);

    if (this.auth.isAdmin()) {
      try {
        const all = await this.employeeApi.getAll();
        this.employees.set(all);
      } catch {}
    } else {
      const uid = this.auth.firebaseUser()?.uid ?? '';
      this.selectedUserId.set(uid);
    }
  }

  async loadData(): Promise<void> {
    const uid = this.selectedUserId();
    if (!uid) {
      this.timelineRows.set([]);
      this.loading.set(false);
      return;
    }

    const seq = ++this.loadSeq;
    this.loading.set(true);
    
    const [y, m, d] = this.selectedDate().split('-').map(Number);
    const from = new Date(y, m - 1, d, 0, 0, 0, 0);
    const to = new Date(y, m - 1, d, 23, 59, 59, 999);
    
    try {
      let activities: ActivityLog[];
      if (uid === 'all') {
        activities = await this.activityService.getTeamActivitySummary(from, to);
      } else {
        activities = await this.activityService.getActivityForUser(uid, from, to);
      }

      if (seq !== this.loadSeq) return;

      const userLogs = new Map<string, ActivityLog[]>();
      for (const log of activities) {
        if (log.category !== 'productive') continue;
        if (!userLogs.has(log.userId)) userLogs.set(log.userId, []);
        userLogs.get(log.userId)!.push(log);
      }

      const rows: TimelineRow[] = [];
      const usersToProcess = uid === 'all' ? this.employees() : this.employees().filter(e => e.uid === uid);
      if (usersToProcess.length === 0 && uid !== 'all') {
         // handle non-admin case where employees list might be empty
         const u = this.auth.appUser();
         if (u) usersToProcess.push(u);
      }

      const dayStartMs = from.getTime();
      const dayEndMs = to.getTime();
      const dayDurationMs = dayEndMs - dayStartMs;

      for (const user of usersToProcess) {
        const logs = userLogs.get(user.uid) || [];
        
        if (logs.length === 0) {
          rows.push({
            userId: user.uid,
            user: user,
            totalProductiveSeconds: 0,
            timeWorkedStr: '0m',
            startTimeStr: '00:00',
            endTimeStr: '00:00',
            segments: []
          });
          continue;
        }

        logs.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        const startTimeStr = this.formatTimeAMPM(logs[0].startTime);
        const endTimeStr = this.formatTimeAMPM(logs[logs.length - 1].endTime);

        const sortedSegments = logs.map(l => ({ start: l.startTime.getTime(), end: l.endTime.getTime() }));
        const totalSecs = sumUniqueTimeSeconds(sortedSegments);

        const segments: { left: number; width: number }[] = [];
        for (const log of logs) {
          const s = log.startTime.getTime();
          const e = log.endTime.getTime();
          const pStart = Math.max(s, dayStartMs);
          const pEnd = Math.min(e, dayEndMs);
          
          if (pEnd > pStart) {
            const left = ((pStart - dayStartMs) / dayDurationMs) * 100;
            const width = ((pEnd - pStart) / dayDurationMs) * 100;
            segments.push({ left, width });
          }
        }

        rows.push({
          userId: user.uid,
          user: user,
          totalProductiveSeconds: totalSecs,
          timeWorkedStr: formatDuration(totalSecs),
          startTimeStr,
          endTimeStr,
          segments
        });
      }

      rows.sort((a, b) => {
        const nameA = this.getEmployeeName(a.user).toLowerCase();
        const nameB = this.getEmployeeName(b.user).toLowerCase();
        return nameA.localeCompare(nameB);
      });

      this.timelineRows.set(rows);
    } finally {
      if (seq === this.loadSeq) {
        this.loading.set(false);
      }
    }
  }

  getEmployeeName(user?: AppUser): string {
    if (!user) return 'Unknown';
    return user.displayName || user.email || user.uid;
  }

  getInitials(user?: AppUser): string {
    const name = this.getEmployeeName(user);
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  getAvatarHue(user?: AppUser): number {
    const userId = user?.uid || '';
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash) % 360;
  }

  formatHourLabel(hour: number): string {
    if (hour === 12) return '12 PM';
    return `${hour > 12 ? hour - 12 : hour} ${hour >= 12 ? 'PM' : 'AM'}`;
  }

  private formatTimeAMPM(d: Date): string {
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; 
    return `${h}:${m} ${ampm}`;
  }

  shiftDate(delta: number): void {
    const [y, m, d] = this.selectedDate().split('-').map(Number);
    const date = new Date(y, m - 1, d + delta);
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    this.selectedDate.set(`${yy}-${mm}-${dd}`);
  }

  setDate(val: string): void { this.selectedDate.set(val); }
  setUser(val: string): void { this.selectedUserId.set(val); }
}
