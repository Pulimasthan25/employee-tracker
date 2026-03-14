import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES)
  },
  {
    path: 'dashboard',
    loadChildren: () => import('./features/dashboard/dashboard.routes').then(m => m.DASHBOARD_ROUTES),
    canActivate: [authGuard]
  },
  {
    path: 'employees',
    loadChildren: () => import('./features/employees/employees.routes').then(m => m.EMPLOYEE_ROUTES),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'screenshots',
    loadChildren: () => import('./features/screenshots/screenshots.routes').then(m => m.SCREENSHOT_ROUTES),
    canActivate: [authGuard]
  },
  {
    path: 'reports',
    loadChildren: () => import('./features/reports/reports.routes').then(m => m.REPORT_ROUTES),
    canActivate: [authGuard]
  },
  { path: '**', redirectTo: 'dashboard' }
];