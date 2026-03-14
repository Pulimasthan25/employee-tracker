import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-container">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="toast"
          [class.toast--error]="toast.type === 'error'"
          [class.toast--success]="toast.type === 'success'"
        >
          <span>{{ toast.message }}</span>
          <button (click)="toastService.dismiss(toast.id)">✕</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      z-index: 9999;
    }
    .toast {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 16px;
      min-width: 280px;
      max-width: 420px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      font-size: 13px;
      color: var(--text-primary);
      animation: slideIn 0.2s ease;
    }
    .toast--error   { border-color: rgba(240,82,82,0.4);   color: var(--danger);  }
    .toast--success { border-color: rgba(52,201,138,0.4);  color: var(--success); }
    button {
      background: none; border: none; color: inherit;
      cursor: pointer; font-size: 14px; padding: 0; opacity: 0.6;
    }
    button:hover { opacity: 1; }
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(16px); }
      to   { opacity: 1; transform: translateX(0); }
    }
  `]
})
export class ToastComponent {
  toastService = inject(ToastService);
}
