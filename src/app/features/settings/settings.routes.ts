import { Routes } from '@angular/router';
import { Shell } from '../../shared/components/shell/shell';

export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      {
        path: '',
        loadComponent: () => import('./settings').then((m) => m.Settings),
      },
    ],
  },
];
