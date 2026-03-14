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

@Component({
  selector: 'app-list',
  imports: [RouterLink, DatePipe],
  templateUrl: './list.html',
  styleUrl: './list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
}
