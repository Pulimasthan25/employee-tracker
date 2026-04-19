import {
  Component,
  inject,
  signal,
  computed,
  effect,
  untracked,
  ChangeDetectionStrategy,
  HostListener,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ScreenshotService, Screenshot } from '../../../core/services/screenshot.service';
import { AuthService } from '../../../core/services/auth.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { WebAuthnService } from '../../../core/services/webauthn.service';
import { ScreenshotUnlockService } from '../../../core/services/screenshot-unlock.service';
import { PasskeySetup } from '../../../shared/components/passkey-setup/passkey-setup';
import { AppSelect, SelectOption } from '../../../shared/components/select/select';
import type { AppUser } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { fadeIn, staggerFadeIn, scaleIn, slideInUp } from '../../../shared/animations';

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, DatePipe, PasskeySetup, AppSelect],
  templateUrl: './timeline.html',
  styleUrl: './timeline.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeIn, staggerFadeIn, scaleIn, slideInUp]
})
export class Timeline {
  @ViewChild('datePickerInput') datePickerInput!: ElementRef<HTMLInputElement>;
  private readonly screenshotService = inject(ScreenshotService);
  private readonly auth = inject(AuthService);
  private readonly employeeService = inject(EmployeeService);
  private readonly webauthn = inject(WebAuthnService);
  private readonly unlockService = inject(ScreenshotUnlockService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly isAdmin = this.auth.isAdmin;

  // State
  readonly loading = signal(true);
  readonly connectionError = signal(false);
  readonly screenshots = signal<Screenshot[]>([]);
  readonly employees = signal<AppUser[]>([]);
  readonly selectedDate = signal<string>(this.todayString());
  readonly userControl = new FormControl('all');
  readonly selectedUserId = toSignal(this.userControl.valueChanges, { initialValue: 'all' as string | null });
  readonly lightboxShot = signal<Screenshot | null>(null);
  readonly lightboxIndex = signal<number>(0);
  readonly privacyMode = signal<boolean>(true);

  readonly unlockLoading = signal<boolean>(false);

  readonly isUnlocked = computed(() => !this.isAdmin() || this.unlockService.isUnlocked());
  readonly isRegistered = computed(() => this.webauthn.isRegistered());

  /** Quick-lookup map: userId → displayName */
  readonly employeeMap = computed(() => {
    const map = new Map<string, AppUser>();
    for (const e of this.employees()) map.set(e.uid, e);
    return map;
  });

  readonly isAllMode = computed(() => this.selectedUserId() === 'all');
  
  readonly userOptions = computed<SelectOption[]>(() => {
    const list: SelectOption[] = [{ label: 'All employees', value: 'all' }];
    this.employees().forEach(emp => {
      list.push({
        label: emp.displayName || emp.email,
        value: emp.uid
      });
    });
    return list;
  });

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
    const uid = this.auth.firebaseUser()?.uid;
    if (uid) {
      void this.webauthn.checkRegistration(uid);
    }

    if (this.auth.isAdmin()) {
      try {
        const all = await this.employeeService.getAll();
        this.employees.set(all);
        // Default to 'all' — already set
      } catch {
        // non-fatal
      }
    } else {
      const currentUid = this.auth.firebaseUser()?.uid ?? '';
      this.userControl.setValue(currentUid);
    }
  }

  private async loadScreenshots(): Promise<void> {
    const uid = this.selectedUserId() || 'all';
    
    // Enforcement: Don't fetch if locked and user is admin
    if (this.isAdmin() && !this.unlockService.isUnlocked()) {
      this.screenshots.set([]);
      this.loading.set(false);
      return;
    }

    // For non-admin, uid is always set; for admin 'all' is valid too
    if (!uid) {
      this.screenshots.set([]);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.connectionError.set(false);

    const { from, to } = this.dateRange();

    try {
      let data: Screenshot[];
      if (uid === 'all') {
        data = await this.screenshotService.getScreenshotsForTeam(from, to);
      } else {
        data = await this.screenshotService.getScreenshotsForUser(uid, from, to);
      }
      this.screenshots.set(data);
    } catch (e) {
      console.error('Failed to load screenshots:', e);
      this.connectionError.set(true);
      this.toast.show('Failed to load screenshots. Please check your connection.', 'error');
      this.screenshots.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private dateRange(): { from: Date; to: Date } {
    const [year, month, day] = this.selectedDate().split('-').map(Number);
    const from = new Date(year, month - 1, day, 0, 0, 0, 0);
    const to   = new Date(year, month - 1, day, 23, 59, 59, 999);
    return { from, to };
  }

  private todayString(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  todayMax(): string {
    return this.todayString();
  }

  // ── Public helpers ────────────────────────────────────────────────────────

  getEmployeeName(userId: string): string {
    const emp = this.employeeMap().get(userId);
    return emp?.displayName || emp?.email || 'Unknown';
  }

  /** Returns initials for the avatar chip (max 2 chars) */
  getInitials(userId: string): string {
    const name = this.getEmployeeName(userId);
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  /** Deterministic hue from userId for avatar color */
  getAvatarHue(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash) % 360;
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

  setDate(val: string): void { 
    const max = this.todayString();
    this.selectedDate.set(val > max ? max : val);
  }
  setUser(val: string): void { this.userControl.setValue(val); }

  openDatePicker(): void {
    const input = this.datePickerInput?.nativeElement;
    if (!input) return;
    try {
      (input as any).showPicker();
    } catch {
      input.focus();
      input.click();
    }
  }

  shiftDate(delta: number): void {
    if (delta > 0 && this.isToday()) return;
    const [y, m, d] = this.selectedDate().split('-').map(Number);
    const date = new Date(y, m - 1, d + delta);
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const next = `${yy}-${mm}-${dd}`;
    const max = this.todayString();
    this.selectedDate.set(next > max ? max : next);
  }

  goToday(): void { this.selectedDate.set(this.todayString()); }

  isToday(): boolean { 
    return this.selectedDate() === this.todayString();
  }

  openLightbox(shot: Screenshot): void {
    const shots = this.byHour().get(shot.capturedAt.getHours()) ?? [];
    const idx = shots.findIndex(s => s.id === shot.id);
    this.lightboxShot.set(shot);
    this.lightboxIndex.set(idx >= 0 ? idx : 0);
  }

  closeLightbox(): void { this.lightboxShot.set(null); }

  prevShot(): void {
    const idx = this.lightboxIndex();
    if (idx <= 0) return;
    const shots = this.lightboxShots();
    this.lightboxIndex.set(idx - 1);
    this.lightboxShot.set(shots[idx - 1]);
  }

  nextShot(): void {
    const idx = this.lightboxIndex();
    const shots = this.lightboxShots();
    if (idx >= shots.length - 1) return;
    this.lightboxIndex.set(idx + 1);
    this.lightboxShot.set(shots[idx + 1]);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (!this.lightboxShot()) return;

    switch (event.key) {
      case 'ArrowLeft':
        this.prevShot();
        break;
      case 'ArrowRight':
        this.nextShot();
        break;
      case 'Escape':
        this.closeLightbox();
        break;
    }
  }

  async onAuthenticate() {
    if (this.unlockLoading()) return;
    this.unlockLoading.set(true);

    const uid = this.auth.firebaseUser()?.uid;
    if (!uid) {
      this.toast.show('User session expired. Please refresh.', 'error');
      this.unlockLoading.set(false);
      return;
    }

    try {
      const success = await this.webauthn.authenticate(uid);
      if (success) {
        this.unlockService.unlock();
        this.toast.show('Screenshots unlocked', 'success');
        await this.loadScreenshots();
      } else {
        this.toast.show('Authentication failed. Please try again.', 'error');
      }
    } catch (e: any) {
      this.handleAuthError(e);
    } finally {
      this.unlockLoading.set(false);
    }
  }

  async onRegisterAndUnlock() {
    if (this.unlockLoading()) return;
    this.unlockLoading.set(true);

    const uid = this.auth.firebaseUser()?.uid;
    const email = this.auth.firebaseUser()?.email;

    if (!uid || !email) {
      this.toast.show('User session not found.', 'error');
      this.unlockLoading.set(false);
      return;
    }

    try {
      await this.webauthn.registerPasskey(uid, email);
      const success = await this.webauthn.authenticate(uid);
      if (success) {
        this.unlockService.unlock();
        this.toast.show('Passkey registered and screenshots unlocked', 'success');
        await this.loadScreenshots();
      } else {
        this.toast.show('Registration successful, but verification failed.', 'warning');
      }
    } catch (e: any) {
      this.handleAuthError(e);
    } finally {
      this.unlockLoading.set(false);
    }
  }

  private handleAuthError(e: any): void {
    console.error('WebAuthn Error:', e);
    const msg = e.message || '';
    
    if (msg.includes('NotAllowedError') || msg.includes('cancelled') || msg.includes('timed out')) {
      this.toast.show('Authentication cancelled or timed out.', 'info');
    } else if (msg.includes('InvalidStateError')) {
      this.toast.show('This device is already registered. Please try to Unlock instead.', 'warning');
    } else if (msg.includes('SecurityError')) {
      this.toast.show('Security error. Ensure you are using a secure connection.', 'error');
    } else {
      this.toast.show('Something went wrong with the authentication.', 'error');
    }
  }

  onManagePasskeys() {
    this.router.navigate(['/settings/security']);
  }

  protected readonly unlockServicePublic = this.unlockService;
}