import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { RouterOutlet, Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { ToastComponent } from './shared/components/toast/toast.component';
import { PwaUpdateService } from './core/services/pwa-update';
import { AuthService } from './core/services/auth.service';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent],
  template: `
    @if (!authService.authReady() || isInitialLoading()) {
      <div class="initial-loader">
        <div class="dot"></div>
      </div>
    }

    <div [style.display]="authService.authReady() && !isInitialLoading() ? 'block' : 'none'">
      <router-outlet />
    </div>

    <app-toast />
  `,
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private pwaUpdate = inject(PwaUpdateService);
  private router = inject(Router);
  protected authService = inject(AuthService);
  protected isInitialLoading = signal(true);

  constructor() {
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError)
    ).subscribe(() => {
      this.isInitialLoading.set(false);
    });
  }
}
