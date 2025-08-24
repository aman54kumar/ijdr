import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { BoardMemberModalService } from '../../services/board-member-modal.service';
import { AuthService } from '../../services/auth.service';
import { BoardMember } from '../../type/journals.type';
import { Router } from '@angular/router';

@Component({
  selector: 'app-board-member-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './board-member-modal.component.html',
  styleUrls: ['./board-member-modal.component.scss'],
})
export class BoardMemberModalComponent implements OnInit, OnDestroy {
  isModalOpen = false;
  selectedMember: BoardMember | null = null;
  currentUser: any = null;

  private subscriptions: Subscription[] = [];

  constructor(
    private modalService: BoardMemberModalService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Subscribe to modal state
    this.subscriptions.push(
      this.modalService.isModalOpen$.subscribe((isOpen) => {
        this.isModalOpen = isOpen;
      })
    );

    // Subscribe to selected member
    this.subscriptions.push(
      this.modalService.selectedMember$.subscribe((member) => {
        this.selectedMember = member;
      })
    );

    // Subscribe to current user for admin controls
    this.subscriptions.push(
      this.authService.currentUser$.subscribe((user) => {
        this.currentUser = user;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  closeModal(): void {
    this.modalService.closeModal();
  }

  // Handle backdrop click
  onBackdropClick(event: Event): void {
    if (event.target === event.currentTarget) {
      this.closeModal();
    }
  }

  // Handle ESC key
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeModal();
    }
  }

  // Helper methods
  getContentAsArray(content: string | string[]): string[] {
    if (Array.isArray(content)) {
      return content;
    }
    return content
      ? content
          .split('\n')
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [];
  }

  getContentAsString(content: string | string[]): string {
    return Array.isArray(content) ? content.join(', ') : content || '';
  }

  isAdmin(): boolean {
    return !!this.currentUser;
  }

  editBoardMember(): void {
    if (this.selectedMember) {
      // Store member ID for editing
      sessionStorage.setItem('editMemberId', this.selectedMember.id);
      this.closeModal();
      this.router.navigate(['/admin']);
    }
  }
}
