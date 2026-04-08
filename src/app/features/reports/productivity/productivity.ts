import { Component, ChangeDetectionStrategy, signal, inject, effect, untracked } from '@angular/core';
import { DateRange } from '../../../shared/components/date-range/date-range';
import { AuthService, AppUser } from '../../../core/services/auth.service';
import { ActivityService } from '../../../core/services/activity.service';
import { EmployeeService } from '../../../core/services/employee.service';

interface EmployeeRow {
  user: AppUser;
  productivityScore: number;
  activeSeconds: number;
  topApp: string;
  sessions: number;
}

function formatDuration(seconds: number): string {
  if (!seconds) return '0h 0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

@Component({
  selector: 'app-productivity',
  imports: [DateRange],
  templateUrl: './productivity.html',
  styleUrl: './productivity.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Productivity {
  private readonly auth = inject(AuthService);
  private readonly activity = inject(ActivityService);
  private readonly employee = inject(EmployeeService);

  readonly employees = signal<EmployeeRow[]>([]);
  readonly loading = signal(true);
  readonly dateRange = signal<{ from: Date; to: Date } | null>(null);

  constructor() {
    effect(() => {
      const ready = this.auth.authReady();
      const range = this.dateRange();
      if (ready && range) {
        untracked(() => {
          this.loadData();
        });
      }
    });
  }

  onRangeChange(range: { from: Date; to: Date }) {
    this.dateRange.set(range);
  }

  private async loadData() {
    this.loading.set(true);
    try {
      const range = this.dateRange()!;
      let rows: EmployeeRow[] = [];
      if (this.auth.isAdmin()) {
        const users = await this.employee.getAll();
        const allLogs = await this.activity.getTeamActivitySummary(range.from, range.to);
        const logsByUser = new Map<string, typeof allLogs>();
        for (const log of allLogs) {
          const arr = logsByUser.get(log.userId);
          if (arr) arr.push(log);
          else logsByUser.set(log.userId, [log]);
        }

        rows = users.map(u => {
          const userLogs = logsByUser.get(u.uid) || [];
          const score = this.activity.getDailyProductivityScore(userLogs);
          const activeSeconds = userLogs.reduce((acc, l) => acc + l.durationSeconds, 0);
          const topApps = this.activity.groupByApp(userLogs);
          const topApp = topApps.length > 0 ? topApps[0].appName : '-';
          return {
            user: u,
            productivityScore: score,
            activeSeconds,
            topApp,
            sessions: userLogs.length
          };
        });
      } else {
        const u = this.auth.appUser();
        if (u) {
          const row = await this.getEmployeeRow(u, range.from, range.to);
          rows = [row];
        }
      }
      this.employees.set(rows);
    } finally {
      this.loading.set(false);
    }
  }

  private async getEmployeeRow(user: AppUser, from: Date, to: Date): Promise<EmployeeRow> {
    const logs = await this.activity.getActivityForUser(user.uid, from, to);
    const score = this.activity.getDailyProductivityScore(logs);
    const activeSeconds = logs.reduce((acc, l) => acc + l.durationSeconds, 0);
    const topApps = this.activity.groupByApp(logs);
    const topApp = topApps.length > 0 ? topApps[0].appName : '-';
    return {
      user,
      productivityScore: score,
      activeSeconds,
      topApp,
      sessions: logs.length
    };
  }

  exportCsv() {
    const headers = ['Name', 'Email', 'Score', 'Tracked usage', 'Top app', 'Sessions'];
    const rows = this.employees().map(e => [
      e.user.displayName,
      e.user.email,
      e.productivityScore + '%',
      this.formatDurationStr(e.activeSeconds),
      e.topApp,
      e.sessions.toString()
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `productivity-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  formatDurationStr(seconds: number): string {
    return formatDuration(seconds);
  }

  getScoreColor(score: number): string {
    if (score > 70) return '#34c98a';
    if (score >= 40) return '#f5a623';
    return '#f05252';
  }
}
