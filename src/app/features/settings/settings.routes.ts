import { Routes } from '@angular/router';
import { Shell } from '../../shared/components/shell/shell';
import { SettingsLayout } from './settings-layout';

export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      {
        path: '',
        component: SettingsLayout,
        children: [
          { path: '', redirectTo: 'employees', pathMatch: 'full' },
          {
            path: 'employees',
            children: [
              {
                path: '',
                loadComponent: () => import('../employees/list/list').then((m) => m.List),
              },
              {
                path: 'invite',
                loadComponent: () => import('../employees/invite/invite').then((m) => m.Invite),
              },
              {
                path: ':id',
                loadComponent: () => import('../employees/detail/detail').then((m) => m.Detail),
              },
            ],
          },
          {
            path: 'site-rules',
            loadComponent: () => import('./site-rules').then(m => m.SiteRules),
            data: { animation: 'RulesPage' }
          },
          {
            path: 'security',
            loadComponent: () => import('./security').then(m => m.Security),
            data: { animation: 'SecurityPage' }
          },
          {
            path: 'agents',
            loadComponent: () => import('./agent-status').then(m => m.AgentStatusComponent),
            data: { animation: 'AgentsPage' }
          },
        ],
      },
    ],
  },
];
