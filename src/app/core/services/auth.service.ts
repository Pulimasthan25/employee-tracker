import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { inject } from '@angular/core';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, clearOfflineCache } from '../firebase';
import { FirebaseClaimsSyncService } from './firebase-claims-sync.service';
import { NgZone } from '@angular/core';

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'employee';
  teamId?: string;
  active: boolean;
  screenshotIntervalSeconds: number;
  idleThresholdSeconds?: number;
  shiftStartHour?: number;
  shiftEndHour?: number;
  createdAt: Date;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);
  private zone = inject(NgZone);
  private readonly claimsSync = inject(FirebaseClaimsSyncService);

  // Signals — Angular 21 reactive state
  readonly firebaseUser = signal<User | null>(null);
  readonly appUser = signal<AppUser | null>(null);
  readonly isLoading = signal(true);
  readonly authReady = signal(false);

  readonly isLoggedIn = computed(() => !!this.firebaseUser());
  readonly isAdmin = computed(() => this.appUser()?.role === 'admin');

  constructor() {
    onAuthStateChanged(auth, async (user) => {
      let appUser: AppUser | null = null;
      if (user) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (snap.exists()) {
            const data = snap.data() as any;
            appUser = {
              ...data,
              uid: snap.id,
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt)
            } as AppUser;
          }
        } catch (e) {
          console.error('Error fetching user profile:', e);
        }
      }

      this.zone.run(() => {
        this.firebaseUser.set(user);
        this.appUser.set(appUser);
        
        if (user) {
          // Align Auth custom claims with Firestore role (promote/demote) without manual scripts.
          void this.claimsSync.syncSelf();
        }
        
        this.isLoading.set(false);
        this.authReady.set(true);
      });
    });
  }

  async login(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await this.claimsSync.syncSelf();
    await cred.user.getIdToken(true);
    this.router.navigate(['/dashboard']);
  }

  async logout() {
    await signOut(auth);
    // Clear offline Firestore cache so sensitive data is not left on shared computers
    await clearOfflineCache();
    this.router.navigate(['/auth/login']);
  }
}