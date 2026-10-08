import { ApplicationConfig, isDevMode, provideZoneChangeDetection } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { provideFirebaseApp, initializeApp, getApp } from '@angular/fire/app';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideStorage, getStorage } from '@angular/fire/storage';
import { provideAuth, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence } from '@angular/fire/auth';
import { provideFunctions, getFunctions } from '@angular/fire/functions';
import {
  provideAnalytics,
  getAnalytics,
  UserTrackingService,
} from '@angular/fire/analytics';
import { providePerformance, getPerformance } from '@angular/fire/performance';
import { firebaseConfig } from '../environments/firebase-config';

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
    provideFirestore(() => getFirestore()),
    // Email/password sign-in only: no popup resolver, so Firebase's hidden auth iframe is not loaded.
    provideAuth(() => initializeAuth(getApp(), { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })),
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
