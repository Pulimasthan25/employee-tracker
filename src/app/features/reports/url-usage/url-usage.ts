import { Component, ChangeDetectionStrategy, signal, inject, effect, untracked } from '@angular/core';
import { DateRange } from '../../../shared/components/date-range/date-range';
import { AuthService, AppUser } from '../../../core/services/auth.service';
import { ActivityService, ActivityLog } from '../../../core/services/activity.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { FormsModule } from '@angular/forms';

function formatDuration(seconds: number): string {
  if (!seconds) return '0h 0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

@Component({
  selector: 'app-url-usage',
  imports: [DateRange, FormsModule],
  templateUrl: './url-usage.html',
  styleUrl: './url-usage.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UrlUsage {
  private readonly auth = inject(AuthService);
  private readonly activity = inject(ActivityService);
  private readonly employee = inject(EmployeeService);

  readonly data = signal<{ domain: string; totalSeconds: number; visitCount: number; category: ActivityLog['category'] }[]>([]);
  readonly loading = signal(true);
  readonly dateRange = signal<{ from: Date; to: Date } | null>(null);
  readonly selectedEmployee = signal<string>('all');
  readonly employees = signal<AppUser[]>([]);

  readonly isAdmin = this.auth.isAdmin;

  constructor() {
    effect(() => {
      const ready = this.auth.authReady();
      const range = this.dateRange();
      const selEmp = this.selectedEmployee();

      if (ready && range) {
        untracked(() => {
          this.loadData();
        });
      }
    });
  }

  async loadData() {
    this.loading.set(true);
    try {
      if (this.auth.isAdmin() && this.employees().length === 0) {
        const users = await this.employee.getAll();
        this.employees.set(users);
      }

      const range = this.dateRange()!;
      let logs: ActivityLog[] = [];
      const isAdm = this.auth.isAdmin();
      const sel = this.selectedEmployee();

      if (isAdm) {
        if (sel === 'all') {
          logs = await this.activity.getTeamActivitySummary(range.from, range.to);
        } else {
          logs = await this.activity.getActivityForUser(sel, range.from, range.to);
        }
      } else {
        const user = this.auth.appUser();
        if (user) {
          logs = await this.activity.getActivityForUser(user.uid, range.from, range.to);
        }
      }

      const grouped = this.activity.groupByDomain(logs);
      this.data.set(grouped);
    } finally {
      this.loading.set(false);
    }
  }

  onRangeChange(range: { from: Date; to: Date }) {
    this.dateRange.set(range);
  }

  formatDurationStr(seconds: number): string {
    return formatDuration(seconds);
  }

  formatDomain(domain: string): string {
    return domain.replace(/\.tracked\/?$/, '');
  }
}
