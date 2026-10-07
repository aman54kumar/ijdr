import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FAKE_DATA_PROVIDERS } from '../../testing/firebase-stubs';

import { JournalsComponent } from './journals.component';

describe('JournalsComponent', () => {
  let component: JournalsComponent;
  let fixture: ComponentFixture<JournalsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JournalsComponent],
      providers: [provideRouter([]), ...FAKE_DATA_PROVIDERS],
    })
    .compileComponents();

    fixture = TestBed.createComponent(JournalsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
