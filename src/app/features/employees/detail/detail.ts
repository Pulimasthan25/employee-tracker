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
import { ConfirmService } from '../../../core/services/confirm.service';
import { Router } from '@angular/router';
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
  private readonly confirmService = inject(ConfirmService);
  private readonly router = inject(Router);

  readonly id = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('id') ?? '')),
    { initialValue: '' }
  );

  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly employee = signal<AppUser | null>(null);
  readonly showReactivationSuccess = signal(false);
  readonly downloadUrl = signal<string | null>(null);
  readonly linkCopied = signal(false);

  readonly intervalOptions = [
    { label: '1 minute',    value: 60   },
    { label: '5 minutes',   value: 300  },
    { label: '15 minutes',  value: 900  },
    { label: '30 minutes',  value: 1800 },
    { label: '1 hour',      value: 3600 },
    { label: 'Disabled',    value: 0   },
  ];

  readonly idleThresholdOptions = [
    { label: '1 minute', value: 60 },
    { label: '2 minutes', value: 120 },
    { label: '3 minutes', value: 180 },
    { label: '5 minutes', value: 300 },
    { label: '10 minutes', value: 600 },
    { label: '15 minutes', value: 900 },
  ];

  readonly savingInterval = signal(false);
  readonly savingIdleThreshold = signal(false);
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
    
    this.confirmService.confirm({
      title: 'Deactivate Employee',
      message: `Are you sure you want to deactivate ${emp.displayName || emp.email}? This will trigger an uninstallation of the agent on their device.`,
      confirmText: 'Deactivate',
      onConfirm: async () => {
        try {
          await this.employeeService.deactivate(emp.uid);
          this.employee.set({ ...emp, active: false });
          this.toastService.show('Employee deactivated successfully.', 'success');
        } catch {
          this.toastService.show('Failed to deactivate employee.', 'error');
        }
      }
    });
  }

  async reactivate(): Promise<void> {
    const emp = this.employee();
    if (!emp || emp.active) return;

    this.confirmService.confirm({
      title: 'Reactivate Employee',
      message: `Are you sure you want to reactivate ${emp.displayName || emp.email}?`,
      confirmText: 'Reactivate',
      onConfirm: async () => {
        try {
          await this.employeeService.reactivate(emp.uid);
          this.employee.set({ ...emp, active: true });
          this.showReactivationSuccess.set(true);
          this.fetchLatestRelease();
          this.toastService.show('Employee reactivated successfully.', 'success');
        } catch {
          this.toastService.show('Failed to reactivate employee.', 'error');
        }
      }
    });
  }

  async deleteRecord(): Promise<void> {
    const emp = this.employee();
    if (!emp) return;
    if (emp.active) {
      this.toastService.show('Employee must be deactivated before deletion.', 'info');
      return;
    }

    this.confirmService.confirm({
      title: 'Delete Employee',
      message: `Are you sure you want to permanently delete all data for ${emp.displayName || emp.email}? This action cannot be undone.`,
      confirmText: 'Delete Forever',
      onConfirm: async () => {
        try {
          await this.employeeService.delete(emp.uid);
          this.toastService.show('Employee deleted successfully.', 'success');
          this.router.navigate(['/employees']);
        } catch {
          this.toastService.show('Failed to delete employee.', 'error');
        }
      }
    });
  }

  async fetchLatestRelease() {
    try {
      const response = await fetch('https://api.github.com/repos/masthan-pm/pulsetrack-agent-releases/releases/latest');
      if (response.ok) {
        const data = await response.json();
        const asset = data.assets?.find((a: any) => a.name.endsWith('.exe'));
        if (asset) {
          this.downloadUrl.set(asset.browser_download_url);
          return;
        }
      }
    } catch (e) {
      console.error('Failed to fetch latest release', e);
    }
    this.downloadUrl.set('https://github.com/masthan-pm/pulsetrack-agent-releases/releases/latest');
  }

  async copyLink() {
    const url = this.downloadUrl();
    if (url) {
      try {
        await navigator.clipboard.writeText(url);
        this.linkCopied.set(true);
        setTimeout(() => this.linkCopied.set(false), 2000);
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
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

  async onIdleThresholdChange(seconds: number): Promise<void> {
    if (!this.employee()?.uid) return;
    this.savingIdleThreshold.set(true);
    try {
      await this.employeeService.updateIdleThreshold(this.employee()!.uid, seconds);
      this.toastService.show('Idle threshold updated.', 'success');
      const emp = this.employee();
      if (emp) this.employee.set({ ...emp, idleThresholdSeconds: seconds });
    } catch {
      this.toastService.show('Failed to update idle threshold.', 'error');
    } finally {
      this.savingIdleThreshold.set(false);
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
