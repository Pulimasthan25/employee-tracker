import { Routes } from '@angular/router';
import { Shell } from '../../shared/components/shell/shell';

export const REPORT_ROUTES: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./productivity/productivity').then((m) => m.Productivity),
      },
    ],
  },
];
