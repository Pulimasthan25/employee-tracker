import { Routes } from '@angular/router';

export const REPORT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./productivity/productivity').then(m => m.Productivity)
  }
];
