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

  readonly effectiveDate = computed(() => this.externalSelectedDate() ?? this.selectedDate());
  readonly effectiveUserId = computed(() => this.externalSelectedUserId() ?? this.selectedUserId());
  readonly effectiveEmployees = computed(() => this.externalEmployees() ?? this.employees());

  readonly isLoading = computed(() => {
    const ext = this.externalLoading();
    return ext !== null ? ext : this.loading();
  });

  readonly timelineRows = signal<TimelineRow[]>([]);
  readonly hours = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];

  private loadSeq = 0;

  constructor() {
    effect(() => {
      if (!this.auth.authReady()) return;
      untracked(() => this.init());
    });

    effect(() => {
      if (!this.auth.authReady()) return;
      const date = this.effectiveDate();
      const uid = this.effectiveUserId();
      untracked(() => this.loadData());
    });
  }

  private todayString(): string {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  private async init(): Promise<void> {
    if (this.auth.isAdmin()) {
      try {
        const all = await this.employeeApi.getAll();
        this.employees.set(all);
      } catch {}
    } else {
      const user = this.auth.appUser() ?? {
        uid: this.auth.firebaseUser()?.uid ?? ''
      } as AppUser;

      // ✅ FIX: ensure employee list is available
      this.employees.set([user]);
      this.selectedUserId.set(user.uid);
    }
  }

  async loadData(): Promise<void> {
    const uid =
      this.auth.appUser()?.uid ??
      this.auth.firebaseUser()?.uid ??
      this.effectiveUserId();

    console.log('UID:', uid);

    if (!uid) {
      this.timelineRows.set([]);
      this.loading.set(false);
      return;
    }

    const seq = ++this.loadSeq;
    this.loading.set(true);

    const selectedDate = this.effectiveDate();
    const from = new Date(selectedDate + 'T00:00:00');
    const to = new Date(selectedDate + 'T23:59:59');

    console.log('FROM:', from, 'TO:', to);

    try {
      let activities: ActivityLog[];

      if (uid === 'all') {
        activities = await this.activityService.getTeamActivitySummary(from, to);
      } else {
        activities = await this.activityService.getActivityForUser(uid, from, to);
      }

      console.log('Activities:', activities);

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

    const from = new Date(selectedDate + 'T00:00:00').getTime();
    const to = new Date(selectedDate + 'T23:59:59').getTime();
    const dayDurationMs = to - from;

    console.log('Before filter:', activities.length);

    const productive = activities.filter((log) => {
      const start = new Date(log.startTime).getTime();
      const end = new Date(log.endTime).getTime();

      return (
        log.category?.toLowerCase() === 'productive' &&
        start <= to &&
        end >= from
      );
    });

    console.log('After filter:', productive.length);

    const userLogs = new Map<string, ActivityLog[]>();
    for (const log of productive) {
      if (!userLogs.has(log.userId)) userLogs.set(log.userId, []);
      userLogs.get(log.userId)!.push(log);
    }

    const rows: TimelineRow[] = [];

    const usersToProcess =
      uid === 'all'
        ? [...employees]
        : [employees.find(e => e.uid === uid) || this.auth.appUser()].filter(Boolean);

    for (const user of usersToProcess) {
      const logs = userLogs.get(user!.uid) || [];

      if (logs.length === 0) {
        rows.push({
          userId: user!.uid,
          user,
          totalProductiveSeconds: 0,
          timeWorkedStr: '0m',
          startTimeStr: '00:00',
          endTimeStr: '00:00',
          segments: []
        });
        continue;
      }

      logs.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

      const segments = logs.map(log => {
        const start = new Date(log.startTime).getTime();
        const end = new Date(log.endTime).getTime();

        const left = ((start - from) / dayDurationMs) * 100;
        const width = ((end - start) / dayDurationMs) * 100;

        return { left, width };
      });

      rows.push({
        userId: user!.uid,
        user,
        totalProductiveSeconds: sumUniqueTimeSeconds(
          logs.map(l => ({
            start: new Date(l.startTime).getTime(),
            end: new Date(l.endTime).getTime()
          }))
        ),
        timeWorkedStr: formatDuration(
          sumUniqueTimeSeconds(
            logs.map(l => ({
              start: new Date(l.startTime).getTime(),
              end: new Date(l.endTime).getTime()
            }))
          )
        ),
        startTimeStr: '',
        endTimeStr: '',
        segments
      });
    }

    this.timelineRows.set(rows);
  }

  shiftDate(delta: number): void {
    const d = new Date(this.selectedDate());
    d.setDate(d.getDate() + delta);
    this.selectedDate.set(d.toISOString().slice(0, 10));
  }

  setDate(val: string): void { this.selectedDate.set(val); }
  setUser(val: string): void { this.selectedUserId.set(val); }

  openDatePicker(): void {
    const input = this.datePickerInput?.nativeElement;
    if (!input) return;
    try { (input as any).showPicker(); } catch { input.click(); }
  }
}
