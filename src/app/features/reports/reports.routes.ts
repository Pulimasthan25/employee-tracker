import { Routes } from '@angular/router';
import { Shell } from '../../shared/components/shell/shell';

export const REPORT_ROUTES: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      {
        path: '',
        loadComponent: () => import('./reports-layout/reports-layout').then(m => m.ReportsLayout),
        children: [
          { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
          { path: 'dashboard', loadComponent: () => import('./dashboard/dashboard').then(m => m.ReportsDashboard) },
          { path: 'productivity', loadComponent: () => import('./productivity/productivity').then(m => m.Productivity) },
          { path: 'timeline', redirectTo: 'dashboard', pathMatch: 'full' },
          { path: 'urls', loadComponent: () => import('./url-usage/url-usage').then(m => m.UrlUsage) },
          {
            path: 'attendance',
            loadComponent: () =>
              import('./attendance/attendance').then(m => m.Attendance)
          },
        ]
      }
    ]
  }
];
