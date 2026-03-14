import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

// Dev helper: call seedFakeActivities('YOUR_USER_ID') from browser console
if (typeof window !== 'undefined') {
  (window as unknown as { seedFakeActivities: (uid: string) => Promise<void> }).seedFakeActivities =
    async (uid: string) => {
      const { seedFakeActivities } = await import(
        './app/core/services/activity.service'
      );
      return seedFakeActivities(uid);
    };
}
