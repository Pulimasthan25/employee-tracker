import { Routes } from '@angular/router';
import { Shell } from '../../shared/components/shell/shell';

export const EMPLOYEE_ROUTES: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      {
        path: '',
        loadComponent: () => import('./list/list').then((m) => m.List),
      },
      {
        path: 'invite',
        loadComponent: () => import('./invite/invite').then((m) => m.Invite),
      },
      {
        path: ':id',
        loadComponent: () => import('./detail/detail').then((m) => m.Detail),
      },
    ],
  },
];
