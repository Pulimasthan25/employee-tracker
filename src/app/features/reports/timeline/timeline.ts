import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
  effect,
  untracked,
  computed,
  input,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, type AppUser } from '../../../core/services/auth.service';
import { ActivityService, type ActivityLog } from '../../../core/services/activity.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { ToastService } from '../../../core/services/toast.service';
import { fadeIn, staggerFadeIn, scaleIn } from '../../../shared/animations';
import { sumUniqueTimeSeconds } from '../../../core/utils/time-utils';

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rs = s % 60;

  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(rs).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(rs).padStart(2, '0')}s`;
  return `${rs}s`;
}

interface TimelineRow {
  userId: string;
  user?: AppUser;
  totalProductiveSeconds: number;
  totalUnproductiveSeconds: number;
  totalNeutralSeconds: number;
  timeWorkedStr: string;
  unproductiveTimeStr: string;
  startTimeStr: string;
  endTimeStr: string;
  segments: { left: number; width: number; category: 'productive' | 'unproductive' | 'neutral' }[];
}

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './timeline.html',
  styleUrl: './timeline.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeIn, staggerFadeIn, scaleIn]
})
export class TimelineReport {
  @ViewChild('datePickerInput') datePickerInput!: ElementRef<HTMLInputElement>;
  private readonly auth = inject(AuthService);
  private readonly employeeApi = inject(EmployeeService);
  private readonly activityService = inject(ActivityService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly employees = signal<AppUser[]>([]);
  readonly selectedDate = signal<string>(this.todayString());
  readonly selectedUserId = signal<string>('all');
  readonly externalActivities = input<ActivityLog[] | null>(null);
  readonly externalEmployees = input<AppUser[] | null>(null);
  readonly externalSelectedDate = input<string | null>(null);
  readonly externalSelectedUserId = input<string | null>(null);
  readonly externalLoading = input<boolean | null>(null);
  readonly hideToolbar = input<boolean>(false);

  readonly isAdmin = this.auth.isAdmin;
  readonly isControlled = computed(() =>
    this.externalActivities() !== null
    || this.externalEmployees() !== null
    || this.externalSelectedDate() !== null
    || this.externalSelectedUserId() !== null
  );
  readonly effectiveDate = computed(() => this.externalSelectedDate() ?? this.selectedDate());
  readonly effectiveUserId = computed(() => this.externalSelectedUserId() ?? this.selectedUserId());
  readonly effectiveEmployees = computed(() => this.externalEmployees() ?? this.employees());
  readonly isAllMode = computed(() => this.effectiveUserId() === 'all');
  readonly isLoading = computed(() => {
    const ext = this.externalLoading();
    return ext !== null ? ext : this.loading();
  });

  readonly timelineRows = signal<TimelineRow[]>([]);
  // Hours 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22
  readonly hours = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];

  private loadSeq = 0;

  constructor() {
    effect(() => {
      const controlled = this.isControlled();
      const ready = this.auth.authReady();
      if (!ready) return;
      if (controlled) return;
      untracked(() => { void this.init(); });
    });

    effect(() => {
      const controlled = this.isControlled();
      if (controlled) return;
      const date = this.effectiveDate();
      const uid = this.effectiveUserId();
      const ready = this.auth.authReady();
      if (!ready) return;
      untracked(() => { void this.loadData(); });
    });

    effect(() => {
      const controlled = this.isControlled();
      if (!controlled) return;
      const activities = this.externalActivities() ?? [];
      const date = this.effectiveDate();
      const uid = this.effectiveUserId();
      const users = this.effectiveEmployees();
      untracked(() => {
        this.loading.set(false);
        this.updateRowsFromActivities(activities, uid, date, users);
      });
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
    // this.toast.show('We are facing the database read limit issue, so loading only some data in the UI.', 'warning', 8000);

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
    const uid = this.effectiveUserId();
    if (!uid) {
      this.timelineRows.set([]);
      this.loading.set(false);
      return;
    }

    const seq = ++this.loadSeq;
    this.loading.set(true);

    const selectedDate = this.effectiveDate();
    const [y, m, d] = selectedDate.split('-').map(Number);
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
      this.updateRowsFromActivities(activities, uid, selectedDate, this.effectiveEmployees());
    } finally {
      if (seq === this.loadSeq) {
        this.loading.set(false);
      }
    }
  }

  private updateRowsFromActivities(
    activities: ActivityLog[],
    uid: string,
    selectedDate: string,
    employees: AppUser[]
  ): void {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const from = new Date(y, m - 1, d, 0, 0, 0, 0);
    const to = new Date(y, m - 1, d, 23, 59, 59, 999);
    const dayStartMs = from.getTime();
    const dayEndMs = to.getTime();
    const dayDurationMs = dayEndMs - dayStartMs;

    const allLogs = activities.filter((log) =>
      log.startTime.getTime() <= dayEndMs && log.endTime.getTime() >= dayStartMs
    );

    const userLogs = new Map<string, ActivityLog[]>();
    for (const log of allLogs) {
      if (!userLogs.has(log.userId)) userLogs.set(log.userId, []);
      userLogs.get(log.userId)!.push(log);
    }

    const rows: TimelineRow[] = [];
    const usersToProcess = uid === 'all' ? [...employees] : employees.filter((e) => e.uid === uid);
    if (usersToProcess.length === 0) {
      const u = this.auth.appUser();
      if (u && (uid === u.uid || (uid === 'all' && !this.isAdmin()))) {
        usersToProcess.push(u);
      }
    }

    for (const user of usersToProcess) {
      const logs = userLogs.get(user.uid) || [];
      if (logs.length === 0) {
        rows.push({
          userId: user.uid,
          user,
          totalProductiveSeconds: 0,
          totalUnproductiveSeconds: 0,
          totalNeutralSeconds: 0,
          timeWorkedStr: '0m',
          unproductiveTimeStr: '0m',
          startTimeStr: '00:00',
          endTimeStr: '00:00',
          segments: []
        });
        continue;
      }

      logs.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      const startTimeStr = this.formatTimeAMPM(logs[0].startTime);
      const endTimeStr = this.formatTimeAMPM(logs[logs.length - 1].endTime);
      
      const productiveSegments = logs.filter(l => l.category === 'productive').map(l => ({ start: l.startTime.getTime(), end: l.endTime.getTime() }));
      const unproductiveSegments = logs.filter(l => l.category === 'unproductive').map(l => ({ start: l.startTime.getTime(), end: l.endTime.getTime() }));
      const neutralSegments = logs.filter(l => l.category === 'neutral').map(l => ({ start: l.startTime.getTime(), end: l.endTime.getTime() }));

      const totalProd = sumUniqueTimeSeconds(productiveSegments);
      const totalUnprod = sumUniqueTimeSeconds(unproductiveSegments);
      const totalNeutral = sumUniqueTimeSeconds(neutralSegments);

      const segments: { left: number; width: number; category: 'productive' | 'unproductive' | 'neutral' }[] = [];
      for (const log of logs) {
        const pStart = Math.max(log.startTime.getTime(), dayStartMs);
        const pEnd = Math.min(log.endTime.getTime(), dayEndMs);
        if (pEnd > pStart) {
          const left = ((pStart - dayStartMs) / dayDurationMs) * 100;
          const width = ((pEnd - pStart) / dayDurationMs) * 100;
          segments.push({ left, width, category: log.category });
        }
      }

      rows.push({
        userId: user.uid,
        user,
        totalProductiveSeconds: totalProd,
        totalUnproductiveSeconds: totalUnprod,
        totalNeutralSeconds: totalNeutral,
        timeWorkedStr: formatDuration(totalProd),
        unproductiveTimeStr: formatDuration(totalUnprod),
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

  openDatePicker(): void {
    const input = this.datePickerInput?.nativeElement;
    if (!input) return;
    try { (input as any).showPicker(); } catch { input.focus(); input.click(); }
  }
}
