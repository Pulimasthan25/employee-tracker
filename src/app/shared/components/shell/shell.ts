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
  '/employees': 'Employees',
  '/screenshots': 'Screenshots',
  '/reports': 'Reports',
};

import { ConfirmDialog } from '../confirm-dialog/confirm-dialog';
import { routeAnimations } from '../../animations';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConfirmDialog],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [routeAnimations]
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  public readonly pwaInstall = inject(PwaInstallService);

  readonly isMenuOpen = signal(false);

  readonly navItems: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: 'grid' },
    { label: 'Employees', path: '/employees', icon: 'users', adminOnly: true },
    { label: 'Screenshots', path: '/screenshots', icon: 'camera' },
    { label: 'Reports', path: '/reports', icon: 'chart' },
    { label: 'Settings', path: '/settings', icon: 'settings', adminOnly: true },
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

  toggleMenu() {
    this.isMenuOpen.update(v => !v);
  }

  logout() {
    this.auth.logout();
  }

  prepareRoute(outlet: RouterOutlet) {
    return outlet && outlet.activatedRouteData && outlet.activatedRouteData['animation'];
  }
}
