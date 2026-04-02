import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
  effect,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DateRange } from '../../../shared/components/date-range/date-range';
import { AuthService, type AppUser } from '../../../core/services/auth.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { IdleService, type IdleSession } from '../../../core/services/idle.service';
import { ShiftService, type ShiftSession } from '../../../core/services/shift.service';

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

@Component({
  selector: 'app-attendance',
  imports: [DateRange, FormsModule, DatePipe],
  templateUrl: './attendance.html',
  styleUrl: './attendance.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Attendance {
  private readonly auth = inject(AuthService);
  private readonly shiftsApi = inject(ShiftService);
  private readonly employeeApi = inject(EmployeeService);
  private readonly idleService = inject(IdleService);

  readonly loading = signal(true);
  readonly shifts = signal<ShiftSession[]>([]);
  readonly idleSessions = signal<IdleSession[]>([]);
  readonly employees = signal<AppUser[]>([]);
  readonly dateRange = signal<{ from: Date; to: Date } | null>(null);
  readonly selectedEmployee = signal<string>('all');
  readonly isAdmin = this.auth.isAdmin;
  private loadSeq = 0;

  constructor() {
    effect(() => {
      const ready = this.auth.authReady();
      const range = this.dateRange();
      const sel = this.selectedEmployee();
      if (!ready || !range) return;
      untracked(() => {
        void this.loadData();
      });
    });
  }

  onRangeChange(range: { from: Date; to: Date }): void {
    this.dateRange.set(range);
  }

  onEmployeeChange(uid: string): void {
    this.selectedEmployee.set(uid);
    untracked(() => { void this.loadData(); });
  }

  getEmployeeName(uid: string): string {
    const e = this.employees().find(x => x.uid === uid);
    return e?.displayName || e?.email || uid;
  }

  formatTime(d: Date): string {
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  formatDuration(seconds: number): string {
    return formatDuration(seconds);
  }

  getTotalBreakTime(userId?: string): string {
    const sessions = userId
      ? this.idleSessions().filter((s) => s.userId === userId)
      : this.idleSessions();
    const total = sessions.reduce((s, i) => s + i.durationSeconds, 0);
    return formatDuration(total);
  }

  getStatusColor(status: string): string {
    return status === 'active' ? '#4f8ef7' : '#8c97b2';
  }

  async loadData(): Promise<void> {
    const seq = ++this.loadSeq;
    this.loading.set(true);
    try {
      if (this.auth.isAdmin() && this.employees().length === 0) {
        const users = await this.employeeApi.getAll();
        this.employees.set(users);
      }

      const range = this.dateRange()!;
      const isAdm = this.auth.isAdmin();
      const sel = this.selectedEmployee();

      let shifts: ShiftSession[] = [];

      if (isAdm) {
        if (sel === 'all') {
          shifts = await this.shiftsApi.getAllShifts(range.from, range.to);
        } else {
          shifts = await this.shiftsApi.getShiftsForUser(sel, range.from, range.to);
        }
      } else {
        const uid = this.auth.firebaseUser()?.uid;
        if (!uid) {
          this.shifts.set([]);
          return;
        }
        shifts = await this.shiftsApi.getShiftsForUser(uid, range.from, range.to);
      }

      // Load idle/break sessions for the same range and user filter
      let idleData: IdleSession[];
      if (isAdm && sel === 'all') {
        idleData = await this.idleService.getAllIdleSessions(range.from, range.to);
      } else {
        const uid = isAdm ? sel : this.auth.firebaseUser()?.uid;
        idleData = uid ? await this.idleService.getIdleSessionsForUser(uid, range.from, range.to) : [];
      }

      // Prevent stale async loads from overwriting latest selection/range.
      if (seq === this.loadSeq) {
        this.shifts.set(shifts);
        this.idleSessions.set(idleData);
      }
    } finally {
      if (seq === this.loadSeq) {
        this.loading.set(false);
      }
    }
  }

  exportCsv(): void {
    const isAdm = this.auth.isAdmin();
    const empMap = new Map(this.employees().map((e) => [e.uid, e]));

    const headers = isAdm
      ? ['Shift Date', 'Employee', 'Login Time', 'Logout Time', 'Active Time', 'Break Time', 'Status']
      : ['Shift Date', 'Login Time', 'Logout Time', 'Active Time', 'Break Time', 'Status'];

    const rows = this.shifts().map((s) => {
      const shiftDate = s.shiftDate;
      const login = this.formatTime(s.loginTime);
      const logout = this.formatTime(s.logoutTime);
      const active = this.formatDuration(s.totalActiveSeconds);
      const breakTime = this.getTotalBreakTime(isAdm ? s.userId : undefined);
      const status = s.status;

      if (!isAdm) return [shiftDate, login, logout, active, breakTime, status];

      const emp = empMap.get(s.userId);
      const empName = emp?.displayName || emp?.email || s.userId;
      return [shiftDate, empName, login, logout, active, breakTime, status];
    });

    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

