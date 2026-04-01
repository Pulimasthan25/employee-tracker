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

  readonly loading = signal(true);
  readonly shifts = signal<ShiftSession[]>([]);
  readonly employees = signal<AppUser[]>([]);
  readonly dateRange = signal<{ from: Date; to: Date } | null>(null);
  readonly selectedEmployee = signal<string>('all');
  readonly isAdmin = this.auth.isAdmin;

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

  getStatusColor(status: string): string {
    return status === 'active' ? '#4f8ef7' : '#8c97b2';
  }

  async loadData(): Promise<void> {
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

      this.shifts.set(shifts);
    } finally {
      this.loading.set(false);
    }
  }

  exportCsv(): void {
    const isAdm = this.auth.isAdmin();
    const empMap = new Map(this.employees().map((e) => [e.uid, e]));

    const headers = isAdm
      ? ['Shift Date', 'Employee', 'Login Time', 'Logout Time', 'Active Time', 'Status']
      : ['Shift Date', 'Login Time', 'Logout Time', 'Active Time', 'Status'];

    const rows = this.shifts().map((s) => {
      const shiftDate = s.shiftDate;
      const login = this.formatTime(s.loginTime);
      const logout = this.formatTime(s.logoutTime);
      const active = this.formatDuration(s.totalActiveSeconds);
      const status = s.status;

      if (!isAdm) return [shiftDate, login, logout, active, status];

      const emp = empMap.get(s.userId);
      const empName = emp?.displayName || emp?.email || s.userId;
      return [shiftDate, empName, login, logout, active, status];
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

