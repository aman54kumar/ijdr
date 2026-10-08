import { ApplicationConfig, isDevMode, provideZoneChangeDetection } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideStorage, getStorage } from '@angular/fire/storage';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFunctions, getFunctions } from '@angular/fire/functions';
import {
  provideAnalytics,
  getAnalytics,
  UserTrackingService,
} from '@angular/fire/analytics';
import { providePerformance, getPerformance } from '@angular/fire/performance';
import { provideAppCheck, initializeAppCheck, ReCaptchaV3Provider } from '@angular/fire/app-check';
import { environment } from '../environments/environment';
import { firebaseConfig } from '../environments/firebase-config';

/** App Check proves requests come from this site; the public AI callables reject calls without it. */
const appCheckProviders = environment.recaptchaSiteKey
  ? [
      provideAppCheck(() => {
        if (!environment.production) {
          // Prints a debug token in the console; register it under Firebase Console -> App Check -> Apps -> Manage debug tokens.
          (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
        }
        return initializeAppCheck(undefined, {
          provider: new ReCaptchaV3Provider(environment.recaptchaSiteKey),
          isTokenAutoRefreshEnabled: true,
        });
      }),
    ]
  : [];

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'top',
        anchorScrolling: 'enabled',
      })
    ),
    provideHttpClient(),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    ...appCheckProviders,
    provideFirestore(() => getFirestore()),
    provideAuth(() => getAuth()),
    provideStorage(() => getStorage()),
    provideFunctions(() => getFunctions()),
    provideAnalytics(() => getAnalytics()),
    providePerformance(() => getPerformance()),
    UserTrackingService,
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
