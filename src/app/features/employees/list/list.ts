import {
  Component,
  inject,
  signal,
  computed,
  effect,
  untracked,
  ChangeDetectionStrategy,
  HostListener,
  OnInit,
  OnDestroy
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { EmployeeService } from '../../../core/services/employee.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { SettingsService } from '../../../core/services/settings.service';
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
export class List implements OnInit, OnDestroy {
  private readonly employeeService = inject(EmployeeService);
  private readonly auth = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);
  private readonly settingsService = inject(SettingsService);

  readonly loading = signal(true);
  readonly connectionError = signal(false);
  readonly employees = signal<AppUser[]>([]);

  readonly sortField = signal<SortField>('displayName');
  readonly sortDir = signal<SortDir>('asc');
  
  readonly openActionMenu = signal<string | null>(null);

  ngOnInit() {
    this.settingsService.setPrimaryAction({
      label: 'Invite employee',
      icon: 'plus',
      routerLink: '/settings/employees/invite'
    });
  }

  ngOnDestroy() {
    this.settingsService.setPrimaryAction(null);
  }

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

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.list__actions-menu')) {
      this.openActionMenu.set(null);
    }
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

  toggleActionMenu(uid: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.openActionMenu() === uid) {
      this.openActionMenu.set(null);
    } else {
      this.openActionMenu.set(uid);
    }
  }

  async deactivate(emp: AppUser, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.openActionMenu.set(null);
    
    if (!emp.active) return;

    this.confirmService.confirm({
      title: 'Deactivate Employee',
      message: `Are you sure you want to deactivate ${emp.displayName || emp.email}? This will trigger an uninstallation of the agent on their device.`,
      confirmText: 'Deactivate',
      onConfirm: async () => {
        try {
          await this.employeeService.deactivate(emp.uid);
          const list = this.employees();
          this.employees.set(list.map(e => e.uid === emp.uid ? { ...e, active: false } : e));
          this.toastService.show('Employee deactivated successfully.', 'success');
        } catch {
          this.toastService.show('Failed to deactivate employee.', 'error');
        }
      }
    });
  }

  async repairAgent(emp: AppUser, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.openActionMenu.set(null);
    
    if (!emp.active) return;

    this.confirmService.confirm({
      title: 'Repair Agent',
      message: `This will remotely restart ${emp.displayName || emp.email}'s agent and re-initialize its tracking services.`,
      confirmText: 'Repair Agent',
      onConfirm: async () => {
        try {
          await this.employeeService.repairAgent(emp.uid);
          this.toastService.show('Repair command sent to agent.', 'success');
        } catch {
          this.toastService.show('Failed to send repair command.', 'error');
        }
      }
    });
  }

  async reactivate(emp: AppUser, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.openActionMenu.set(null);
    
    if (emp.active) return;

    this.confirmService.confirm({
      title: 'Reactivate Employee',
      message: `Are you sure you want to reactivate ${emp.displayName || emp.email}?`,
      confirmText: 'Reactivate',
      onConfirm: async () => {
        try {
          await this.employeeService.reactivate(emp.uid);
          const list = this.employees();
          this.employees.set(list.map(e => e.uid === emp.uid ? { ...e, active: true } : e));
          this.toastService.show('Employee reactivated. Use "Copy Info Link" to send them the agent.', 'success');
        } catch {
          this.toastService.show('Failed to reactivate employee.', 'error');
        }
      }
    });
  }

  async copyLink(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.openActionMenu.set(null);
    
    try {
      const response = await fetch('https://api.github.com/repos/masthan-pm/pulsetrack-agent-releases/releases/latest');
      let url = 'https://github.com/masthan-pm/pulsetrack-agent-releases/releases/latest';
      if (response.ok) {
        const data = await response.json();
        const asset = data.assets?.find((a: any) => a.name.endsWith('.exe'));
        if (asset) {
          url = asset.browser_download_url;
        }
      }
      await navigator.clipboard.writeText(url);
      this.toastService.show('Agent download link copied to clipboard!', 'success');
    } catch (e) {
      this.toastService.show('Failed to copy link.', 'error');
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
