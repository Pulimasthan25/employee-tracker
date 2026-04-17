import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { fadeIn, slideInUp } from '../../shared/animations';
import { SettingsService } from '../../core/services/settings.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-settings-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './settings-layout.html',
  styleUrl: './settings-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeIn, slideInUp]
})
export class SettingsLayout {
  private readonly router = inject(Router);
  public readonly settingsService = inject(SettingsService);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects.split('?')[0])
    ),
    { initialValue: this.router.url.split('?')[0] }
  );

  readonly showTabs = computed(() => {
    const url = this.currentUrl();
    return url === '/settings/employees' || url === '/settings/productivity';
  });

  readonly primaryAction = this.settingsService.primaryAction;

  executeAction() {
    const action = this.primaryAction();
    if (action?.callback) {
      action.callback();
    }
  }
}
