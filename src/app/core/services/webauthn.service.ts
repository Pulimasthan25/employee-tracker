import { Injectable, signal } from '@angular/core';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase';

export interface StoredCredential {
  credentialId: string;
  deviceHint: string;
  createdAt: Date;
  userId: string;
}

@Injectable({ providedIn: 'root' })
export class WebAuthnService {
  readonly isRegistered = signal<boolean>(false);
  readonly isChecking = signal<boolean>(false);

  async checkRegistration(userId: string): Promise<void> {
    this.isChecking.set(true);
    try {
      const q = query(collection(db, `users/${userId}/webauthn_credentials`));
      const snap = await getDocs(q);
      this.isRegistered.set(!snap.empty);
    } catch (e) {
      console.error('Error checking WebAuthn registration:', e);
      this.isRegistered.set(false);
    } finally {
      this.isChecking.set(false);
    }
  }

  async getStoredCredentials(userId: string): Promise<StoredCredential[]> {
    const q = query(
      collection(db, `users/${userId}/webauthn_credentials`),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => {
      const data = doc.data();
      return {
        credentialId: data['credentialId'],
        deviceHint: data['deviceHint'],
        createdAt: data['createdAt'] instanceof Timestamp ? data['createdAt'].toDate() : new Date(data['createdAt']),
        userId: data['userId']
      };
    });
  }

  async registerPasskey(userId: string, userEmail: string): Promise<void> {
    if (!window.PublicKeyCredential) {
      throw new Error('Passkeys are not supported in this browser. Please use Chrome, Safari or Edge.');
    }

    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userIdBuffer = new TextEncoder().encode(userId);

    const options: PublicKeyCredentialCreationOptions = {
      rp: { 
        name: 'PulseTrack', 
        id: window.location.hostname 
      },
      user: {
        id: userIdBuffer,
        name: userEmail,
        displayName: 'PulseTrack Admin'
      },
      challenge,
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256
        { alg: -257, type: 'public-key' } // RS256
      ],
      authenticatorSelection: {
        userVerification: 'required',
        residentKey: 'required'
      },
      timeout: 60000,
      attestation: 'none'
    };

    const credential = await navigator.credentials.create({ publicKey: options }) as PublicKeyCredential;
    if (!credential) throw new Error('Failed to create credential');

    const credentialId = this.bufferToBase64Url(credential.rawId);

    await setDoc(doc(db, `users/${userId}/webauthn_credentials`, credentialId), {
      credentialId,
      userId,
      deviceHint: navigator.userAgent.slice(0, 80),
      createdAt: Timestamp.now()
    });

    await this.checkRegistration(userId);
  }

  async authenticate(userId: string): Promise<boolean> {
    if (!window.PublicKeyCredential) {
      throw new Error('Passkeys are not supported in this browser.');
    }

    const credentials = await this.getStoredCredentials(userId);
    if (credentials.length === 0) return false;

    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const options: PublicKeyCredentialRequestOptions = {
      challenge,
      rpId: window.location.hostname,
      userVerification: 'required',
      allowCredentials: credentials.map(cred => ({
        id: this.base64UrlToBuffer(cred.credentialId),
        type: 'public-key'
      })),
      timeout: 60000
    };

    try {
      const assertion = await navigator.credentials.get({ publicKey: options });
      return !!assertion;
    } catch (e) {
      console.error('WebAuthn authentication error:', e);
      return false;
    }
  }

  async deleteCredential(userId: string, credentialId: string): Promise<void> {
    await deleteDoc(doc(db, `users/${userId}/webauthn_credentials`, credentialId));
    await this.checkRegistration(userId);
  }

  private bufferToBase64Url(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private base64UrlToBuffer(base64url: string): ArrayBuffer {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(padLen);
    const binary = atob(padded);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return buffer;
  }
}
