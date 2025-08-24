import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { iJournal } from '../type/journals.type';

@Injectable({
  providedIn: 'root',
})
export class PdfModalService {
  private isOpenSubject = new BehaviorSubject<boolean>(false);
  private journalSubject = new BehaviorSubject<iJournal | null>(null);
  private isFullscreenSubject = new BehaviorSubject<boolean>(false);

  public isOpen$ = this.isOpenSubject.asObservable();
  public journal$ = this.journalSubject.asObservable();
  public isFullscreen$ = this.isFullscreenSubject.asObservable();

  openModal(journal: iJournal) {
    this.journalSubject.next(journal);
    this.isOpenSubject.next(true);
    // Prevent body scrolling when modal is open
    document.body.style.overflow = 'hidden';
  }

  closeModal() {
    this.isOpenSubject.next(false);
    this.journalSubject.next(null);
    this.isFullscreenSubject.next(false);
    // Restore body scrolling
    document.body.style.overflow = 'auto';
    // Exit fullscreen if active
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  }

  toggleFullscreen() {
    const isCurrentlyFullscreen = this.isFullscreenSubject.value;
    this.isFullscreenSubject.next(!isCurrentlyFullscreen);

    if (!isCurrentlyFullscreen) {
      this.enterFullscreen();
    } else {
      this.exitFullscreen();
    }
  }

  private enterFullscreen() {
    const modalElement = document.querySelector('.pdf-modal-container');
    if (modalElement && modalElement.requestFullscreen) {
      modalElement.requestFullscreen().catch((err) => {
        console.log('Error attempting to enable fullscreen:', err);
      });
    }
  }

  private exitFullscreen() {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch((err) => {
        console.log('Error attempting to exit fullscreen:', err);
      });
    }
  }
}
