import {
  Component,
  inject,
  signal,
  computed,
  effect,
  untracked,
  ChangeDetectionStrategy,
  ViewChild,
  ElementRef,
  OnDestroy,
} from '@angular/core';
import { DatePipe, CommonModule } from '@angular/common';
import type { ActivityLog } from '../../../core/services/activity.service';
import type { DisplayRow } from '../../../core/services/activity.service';
import { ActivityService } from '../../../core/services/activity.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { AuthService, type AppUser } from '../../../core/services/auth.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { IdleService, type IdleSession } from '../../../core/services/idle.service';
import { ShiftService, type ShiftSession } from '../../../core/services/shift.service';
import { sumUniqueTimeSeconds } from '../../../core/utils/time-utils';
import { ToastService } from '../../../core/services/toast.service';
import { fadeIn, slideInUp, staggerFadeIn, scaleIn, expandVertical } from '../../../shared/animations';
import { TimelineReport } from '../../reports/timeline/timeline';

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h === 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return s > 0 ? `${h}h ${m}m ${s}s` : (m > 0 ? `${h}h ${m}m` : `${h}h`);
}

@Component({
  selector: 'app-overview',
  imports: [TimelineReport, DatePipe, CommonModule],
  templateUrl: './overview.html',
  styleUrl: './overview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeIn, slideInUp, staggerFadeIn, scaleIn, expandVertical]
})
export class Overview implements OnDestroy {
  @ViewChild('datePickerInput') datePickerInput!: ElementRef<HTMLInputElement>;

  private activityService = inject(ActivityService);
  private authService = inject(AuthService);
  private employeeService = inject(EmployeeService);
  private idleService = inject(IdleService);
  private shiftService = inject(ShiftService);
  private realtime = inject(RealtimeService);

  readonly isAdmin = this.authService.isAdmin;
  readonly liveLoading = this.realtime.feedLoading;
  
  // LIVE Telemetry — last activity per user (admin: all users, employee: own)
  readonly liveNowPerUser = computed(() => {
    if (!this.isToday()) return [];

    const feed = this.realtime.liveFeed();
    const userMap = new Map<string, any>();

    // Take ONLY the latest record per user (feed is ordered desc)
    [...feed].forEach(item => {
      if (!userMap.has(item.userId)) {
        userMap.set(item.userId, item);
      }
    });

    if (this.isAdmin()) {
      // Admin: show last activity for every user
      return Array.from(userMap.values());
    }

    // Employee: show only their own last activity
    const uid = this.authService.firebaseUser()?.uid;
    if (!uid) return [];
    const own = userMap.get(uid);
    return own ? [own] : [];
  });

  logs = signal<ActivityLog[]>([]);
  private allLogs = signal<ActivityLog[]>([]);
  employees = signal<AppUser[]>([]);
  loading = signal(true);
  hasLoadedOnce = signal(false);
  connectionError = signal(false);
  selectedDate = signal<string>(this.todayString());
  selectedEmployeeId = signal<'all' | string>('all');
  readonly activeShift = signal<ShiftSession | null>(null);
  readonly idleSessions = signal<IdleSession[]>([]);

  lastUpdated = signal('');

  productivityScore = computed(() => {
    const total = this.totalSeconds();
    const prod = this.productiveSeconds();
    if (total === 0) return 0;
    return Math.round((prod / total) * 100);
  });
  displayRows = computed<DisplayRow[]>(() =>
    this.activityService.groupForDisplay(this.logs())
  );
  readonly expandedBrowsers = signal<Set<string>>(new Set());

  readonly timelineDate = computed(() => this.selectedDate());

  categoryMinutes = computed(() => {
    const list = this.logs();
    let productive = 0;
    let unproductive = 0;
    let neutral = 0;
    for (const log of list) {
      const mins = log.durationSeconds / 60;
      if (log.category === 'productive') productive += mins;
      else if (log.category === 'unproductive') unproductive += mins;
      else neutral += mins;
    }
    return { productive, unproductive, neutral };
  });

  totalSeconds = computed(() => {
    const list = this.logs();
    const selected = this.selectedEmployeeId();
    if (selected !== 'all') {
      return sumUniqueTimeSeconds(
        list.map((l) => ({ start: l.startTime.getTime(), end: l.endTime.getTime() }))
      );
    }
    // Sum unique time PER user
    const userGroups = new Map<string, { start: number; end: number }[]>();
    for (const log of list) {
      if (!userGroups.has(log.userId)) userGroups.set(log.userId, []);
      userGroups.get(log.userId)!.push({
        start: log.startTime.getTime(),
        end: log.endTime.getTime(),
      });
    }
    let total = 0;
    for (const segments of userGroups.values()) {
      total += sumUniqueTimeSeconds(segments);
    }
    return total;
  });
  formattedActiveTime = computed(() => formatDuration(this.totalSeconds()));

  productiveSeconds = computed(() => {
    const list = this.logs().filter((l) => l.category === 'productive');
    const selected = this.selectedEmployeeId();
    if (selected !== 'all') {
      return sumUniqueTimeSeconds(
        list.map((l) => ({ start: l.startTime.getTime(), end: l.endTime.getTime() }))
      );
    }
    const userGroups = new Map<string, { start: number; end: number }[]>();
    for (const log of list) {
      if (!userGroups.has(log.userId)) userGroups.set(log.userId, []);
      userGroups.get(log.userId)!.push({
        start: log.startTime.getTime(),
        end: log.endTime.getTime(),
      });
    }
    let total = 0;
    for (const segments of userGroups.values()) {
      total += sumUniqueTimeSeconds(segments);
    }
    return total;
  });
  formattedProductiveTime = computed(() =>
    formatDuration(this.productiveSeconds())
  );

  customAdminMetricLabel = computed(() => {
    if (this.isAdmin() && this.selectedEmployeeId() === 'all') {
      return 'Active employees';
    }
    return 'Active apps / sites';
  });

  customAdminMetricValue = computed(() => {
    if (this.isAdmin() && this.selectedEmployeeId() === 'all') {
      const activeCount = new Set(this.logs().map(l => l.userId)).size;
      const total = this.employees().length;
      return total > 0 ? `${activeCount} / ${total}` : `${activeCount}`;
    }
    const uniqueApps = new Set(this.logs().map(l => l.appName)).size;
    return `${uniqueApps}`;
  });

  readonly totalBreakSeconds = computed(() => {
    const sessions = this.idleSessions();
    const employees = this.employees();
    if (!this.isAdmin()) {
      const ts = this.authService.appUser()?.idleThresholdSeconds ?? 300;
      return this.idleService.getTotalBreakSeconds(sessions, { thresholdSeconds: ts });
    }
    const selected = this.selectedEmployeeId();
    if (selected === 'all') {
      const perUserThreshold = new Map(
        employees.map((e) => [e.uid, e.idleThresholdSeconds ?? 300] as const)
      );
      return this.idleService.getTotalBreakSeconds(sessions, { perUserThreshold });
    }
    const ts =
      employees.find((e) => e.uid === selected)?.idleThresholdSeconds ?? 300;
    return this.idleService.getTotalBreakSeconds(sessions, { thresholdSeconds: ts });
  });
  readonly formattedBreakTime = computed(() =>
    formatDuration(this.totalBreakSeconds())
  );

  constructor() {
    effect(() => {
      const ready = this.authService.authReady();
      const _date = this.selectedDate(); // tracked
      if (!ready) return;
      untracked(() => this.loadData());
    });

    // Load employees once
    effect(() => {
      const ready = this.authService.authReady();
      if (!ready) return;
      
      // For non-admins, ensure the selected ID is their own
      if (!this.isAdmin()) {
        const uid = this.authService.firebaseUser()?.uid;
        if (uid) untracked(() => this.selectedEmployeeId.set(uid));
      }

      untracked(() => {
        void this.loadEmployees();
        void this.loadActiveShift();
      });
    });
  }

  ngOnDestroy(): void {
    this.realtime.destroy();
  }

  private todayString(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  todayMax(): string {
    return this.todayString();
  }

  isToday(): boolean {
    return this.selectedDate() === this.todayString();
  }

  goToday(): void {
    this.selectedDate.set(this.todayString());
  }

  refreshData(): void {
    untracked(() => this.loadData());
  }

  private async loadData(): Promise<void> {

    this.loading.set(true);
    this.connectionError.set(false);
    this.idleSessions.set([]);
    const [y, m, d] = this.selectedDate().split('-').map(Number);
    const from = new Date(y, m - 1, d, 0, 0, 0, 0);
    const to = new Date(y, m - 1, d, 23, 59, 59, 999);

    try {
      if (this.isAdmin()) {
        // Wait for both logs and employees if we haven't loaded them yet
        const [logs] = await Promise.all([
          this.activityService.getTeamActivitySummary(from, to),
          this.loadEmployees()
        ]);

        this.allLogs.set(logs);
        this.applyEmployeeFilter();
        this.loading.set(false);
        this.hasLoadedOnce.set(true);
        this.lastUpdated.set(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

        // this.toast.show(
        //   'We are facing the database read limit issue, so loading only some data in the UI.',
        //   'warning',
        //   8000
        // );

        void this.loadIdleSessions(from, to);
      } else {
        const uid = this.authService.firebaseUser()?.uid;
        if (!uid) {
          this.logs.set([]);
          this.idleSessions.set([]);
          this.loading.set(false);
          return;
        }
        const logs = await this.activityService.getActivityForUser(uid, from, to);
        this.logs.set(logs);
        this.loading.set(false);
        this.hasLoadedOnce.set(true);
        this.lastUpdated.set(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        void this.loadEmployees();
        void this.loadIdleSessions(from, to);
      }
    } catch (e) {
      console.error('Failed to load activity:', e);
      this.connectionError.set(true);
      this.logs.set([]);
      this.idleSessions.set([]);
      this.loading.set(false);
    }
  }

  private async loadIdleSessions(from: Date, to: Date): Promise<void> {
    try {
      if (this.isAdmin()) {
        const selected = this.selectedEmployeeId();
        const data =
          selected === 'all'
            ? await this.idleService.getAllIdleSessions(from, to)
            : await this.idleService.getIdleSessionsForUser(selected, from, to);
        this.idleSessions.set(data);
        return;
      }

      const uid = this.authService.firebaseUser()?.uid;
      if (!uid) {
        this.idleSessions.set([]);
        return;
      }
      const data = await this.idleService.getIdleSessionsForUser(uid, from, to);
      this.idleSessions.set(data);
    } catch (e) {
      console.error('[Overview] Failed to load idle sessions:', e);
      this.idleSessions.set([]);
    }
  }

  private async loadEmployees(): Promise<void> {
    const isToday = this.isToday();

    if (!this.isAdmin()) {
      // For employees, just init realtime if it's today
      if (isToday) {
        const user = this.authService.appUser();
        if (user) {
          const nameMap = new Map([[user.uid, user.displayName ?? 'Unknown']]);
          void this.realtime.init(nameMap);
        }
      }
      return;
    }

    // Admin path: If employees are already cached, still ensure realtime is initialized
    if (this.employees().length > 0) {
      if (isToday) {
        const nameMap = new Map(this.employees().map(e => [e.uid, e.displayName ?? 'Unknown'] as const));
        void this.realtime.init(nameMap);
      }
      return;
    }

    try {
      const all = await this.employeeService.getAll();
      this.employees.set(all);
      if (isToday) {
        const nameMap = new Map(all.map(e => [e.uid, e.displayName ?? 'Unknown'] as const));
        void this.realtime.init(nameMap);
      }
    } catch {
      // non-fatal
    }
  }

  private async loadActiveShift(): Promise<void> {
    const isAdm = this.isAdmin();
    const selected = this.selectedEmployeeId();

    if (isAdm) {
      if (selected === 'all') {
        this.activeShift.set(null);
        return;
      }
      try {
        const s = await this.shiftService.getActiveShift(selected);
        this.activeShift.set(s ?? await this.shiftService.getLatestShiftForUser(selected));
      } catch (e) {
        console.error('[Overview] Failed to load active shift for employee:', e);
        this.activeShift.set(null);
      }
      return;
    }

    const uid = this.authService.firebaseUser()?.uid;
    if (!uid) {
      this.activeShift.set(null);
      return;
    }

    try {
      const s = await this.shiftService.getActiveShift(uid);
      this.activeShift.set(s ?? await this.shiftService.getLatestShiftForUser(uid));
    } catch (e) {
      console.error('[Overview] Failed to load active shift:', e);
      this.activeShift.set(null);
    }
  }

  formatTime(d: Date): string {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  setSelectedEmployee(id: string): void {
    this.selectedEmployeeId.set(id === 'all' ? 'all' : id);
    this.applyEmployeeFilter();
    untracked(() => {
      void this.loadActiveShift();
      const [y, m, d] = this.selectedDate().split('-').map(Number);
      const from = new Date(y, m - 1, d, 0, 0, 0, 0);
      const to = new Date(y, m - 1, d, 23, 59, 59, 999);
      void this.loadIdleSessions(from, to);
    });
  }

  private applyEmployeeFilter(): void {
    const all = this.allLogs();
    const selected = this.selectedEmployeeId();
    this.logs.set(
      selected === 'all' ? all : all.filter((log) => log.userId === selected)
    );
  }

  shiftDate(delta: number): void {
    if (delta > 0 && this.isToday()) return;
    const [y, m, d] = this.selectedDate().split('-').map(Number);
    const date = new Date(y, m - 1, d + delta);
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const next = `${yy}-${mm}-${dd}`;
    const max = this.todayString();
    this.selectedDate.set(next > max ? max : next);
  }

  setDate(val: string): void {
    const max = this.todayString();
    this.selectedDate.set(val > max ? max : val);
  }

  openDatePicker(): void {
    const input = this.datePickerInput?.nativeElement;
    if (!input) return;
    try {
      // showPicker() is available in modern browsers and PWA standalone contexts
      (input as any).showPicker();
    } catch {
      // Fallback — directly focus and click the input
      input.focus();
      input.click();
    }
  }

  formatAppTime(seconds: number): string {
    return formatDuration(seconds);
  }

  toggleBrowser(browserName: string): void {
    this.expandedBrowsers.update((set) => {
      const next = new Set(set);
      if (next.has(browserName)) next.delete(browserName);
      else next.add(browserName);
      return next;
    });
  }

  isExpanded(browserName: string): boolean {
    return this.expandedBrowsers().has(browserName);
  }

  getAppPercent(seconds: number): number {
    const total = this.totalSeconds();
    return total === 0 ? 0 : Math.round((seconds / total) * 100);
  }

}