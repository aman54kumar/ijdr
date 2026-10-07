import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FAKE_DATA_PROVIDERS } from '../../testing/firebase-stubs';

import { AdvisoryBoardComponent } from './advisory-board.component';

describe('AdvisoryBoardComponent', () => {
  let component: AdvisoryBoardComponent;
  let fixture: ComponentFixture<AdvisoryBoardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdvisoryBoardComponent],
      providers: [provideRouter([]), ...FAKE_DATA_PROVIDERS],
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdvisoryBoardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
