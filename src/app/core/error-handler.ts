import { ErrorHandler, Injectable, inject } from '@angular/core';
import { ToastService } from './services/toast.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private toast = inject(ToastService);

  handleError(error: unknown): void {
    console.error('[Pulse Error]', error);
    const msg = (error as { message?: string })?.message ?? 'An unexpected error occurred.';
    if (!msg.includes('onSnapshot') && !msg.includes('Firebase')) {
      this.toast.show(msg, 'error');
    }
  }
}
