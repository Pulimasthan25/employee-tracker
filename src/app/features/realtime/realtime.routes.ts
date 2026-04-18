import { Routes } from '@angular/router';
import { Shell } from '../../shared/components/shell/shell';
import { RealtimeComponent } from './realtime';

export const REALTIME_ROUTES: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      {
        path: '',
        component: RealtimeComponent
      }
    ]
  }
];
