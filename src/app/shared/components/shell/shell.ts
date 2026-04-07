import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
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

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConfirmDialog],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly navItems: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: 'grid' },
    { label: 'Employees', path: '/employees', icon: 'users', adminOnly: true },
    { label: 'Screenshots', path: '/screenshots', icon: 'camera' },
    { label: 'Reports', path: '/reports', icon: 'chart' },
    { label: 'Settings', path: '/settings', icon: 'settings', adminOnly: true },
  ];

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

  logout() {
    this.auth.logout();
  }
}
