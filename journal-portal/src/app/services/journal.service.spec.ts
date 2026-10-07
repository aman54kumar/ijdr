import { TestBed } from '@angular/core/testing';
import { FirebaseJournalService } from './firebase-journal.service';
import { FIREBASE_SDK_STUBS } from '../testing/firebase-stubs';

describe('FirebaseJournalService', () => {
  let service: FirebaseJournalService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: FIREBASE_SDK_STUBS });
    service = TestBed.inject(FirebaseJournalService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
