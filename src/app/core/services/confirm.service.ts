import { Injectable, signal } from '@angular/core';

export interface ConfirmData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly data = signal<ConfirmData | null>(null);

  confirm(options: ConfirmData) {
    this.data.set(options);
  }

  close() {
    this.data.set(null);
  }
}
