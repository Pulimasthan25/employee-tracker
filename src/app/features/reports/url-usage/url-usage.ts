import { Component, ChangeDetectionStrategy, signal, inject, effect, untracked, input, computed } from '@angular/core';
import { DateRange } from '../../../shared/components/date-range/date-range';
import { AuthService, AppUser } from '../../../core/services/auth.service';
import { ActivityService, ActivityLog } from '../../../core/services/activity.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { FormsModule } from '@angular/forms';
import { fadeIn, staggerFadeIn, scaleIn } from '../../../shared/animations';

function formatDuration(seconds: number): string {
  if (!seconds) return '0h 0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

@Component({
  selector: 'app-url-usage',
  standalone: true,
  imports: [DateRange, FormsModule],
  templateUrl: './url-usage.html',
  styleUrl: './url-usage.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeIn, staggerFadeIn, scaleIn]
})
export class UrlUsage {
  private readonly auth = inject(AuthService);
  private readonly activity = inject(ActivityService);
  private readonly employee = inject(EmployeeService);

  // Optional inputs for when used as a child component
  externalLogs = input<ActivityLog[] | null>(null);
  externalLoading = input<boolean | null>(null);
  hideHeader = input<boolean>(false);
  title = input<string>("URL Usage");

  private readonly _internalData = signal<{ domain: string; totalSeconds: number; visitCount: number; category: ActivityLog['category'] }[]>([]);
  readonly data = computed(() => {
    const ext = this.externalLogs();
    if (ext !== null) return this.activity.groupByDomain(ext);
    return this._internalData();
  });

  private readonly _internalLoading = signal(true);
  readonly loading = computed(() => {
    const ext = this.externalLoading();
    return ext !== null ? ext : this._internalLoading();
  });

  readonly dateRange = signal<{ from: Date; to: Date } | null>(null);
  readonly selectedEmployee = signal<string>('all');
  readonly employees = signal<AppUser[]>([]);

  readonly isAdmin = this.auth.isAdmin;

  constructor() {
    effect(() => {
      const ready = this.auth.authReady();
      const range = this.dateRange();
      const extLogs = this.externalLogs();

      if (ready && range && extLogs === null) {
        untracked(() => {
          this.loadData();
        });
      }
    });
  }

  async loadData() {
    this._internalLoading.set(true);
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

      this._internalData.set(this.activity.groupByDomain(logs));
    } finally {
      this._internalLoading.set(false);
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

  getTotalSeconds(): number {
    return this.data().reduce((acc, r) => acc + r.totalSeconds, 0);
  }

  getPercentage(seconds: number): string {
    const total = this.getTotalSeconds();
    if (total === 0) return '0%';
    return Math.round((seconds / total) * 100) + '%';
  }
}
