import { Provider } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { Storage } from '@angular/fire/storage';
import { Auth } from '@angular/fire/auth';
import { of } from 'rxjs';
import { FirebaseJournalService } from '../services/firebase-journal.service';
import { SiteSettingsService } from '../services/site-settings.service';

/** Firebase SDK stand-ins so components can be created without a Firebase app. */
export const FIREBASE_SDK_STUBS: Provider[] = [
  { provide: Firestore, useValue: {} },
  { provide: Storage, useValue: {} },
  { provide: Auth, useValue: { onAuthStateChanged: () => () => undefined } },
];

/** Stub for components that only read journals/board members. */
export const fakeJournalService = {
  getJournals: () => of([]),
  getBoardMembers: () => of([]),
  getBoardMembersByPosition: () => of([]),
  getBoardMember: () => of(null),
};

export const FAKE_DATA_PROVIDERS: Provider[] = [
  ...FIREBASE_SDK_STUBS,
  { provide: FirebaseJournalService, useValue: fakeJournalService },
  {
    provide: SiteSettingsService,
    useValue: { getAnnouncement: () => of(undefined) },
  },
];
