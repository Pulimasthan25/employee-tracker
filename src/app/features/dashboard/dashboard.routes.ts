import { Routes } from '@angular/router';
import { Shell } from '../../shared/components/shell/shell';

export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      {
        path: '',
        loadComponent: () => import('./overview/overview').then((m) => m.Overview),
      },
    ],
  },
];
