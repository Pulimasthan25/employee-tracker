import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take, from, switchMap } from 'rxjs';
import { AuthService } from '../core/services/auth.service';
import { auth } from '../core/firebase';

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for Firebase auth to resolve (fixes race condition on hard refresh),
  // then verify the 'role' custom claim from the ID token — not the Firestore
  // field — so a user cannot self-promote by editing their own document.
  return toObservable(authService.authReady).pipe(
    filter((ready) => ready),
    take(1),
    switchMap(() =>
      from(auth.currentUser?.getIdTokenResult() ?? Promise.resolve(null))
    ),
    map((tokenResult) => {
      if (tokenResult?.claims?.['role'] === 'admin') return true;
      return router.createUrlTree(['/dashboard']);
    })
  );
};