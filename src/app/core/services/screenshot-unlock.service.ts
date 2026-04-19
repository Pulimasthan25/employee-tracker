import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ScreenshotUnlockService {
  readonly isUnlocked = signal<boolean>(false);
  readonly unlockExpiresAt = signal<Date | null>(null);

  private timerHandle: ReturnType<typeof setTimeout> | null = null;

  readonly remainingMinutes = computed(() => {
    const exp = this.unlockExpiresAt();
    if (!exp) return 0;
    return Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 60000));
  });

  unlock(durationMinutes = 15): void {
    this.lock(); // Clear existing
    
    this.isUnlocked.set(true);
    const expiry = new Date(Date.now() + durationMinutes * 60 * 1000);
    this.unlockExpiresAt.set(expiry);
    
    this.timerHandle = setTimeout(() => {
      this.lock();
    }, durationMinutes * 60 * 1000);
  }

  lock(): void {
    this.isUnlocked.set(false);
    this.unlockExpiresAt.set(null);
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
  }
}
