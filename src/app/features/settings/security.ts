import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { WebAuthnService, StoredCredential } from '../../core/services/webauthn.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { fadeIn, scaleIn, slideInUp } from '../../shared/animations';

@Component({
  selector: 'app-security',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './security.html',
  styleUrl: './security.scss',
  animations: [fadeIn, scaleIn, slideInUp]
})
export class Security implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly webauthn = inject(WebAuthnService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  // WebAuthn states
  credentials = signal<StoredCredential[]>([]);
  credentialsLoading = signal<boolean>(false);
  registerLoading = signal<boolean>(false);
  deleteLoadingId = signal<string | null>(null);

  ngOnInit() {
    this.loadCredentials();
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
      // If the user already has passkeys, they MUST verify one before adding a new one.
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
