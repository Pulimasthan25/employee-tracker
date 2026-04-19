import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';
import { inject } from '@vercel/analytics';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

// Initialize Vercel Web Analytics
inject();

// Dev-only seed helper — never available in production builds
if (!environment.production && typeof window !== 'undefined') {
  (window as any).seedFakeActivities = async (uid: string) => {
    const { seedFakeActivities } = await import('./app/core/services/activity.service');
    return seedFakeActivities(uid);
  };
}

