import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { WebAuthnService, StoredCredential } from '../../core/services/webauthn.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { PasskeySetup } from '../../shared/components/passkey-setup/passkey-setup';
import { fadeIn, scaleIn, slideInUp } from '../../shared/animations';

@Component({
  selector: 'app-security',
  standalone: true,
  imports: [CommonModule, PasskeySetup],
  templateUrl: './security.html',
  styleUrl: './security.scss',
  animations: [fadeIn, scaleIn, slideInUp]
})
export class Security implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly webauthn = inject(WebAuthnService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  // Gate: has the user authenticated for this session?
  isVerified = signal<boolean>(false);
  verifyLoading = signal<boolean>(false);

  // Is a passkey registered at all? Determines whether we show the gate.
  readonly isRegistered = this.webauthn.isRegistered;

  // WebAuthn states
  credentials = signal<StoredCredential[]>([]);
  credentialsLoading = signal<boolean>(false);
  registerLoading = signal<boolean>(false);
  deleteLoadingId = signal<string | null>(null);

  ngOnInit() {
    const uid = this.auth.firebaseUser()?.uid;
    if (uid) {
      // Check if passkeys are registered so we know whether to show the gate.
      // We do NOT load credentials here — only after the user authenticates.
      this.webauthn.checkRegistration(uid).then(() => {
        // If no passkey registered, treat as verified (first-time setup mode)
        if (!this.webauthn.isRegistered()) {
          this.isVerified.set(true);
          this.loadCredentials();
        }
      });
    }
  }

  /** Called when user taps "Unlock" on the passkey-setup gate. */
  async onAuthenticate() {
    if (this.verifyLoading()) return;
    this.verifyLoading.set(true);

    const uid = this.auth.firebaseUser()?.uid;
    if (!uid) {
      this.toast.show('User session expired. Please refresh.', 'error');
      this.verifyLoading.set(false);
      return;
    }

    try {
      const success = await this.webauthn.authenticate(uid);
      if (success) {
        this.isVerified.set(true);
        this.toast.show('Identity verified', 'success');
        await this.loadCredentials();
      } else {
        this.toast.show('Authentication failed. Please try again.', 'error');
      }
    } catch (e: any) {
      this.handleAuthError(e);
    } finally {
      this.verifyLoading.set(false);
    }
  }

  /** Called when user has no passkey yet and taps "Setup Passkey" on the gate. */
  async onRegisterAndUnlock() {
    if (this.verifyLoading()) return;
    this.verifyLoading.set(true);

    const uid = this.auth.firebaseUser()?.uid;
    const email = this.auth.firebaseUser()?.email;

    if (!uid || !email) {
      this.toast.show('User session not found.', 'error');
      this.verifyLoading.set(false);
      return;
    }

    try {
      await this.webauthn.registerPasskey(uid, email);
      this.isVerified.set(true);
      this.toast.show('Passkey registered successfully', 'success');
      await this.loadCredentials();
    } catch (e: any) {
      this.handleAuthError(e);
    } finally {
      this.verifyLoading.set(false);
    }
  }

  private handleAuthError(e: any): void {
    const msg = e?.message || '';
    if (msg.includes('NotAllowedError') || msg.includes('cancelled') || msg.includes('timed out')) {
      this.toast.show('Authentication cancelled or timed out.', 'info');
    } else if (msg.includes('InvalidStateError')) {
      this.toast.show('This device is already registered.', 'warning');
    } else {
      this.toast.show(e.message || 'Authentication failed', 'error');
    }
  }

  async loadCredentials() {
    this.credentialsLoading.set(true);
    const uid = this.auth.firebaseUser()?.uid;
    if (!uid || !this.auth.isAdmin()) {
      this.credentialsLoading.set(false);
      return;
    }
    const creds = await this.webauthn.getStoredCredentials(uid);
    this.credentials.set(creds);
    this.credentialsLoading.set(false);
  }

  async onAddPasskey() {
    this.registerLoading.set(true);
    const uid = this.auth.firebaseUser()?.uid;
    const email = this.auth.firebaseUser()?.email;

    if (!uid || !email) {
      this.toast.show('User session not found', 'error');
      this.registerLoading.set(false);
      return;
    }

    try {
      // If the user already has passkeys, verify one before adding a new one.
      if (this.credentials().length > 0) {
        const verified = await this.webauthn.authenticate(uid);
        if (!verified) {
          this.toast.show('Identity verification required to add a new passkey.', 'warning');
          return;
        }
      }

      await this.webauthn.registerPasskey(uid, email);
      await this.loadCredentials();
      this.toast.show('Passkey registered successfully', 'success');
    } catch (e: any) {
      this.toast.show(e.message || 'Registration failed', 'error');
    } finally {
      this.registerLoading.set(false);
    }
  }

  async onDeleteCredential(credentialId: string) {
    const uid = this.auth.firebaseUser()?.uid;
    if (!uid) return;

    this.confirmService.confirm({
      title: 'Remove Passkey?',
      message: 'You will need to verify your identity to remove this security credential.',
      confirmText: 'Verify & Delete',
      onConfirm: async () => {
        this.deleteLoadingId.set(credentialId);
        try {
          const verified = await this.webauthn.authenticate(uid);
          if (verified) {
            await this.webauthn.deleteCredential(uid, credentialId);
            await this.loadCredentials();
            this.toast.show('Passkey removed successfully', 'success');
          } else {
            this.toast.show('Identity verification failed.', 'error');
          }
        } catch (e: any) {
          this.toast.show(e.message || 'Verification failed', 'error');
        } finally {
          this.deleteLoadingId.set(null);
        }
      }
    });
  }
}
