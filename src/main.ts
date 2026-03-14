import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

if (typeof window !== 'undefined') {
  (window as any).seedFakeActivities = async (uid: string) => {
    const { seedFakeActivities } = await import('./app/core/services/activity.service');
    return seedFakeActivities(uid);
  };
}
