import { Component, computed, inject, ChangeDetectionStrategy, signal } from '@angular/core';
import {
  RouterOutlet,
  RouterLink,
  RouterLinkActive,
  Router,
  NavigationEnd,
} from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import { PwaInstallService } from '../../../core/services/pwa-install';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  adminOnly?: boolean;
}

const TITLE_MAP: Record<string, string> = {
  '/dashboard': 'Overview',
  '/realtime': 'Real-time Hub',
  '/screenshots': 'Screenshots',
  '/reports': 'Reports',
  '/settings': 'Configurations',
};

import { ConfirmDialog } from '../confirm-dialog/confirm-dialog';
import { routeAnimations, fadeIn } from '../../animations';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConfirmDialog],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [routeAnimations, fadeIn]
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  public readonly pwaInstall = inject(PwaInstallService);

  readonly isMenuOpen = signal(false);

  readonly navItems: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: 'grid' },
    { label: 'Live Feed', path: '/realtime', icon: 'zap', adminOnly: true },
    { label: 'Screenshots', path: '/screenshots', icon: 'camera' },
    { label: 'Reports', path: '/reports', icon: 'chart' },
    { label: 'Configurations', path: '/settings', icon: 'settings', adminOnly: true },
  ];

  constructor() {
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe(() => this.isMenuOpen.set(false));
  }

  readonly visibleNav = computed(() =>
    this.navItems.filter((item) => !item.adminOnly || this.auth.isAdmin())
  );

  readonly user = this.auth.appUser;
  readonly userEmail = computed(() => this.auth.appUser()?.email ?? '');
  readonly displayName = computed(() => this.auth.appUser()?.displayName ?? 'User');
  readonly avatarLetter = computed(() => {
    const name = this.displayName();
    return name ? name.charAt(0).toUpperCase() : '?';
  });

  readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => {
        const url = this.router.url.split('?')[0];
        const segments = url.split('/').filter(Boolean);
        const base = segments.length > 0 ? '/' + segments[0] : '';
        return TITLE_MAP[base] ?? 'Overview';
      }),
      startWith('Overview')
    ),
    { initialValue: 'Overview' }
  );

  readonly isGlobalLoading = signal(false);

  toggleMenu() {
    this.isMenuOpen.update(v => !v);
  }

  logout() {
    this.auth.logout();
  }

  refreshCurrentPage() {
    // Show a quick loading state for futuristic feel
    this.isGlobalLoading.set(true);
    setTimeout(() => {
      this.isGlobalLoading.set(false);
      // Actual refresh logic would go here, for now it just triggers 
      // whatever the component is doing if we had an event bus.
      // But just re-triggering the route can work too.
      const currentUrl = this.router.url;
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigateByUrl(currentUrl);
      });
    }, 1000);
  }

  prepareRoute(outlet: RouterOutlet) {
    return outlet && outlet.activatedRouteData && outlet.activatedRouteData['animation'];
  }
}
