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
import { auth, db } from '../firebase';

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

  // Signals — Angular 21 reactive state
  readonly firebaseUser = signal<User | null>(null);
  readonly appUser = signal<AppUser | null>(null);
  readonly isLoading = signal(true);
  readonly authReady = signal(false);

  readonly isLoggedIn = computed(() => !!this.firebaseUser());
  readonly isAdmin = computed(() => this.appUser()?.role === 'admin');

  constructor() {
    onAuthStateChanged(auth, async (user) => {
      this.firebaseUser.set(user);
      if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        this.appUser.set(snap.exists() ? snap.data() as AppUser : null);
      } else {
        this.appUser.set(null);
      }
      this.isLoading.set(false);
      this.authReady.set(true);
    });
  }

  async login(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await cred.user.getIdToken(true); // force refresh to get latest claims
    this.router.navigate(['/dashboard']);
  }

  async logout() {
    await signOut(auth);
    this.router.navigate(['/auth/login']);
  }
}