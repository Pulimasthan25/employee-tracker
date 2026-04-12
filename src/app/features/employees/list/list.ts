import {
  Component,
  inject,
  signal,
  computed,
  effect,
  untracked,
  ChangeDetectionStrategy,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { EmployeeService } from '../../../core/services/employee.service';
import { AuthService } from '../../../core/services/auth.service';
import type { AppUser } from '../../../core/services/auth.service';
import { fadeIn, slideInUp, staggerFadeIn } from '../../../shared/animations';

export type SortField =
  | 'displayName'
  | 'email'
  | 'teamId'
  | 'role'
  | 'active'
  | 'screenshotIntervalSeconds'
  | 'idleThresholdSeconds'
  | 'shiftHours'
  | 'createdAt';

export type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-list',
  imports: [RouterLink, DatePipe],
  templateUrl: './list.html',
  styleUrl: './list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeIn, slideInUp, staggerFadeIn]
})
export class List {
  private readonly employeeService = inject(EmployeeService);
  private readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly connectionError = signal(false);
  readonly employees = signal<AppUser[]>([]);

  readonly sortField = signal<SortField>('displayName');
  readonly sortDir = signal<SortDir>('asc');

  readonly sortedEmployees = computed(() => {
    const list = [...this.employees()];
    const field = this.sortField();
    const dir = this.sortDir();

    list.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      if (field === 'shiftHours') {
        aVal = a.shiftStartHour ?? 20;
        bVal = b.shiftStartHour ?? 20;
      } else if (field === 'active') {
        aVal = a.active ? 1 : 0;
        bVal = b.active ? 1 : 0;
      } else {
        aVal = (a as any)[field] ?? '';
        bVal = (b as any)[field] ?? '';
      }

      if (aVal instanceof Date && bVal instanceof Date) {
        return dir === 'asc'
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime();
      }

      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return dir === 'asc' ? cmp : -cmp;
    });

    return list;
  });

  constructor() {
    effect(() => {
      const ready = this.auth.authReady();
      if (!ready) return;
      untracked(() => this.load());
    });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.connectionError.set(false);
    try {
      const all = await this.employeeService.getAll();
      this.employees.set(all);
    } catch {
      this.connectionError.set(true);
      this.employees.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  sort(field: SortField): void {
    if (this.sortField() === field) {
      this.sortDir.update(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortField.set(field);
      this.sortDir.set('asc');
    }
  }

  getTeamHue(team: string | undefined): number {
    if (!team) return 0;
    const professionalHues = [210, 225, 190, 170, 200, 215, 235, 180, 160, 205];
    let hash = 0;
    for (let i = 0; i < team.length; i++) {
      hash = team.charCodeAt(i) + ((hash << 5) - hash);
    }
    return professionalHues[Math.abs(hash) % professionalHues.length];
  }

  formatInterval(seconds: number | undefined): string {
    if (seconds == null) return '—';
    if (seconds < 60) return `${seconds}s`;
    return `${seconds / 60}m`;
  }

  formatIdle(seconds: number | undefined): string {
    if (seconds == null) return '5m';
    if (seconds < 60) return `${seconds}s`;
    return `${seconds / 60}m`;
  }

  formatShift(start: number | undefined, end: number | undefined): string {
    const fmt = (h: number) => {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${h12}${ampm}`;
    };
    return `${fmt(start ?? 20)} → ${fmt(end ?? 4)}`;
  }
}
