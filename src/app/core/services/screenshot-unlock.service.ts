import { Injectable, signal, computed, OnDestroy } from '@angular/core';

type LockMessage = { type: 'lock' } | { type: 'unlock'; expiresAt: number };

@Injectable({ providedIn: 'root' })
export class ScreenshotUnlockService implements OnDestroy {
  readonly isUnlocked = signal<boolean>(false);
  readonly unlockExpiresAt = signal<Date | null>(null);

  private timerHandle: ReturnType<typeof setTimeout> | null = null;

  /** BroadcastChannel for cross-tab lock/unlock propagation. */
  private readonly channel = typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('screenshot-unlock')
    : null;

  readonly remainingMinutes = computed(() => {
    const exp = this.unlockExpiresAt();
    if (!exp) return 0;
    return Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 60000));
  });

  constructor() {
    // Listen for lock/unlock events from other tabs
    this.channel?.addEventListener('message', (event: MessageEvent<LockMessage>) => {
      const msg = event.data;
      if (msg.type === 'lock') {
        this._applyLock();
      } else if (msg.type === 'unlock') {
        this._applyUnlock(new Date(msg.expiresAt));
      }
    });
  }

  ngOnDestroy(): void {
    this.channel?.close();
  }

  unlock(durationMinutes = 30): void {
    const expiry = new Date(Date.now() + durationMinutes * 60 * 1000);
    this._applyUnlock(expiry);
    // Notify all other open tabs
    this.channel?.postMessage({ type: 'unlock', expiresAt: expiry.getTime() } satisfies LockMessage);
  }

  lock(): void {
    this._applyLock();
    // Notify all other open tabs
    this.channel?.postMessage({ type: 'lock' } satisfies LockMessage);
  }

  /** Internal: apply unlock state without broadcasting (to avoid loops). */
  private _applyUnlock(expiry: Date): void {
    this._applyLock(); // clear any existing timer first
    this.isUnlocked.set(true);
    this.unlockExpiresAt.set(expiry);
    const ms = expiry.getTime() - Date.now();
    if (ms > 0) {
      this.timerHandle = setTimeout(() => this._applyLock(), ms);
    }
  }

  /** Internal: apply lock state without broadcasting (to avoid loops). */
  private _applyLock(): void {
    this.isUnlocked.set(false);
    this.unlockExpiresAt.set(null);
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
  }
}
