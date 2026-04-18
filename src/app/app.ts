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
        <div class="il-hud">
          <span class="il-corner il-corner--br"></span>
          <span class="il-corner il-corner--bl"></span>

          <div class="il-logo-wrap">
            <svg class="il-logo-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path class="il-bolt-fill" d="M13 2L4.5 13.5H11L9.5 22L19.5 10H13L13 2Z"/>
              <path class="il-bolt"      d="M13 2L4.5 13.5H11L9.5 22L19.5 10H13L13 2Z"/>
            </svg>
          </div>

          <div class="il-name">PULSE</div>

          <div class="il-wave">
            <div class="il-bar"></div>
            <div class="il-bar"></div>
            <div class="il-bar"></div>
            <div class="il-bar"></div>
            <div class="il-bar"></div>
            <div class="il-bar"></div>
            <div class="il-bar"></div>
            <div class="il-bar"></div>
            <div class="il-bar"></div>
            <div class="il-bar"></div>
          </div>

          <div class="il-status">Authenticated&nbsp;&nbsp;•&nbsp;&nbsp;Loading</div>
        </div>

        <div class="il-sweep"></div>
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
