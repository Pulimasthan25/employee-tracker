import { Routes } from '@angular/router';
import { Shell } from '../../shared/components/shell/shell';

export const SCREENSHOT_ROUTES: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      {
        path: '',
        loadComponent: () => import('./timeline/timeline').then((m) => m.Timeline),
      },
    ],
  },
];
