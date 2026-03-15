import {
  Component,
  inject,
  signal,
  computed,
  effect,
  untracked,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ScreenshotService, Screenshot } from '../../../core/services/screenshot.service';
import { AuthService } from '../../../core/services/auth.service';
import { EmployeeService } from '../../../core/services/employee.service';
import type { AppUser } from '../../../core/services/auth.service';

@Component({
  selector: 'app-timeline',
  imports: [FormsModule],
  templateUrl: './timeline.html',
  styleUrl: './timeline.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Timeline {
  private readonly screenshotService = inject(ScreenshotService);
  private readonly auth = inject(AuthService);
  private readonly employeeService = inject(EmployeeService);

  readonly isAdmin = this.auth.isAdmin;

  // State
  readonly loading = signal(true);
  readonly connectionError = signal(false);
  readonly screenshots = signal<Screenshot[]>([]);
  readonly employees = signal<AppUser[]>([]);
  readonly selectedDate = signal<string>(this.todayString());
  readonly selectedUserId = signal<string>('');
  readonly lightboxShot = signal<Screenshot | null>(null);
  readonly lightboxIndex = signal<number>(0);

  // Derived
  readonly byHour = computed(() =>
    this.screenshotService.groupByHour(this.screenshots())
  );

  readonly activeHours = computed(() => {
    const map = this.byHour();
    const hours: { hour: number; shots: Screenshot[] }[] = [];
    for (let h = 0; h < 24; h++) {
      const shots = map.get(h) ?? [];
      if (shots.length > 0) hours.push({ hour: h, shots });
    }
    return hours;
  });

  readonly totalCount = computed(() => this.screenshots().length);

  readonly lightboxShots = computed(() => {
    const shot = this.lightboxShot();
    if (!shot) return [];
    const h = shot.capturedAt.getHours();
    return this.byHour().get(h) ?? [];
  });

  constructor() {
    effect(() => {
      const ready = this.auth.authReady();
      if (!ready) return;
      untracked(() => this.init());
    });

    effect(() => {
      const date = this.selectedDate();
      const uid = this.selectedUserId();
      const ready = this.auth.authReady();
      if (!ready) return;
      untracked(() => this.loadScreenshots());
    });
  }

  private async init(): Promise<void> {
    if (this.auth.isAdmin()) {
      try {
        const all = await this.employeeService.getAll();
        this.employees.set(all);
        if (all.length > 0) {
          this.selectedUserId.set(all[0].uid);
        }
      } catch {
        // non-fatal
      }
    } else {
      const uid = this.auth.firebaseUser()?.uid ?? '';
      this.selectedUserId.set(uid);
    }
  }

  private async loadScreenshots(): Promise<void> {
    const uid = this.selectedUserId();
    if (!uid) {
      this.screenshots.set([]);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.connectionError.set(false);

    const { from, to } = this.dateRange();

    try {
      const data = await this.screenshotService.getScreenshotsForUser(uid, from, to);
      this.screenshots.set(data);
    } catch (e) {
      console.error('Failed to load screenshots:', e);
      this.connectionError.set(true);
      this.screenshots.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private dateRange(): { from: Date; to: Date } {
    const d = new Date(this.selectedDate());
    // parse YYYY-MM-DD as local date
    const [year, month, day] = this.selectedDate().split('-').map(Number);
    const from = new Date(year, month - 1, day, 0, 0, 0, 0);
    const to = new Date(year, month - 1, day, 23, 59, 59, 999);
    return { from, to };
  }

  private todayString(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  formatHour(h: number): string {
    if (h === 0) return '12 AM';
    if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  }

  formatTime(d: Date): string {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  openLightbox(shot: Screenshot): void {
    const shots = this.byHour().get(shot.capturedAt.getHours()) ?? [];
    this.lightboxIndex.set(shots.indexOf(shot));
    this.lightboxShot.set(shot);
  }

  closeLightbox(): void {
    this.lightboxShot.set(null);
  }

  prevShot(): void {
    const shots = this.lightboxShots();
    const idx = this.lightboxIndex();
    if (idx > 0) {
      this.lightboxIndex.set(idx - 1);
      this.lightboxShot.set(shots[idx - 1]);
    }
  }

  nextShot(): void {
    const shots = this.lightboxShots();
    const idx = this.lightboxIndex();
    if (idx < shots.length - 1) {
      this.lightboxIndex.set(idx + 1);
      this.lightboxShot.set(shots[idx + 1]);
    }
  }

  setDate(val: string): void {
    this.selectedDate.set(val);
  }

  setUser(uid: string): void {
    this.selectedUserId.set(uid);
  }

  goToday(): void {
    this.selectedDate.set(this.todayString());
  }

  shiftDate(delta: number): void {
    const [y, m, d] = this.selectedDate().split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + delta);
    const ny = date.getFullYear();
    const nm = String(date.getMonth() + 1).padStart(2, '0');
    const nd = String(date.getDate()).padStart(2, '0');
    this.selectedDate.set(`${ny}-${nm}-${nd}`);
  }

  isToday(): boolean {
    return this.selectedDate() === this.todayString();
  }

  selectedEmployee = computed(() => {
    const uid = this.selectedUserId();
    return this.employees().find((e) => e.uid === uid) ?? null;
  });
}