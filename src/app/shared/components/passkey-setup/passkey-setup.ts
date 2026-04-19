import { Component, input, output, ChangeDetectionStrategy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { fadeIn, scaleIn } from '../../animations';

@Component({
  selector: 'app-passkey-setup',
  imports: [CommonModule],
  templateUrl: './passkey-setup.html',
  styleUrl: './passkey-setup.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeIn, scaleIn]
})
export class PasskeySetup {
  isRegistered = input<boolean>(false);
  loading = input<boolean>(false);
  error = input<string | null>(null);
  remainingSessionHint = input<number>(15);

  registerAndUnlock = output<void>();
  authenticate = output<void>();
  managePasskeys = output<void>();

  readonly isBrowserSupported = computed(() => !!window.PublicKeyCredential);

  onPrimaryAction() {
    if (this.isRegistered()) {
      this.authenticate.emit();
    } else {
      this.registerAndUnlock.emit();
    }
  }
}
