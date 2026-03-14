import { Routes } from '@angular/router';

export const SCREENSHOT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./timeline/timeline').then(m => m.Timeline)
  }
];
