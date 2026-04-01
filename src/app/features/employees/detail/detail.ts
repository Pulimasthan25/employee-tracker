import {
  Component,
  inject,
  signal,
  effect,
  untracked,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { EmployeeService } from '../../../core/services/employee.service';
import { ToastService } from '../../../core/services/toast.service';
import type { AppUser } from '../../../core/services/auth.service';

@Component({
  selector: 'app-detail',
  imports: [RouterLink, DatePipe],
  templateUrl: './detail.html',
  styleUrl: './detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Detail {
  private readonly route = inject(ActivatedRoute);
  private readonly employeeService = inject(EmployeeService);
  private readonly toastService = inject(ToastService);

  readonly id = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('id') ?? '')),
    { initialValue: '' }
  );

  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly employee = signal<AppUser | null>(null);

  readonly intervalOptions = [
    { label: '1 minute',    value: 60   },
    { label: '5 minutes',   value: 300  },
    { label: '15 minutes',  value: 900  },
    { label: '30 minutes',  value: 1800 },
    { label: '1 hour',      value: 3600 },
    { label: 'Disabled',    value: 0   },
  ];

  readonly savingInterval = signal(false);
  readonly savingShiftHours = signal(false);

  readonly shiftHourOptions = Array.from({ length: 24 }, (_, h) => ({
    label: `${String(h).padStart(2, '0')}:00`,
    value: h,
  }));

  openStart = false;
  openEnd = false;

  formatShiftHour(h: number): string {
    return `${String(h).padStart(2, '0')}:00`;
  }

  constructor() {
    effect(() => {
      const id = this.id();
      if (!id) return;
      untracked(() => this.load(id));
    });
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.notFound.set(false);
    this.employee.set(null);
    try {
      const emp = await this.employeeService.getById(id);
      if (emp) {
        this.employee.set(emp);
      } else {
        this.notFound.set(true);
      }
    } catch {
      this.notFound.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  async deactivate(): Promise<void> {
    const emp = this.employee();
    if (!emp?.active) return;
    try {
      await this.employeeService.deactivate(emp.uid);
      this.employee.set({ ...emp, active: false });
    } catch {
      // Could show toast
    }
  }

  async onIntervalChange(seconds: number): Promise<void> {
    if (!this.employee()?.uid) return;
    this.savingInterval.set(true);
    try {
      await this.employeeService.updateScreenshotInterval(
        this.employee()!.uid,
        seconds
      );
      this.toastService.show('Screenshot interval updated.', 'success');
      // Update the local employee object
      const emp = this.employee();
      if (emp) {
        this.employee.set({ ...emp, screenshotIntervalSeconds: seconds });
      }
    } catch {
      this.toastService.show('Failed to update interval.', 'error');
    } finally {
      this.savingInterval.set(false);
    }
  }

  async onShiftHoursChange(startHour: number, endHour: number): Promise<void> {
    if (!this.employee()?.uid) return;
    this.savingShiftHours.set(true);
    try {
      await this.employeeService.updateShiftHours(
        this.employee()!.uid,
        startHour,
        endHour
      );
      this.toastService.show('Shift hours updated.', 'success');
      const emp = this.employee();
      if (emp) {
        this.employee.set({ ...emp, shiftStartHour: startHour, shiftEndHour: endHour });
      }
    } catch {
      this.toastService.show('Failed to update shift hours.', 'error');
    } finally {
      this.savingShiftHours.set(false);
    }
  }
}
