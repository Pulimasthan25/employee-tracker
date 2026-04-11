import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('toastAnim', [
      transition(':enter', [
        style({ transform: 'translateY(12px)', opacity: 0 }),
        animate('350ms cubic-bezier(0.1, 0.9, 0.2, 1)', style({ transform: 'translateY(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ transform: 'scale(0.95)', opacity: 0 }))
      ])
    ])
  ],
  template: `
    <div class="toast-container">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="toast"
          [@toastAnim]
          [class.toast--error]="toast.type === 'error'"
          [class.toast--success]="toast.type === 'success'"
        >
          <div class="toast__content">
            @if (toast.type === 'error') {
              <svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            } @else {
              <svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            }
            <span>{{ toast.message }}</span>
          </div>
          <button class="toast__close" (click)="toastService.dismiss(toast.id)">✕</button>
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
      gap: 12px;
      z-index: 9999;
    }
    .toast {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 18px;
      min-width: 320px;
      max-width: 480px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      font-size: 0.875rem;
      color: var(--text-primary);
      box-shadow: var(--shadow-lg);
      backdrop-filter: blur(8px);
    }
    .toast__content {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .toast__icon {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }
    .toast--error   { 
      border-color: rgba(240,82,82,0.3);   
      .toast__icon { color: var(--danger); }
    }
    .toast--success { 
      border-color: rgba(52,201,138,0.3);  
      .toast__icon { color: var(--success); }
    }
    .toast__close {
      background: none; border: none; color: var(--text-muted);
      cursor: pointer; font-size: 16px; padding: 4px; 
      transition: color 0.15s;
      &:hover { color: var(--text-primary); }
    }
  `]
})
export class ToastComponent {
  toastService = inject(ToastService);
}
