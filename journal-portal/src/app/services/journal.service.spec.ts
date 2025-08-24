import { TestBed } from '@angular/core/testing';
import { FirebaseJournalService } from './firebase-journal.service';

describe('FirebaseJournalService', () => {
  let service: FirebaseJournalService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FirebaseJournalService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
