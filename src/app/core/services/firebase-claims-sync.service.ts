import { Injectable } from '@angular/core';
import { auth } from '../firebase';
import { environment } from '../../../environments/environment';

/**
 * Calls Supabase Edge Function to copy `users/{uid}.role` from Firestore into Firebase Auth custom claims.
 * Keeps ID token `role` aligned with Firestore (promote / demote) without manual scripts.
 */
@Injectable({ providedIn: 'root' })
export class FirebaseClaimsSyncService {
  private baseUrl(): string | null {
    const url = environment.supabase?.url?.trim();
    const key = environment.supabase?.anonKey?.trim();
    if (!url || !key) return null;
    return `${url.replace(/\/$/, '')}/functions/v1/sync-firebase-claims`;
  }

  /** Sync the signed-in user's claims from Firestore `users/{uid}`. Refreshes ID token on success. */
  async syncSelf(): Promise<void> {
    const endpoint = this.baseUrl();
    const user = auth.currentUser;
    if (!endpoint || !user) return;

    try {
      const token = await user.getIdToken();
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: environment.supabase!.anonKey,
          Authorization: `Bearer ${token}`,
        },
        body: '{}',
      });
      if (res.ok) {
        await user.getIdToken(true);
      }
    } catch {
      /* non-fatal */
    }
  }

  /**
   * Sync another user (e.g. right after invite). Caller must be an admin (JWT `role` claim).
   * Does not refresh the invited user's token (they are not signed in here).
   */
  async syncUser(targetUid: string): Promise<void> {
    const endpoint = this.baseUrl();
    const user = auth.currentUser;
    if (!endpoint || !user || !targetUid.trim()) return;

    try {
      const token = await user.getIdToken();
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: environment.supabase!.anonKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUid: targetUid.trim() }),
      });
    } catch {
      /* non-fatal */
    }
  }
}
