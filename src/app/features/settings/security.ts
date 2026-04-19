import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { WebAuthnService, StoredCredential } from '../../core/services/webauthn.service';
import { ConfirmService } from '../../core/services/confirm.service';
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

  // WebAuthn states
  credentials = signal<StoredCredential[]>([]);
  credentialsLoading = signal<boolean>(false);
  registerLoading = signal<boolean>(false);
  registerError = signal<string | null>(null);
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
    this.registerError.set(null);
    const uid = this.auth.firebaseUser()?.uid;
    const email = this.auth.firebaseUser()?.email;
    
    if (!uid || !email) {
      this.registerError.set('User session not found');
      this.registerLoading.set(false);
      return;
    }

    try {
      // If the user already has passkeys, they MUST verify one before adding a new one.
      if (this.credentials().length > 0) {
        const verified = await this.webauthn.authenticate(uid);
        if (!verified) {
          this.registerError.set('Identity verification required to add a new passkey.');
          return;
        }
      }

      await this.webauthn.registerPasskey(uid, email);
      await this.loadCredentials();
    } catch (e: any) {
      this.registerError.set(e.message || 'Registration failed');
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
          } else {
            this.registerError.set('Identity verification failed.');
          }
        } catch (e: any) {
          this.registerError.set(e.message || 'Verification failed');
        } finally {
          this.deleteLoadingId.set(null);
        }
      }
    });
  }
}
