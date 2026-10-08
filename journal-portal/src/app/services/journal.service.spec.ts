import { TestBed } from '@angular/core/testing';
import { FirebaseJournalService } from './firebase-journal.service';
import { FIREBASE_SDK_STUBS } from '../testing/firebase-stubs';
import { Auth } from '@angular/fire/auth';

describe('FirebaseJournalService', () => {
  let service: FirebaseJournalService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: FIREBASE_SDK_STUBS });
    service = TestBed.inject(FirebaseJournalService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('dedupes views per browser session', () => {
    sessionStorage.removeItem('ijdr_viewed_t-issue');
    expect(service.consumeJournalViewSlot('t-issue')).toBeTrue();
    expect(service.consumeJournalViewSlot('t-issue')).toBeFalse();
    service.clearJournalViewDedupe('t-issue'); // a failed write allows a retry
    expect(service.consumeJournalViewSlot('t-issue')).toBeTrue();
    sessionStorage.removeItem('ijdr_viewed_t-issue');
  });

  it('counts anonymous visitors but not signed-in editors', async () => {
    expect(await service.isCountableViewer()).toBeTrue();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ...FIREBASE_SDK_STUBS.filter((p) => (p as { provide?: unknown }).provide !== Auth),
        { provide: Auth, useValue: { currentUser: { uid: 'editor' }, authStateReady: async () => undefined } },
      ],
    });
    expect(await TestBed.inject(FirebaseJournalService).isCountableViewer()).toBeFalse();
  });
});
