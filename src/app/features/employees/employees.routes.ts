import { Routes } from '@angular/router';

export const EMPLOYEE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./list/list').then(m => m.List)
  },
  {
    path: 'invite',
    loadComponent: () => import('./invite/invite').then(m => m.Invite)
  },
  {
    path: ':id',
    loadComponent: () => import('./detail/detail').then(m => m.Detail)
  }
];
