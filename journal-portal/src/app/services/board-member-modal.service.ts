import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { BoardMember } from '../type/journals.type';

@Injectable({
  providedIn: 'root',
})
export class BoardMemberModalService {
  private isModalOpenSubject = new BehaviorSubject<boolean>(false);
  private selectedMemberSubject = new BehaviorSubject<BoardMember | null>(null);

  public isModalOpen$ = this.isModalOpenSubject.asObservable();
  public selectedMember$ = this.selectedMemberSubject.asObservable();

  openModal(member: BoardMember): void {
    this.selectedMemberSubject.next(member);
    this.isModalOpenSubject.next(true);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
  }

  closeModal(): void {
    this.isModalOpenSubject.next(false);
    this.selectedMemberSubject.next(null);
    // Restore body scroll
    document.body.style.overflow = '';
  }

  constructor() {}
}
