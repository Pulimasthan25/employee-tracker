import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { fadeIn, scaleIn } from '../../animations';
import { ConfirmService } from '../../../core/services/confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (service.data(); as data) {
      <div class="confirm-backdrop" (click)="service.close()" @fadeIn>
        <div class="confirm-modal" (click)="$event.stopPropagation()" @scaleIn>
          <div class="confirm-modal__header">
             <div class="confirm-modal__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h2 class="confirm-modal__title">{{ data.title }}</h2>
          </div>
          <p class="confirm-modal__message">{{ data.message }}</p>
          <div class="confirm-modal__actions">
            <button class="btn btn--secondary" (click)="service.close()">
              {{ data.cancelText || 'Cancel' }}
            </button>
            <button class="btn btn--danger" (click)="data.onConfirm(); service.close()">
              {{ data.confirmText || 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styleUrl: './confirm-dialog.scss',
  animations: [fadeIn, scaleIn]
})
export class ConfirmDialog {
  readonly service = inject(ConfirmService);
}
