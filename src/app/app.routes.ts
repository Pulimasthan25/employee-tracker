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
    canActivate: [authGuard],
    data: { animation: 'DashboardPage' }
  },
  {
    path: 'screenshots',
    loadChildren: () => import('./features/screenshots/screenshots.routes').then(m => m.SCREENSHOT_ROUTES),
    canActivate: [authGuard],
    data: { animation: 'ScreenshotsPage' }
  },
  {
    path: 'reports',
    loadChildren: () => import('./features/reports/reports.routes').then(m => m.REPORT_ROUTES),
    canActivate: [authGuard],
    data: { animation: 'ReportsPage' }
  },
  {
    path: 'realtime',
    loadChildren: () => import('./features/realtime/realtime.routes').then(m => m.REALTIME_ROUTES),
    canActivate: [authGuard, adminGuard],
    data: { animation: 'RealtimePage' }
  },
  {
    path: 'settings',
    loadChildren: () => import('./features/settings/settings.routes').then(m => m.SETTINGS_ROUTES),
    canActivate: [authGuard, adminGuard],
    data: { animation: 'SettingsPage' }
  },
  { path: '**', redirectTo: 'dashboard' }
];