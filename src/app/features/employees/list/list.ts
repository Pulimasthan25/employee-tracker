import {
  Component,
  inject,
  signal,
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

  getTeamHue(team: string | undefined): number {
    if (!team) return 0;
    const professionalHues = [210, 225, 190, 170, 200, 215, 235, 180, 160, 205];
    let hash = 0;
    for (let i = 0; i < team.length; i++) {
      hash = team.charCodeAt(i) + ((hash << 5) - hash);
    }
    return professionalHues[Math.abs(hash) % professionalHues.length];
  }
}
