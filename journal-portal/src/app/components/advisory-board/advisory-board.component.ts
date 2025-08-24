import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FirebaseJournalService } from '../../services/firebase-journal.service';
import { AuthService } from '../../services/auth.service';
import { BoardMemberModalService } from '../../services/board-member-modal.service';
import { BoardMemberModalComponent } from '../board-member-modal/board-member-modal.component';
import { BoardMember } from '../../type/journals.type';
import { User } from '@angular/fire/auth';

@Component({
  selector: 'app-advisory-board',
  imports: [CommonModule, RouterModule, BoardMemberModalComponent],
  templateUrl: './advisory-board.component.html',
  styleUrl: './advisory-board.component.scss',
})
export class AdvisoryBoardComponent implements OnInit {
  boardMembers: BoardMember[] = [];
  advisoryMembers: BoardMember[] = [];
  loading = true;
  currentUser: User | null = null;

  // Bio truncation settings
  readonly bioPreviewLength = 120; // characters

  constructor(
    private firebaseService: FirebaseJournalService,
    private authService: AuthService,
    private router: Router,
    private modalService: BoardMemberModalService
  ) {}

  ngOnInit() {
    // Scroll to top of page when component loads
    this.scrollToTop();

    this.loadBoardMembers();

    // Subscribe to authentication state
    this.authService.currentUser$.subscribe((user) => {
      this.currentUser = user;
    });

    // Handle editMemberId from session storage (for direct editing from other pages)
    const editMemberId = sessionStorage.getItem('editMemberId');
    if (editMemberId) {
      sessionStorage.removeItem('editMemberId');
      setTimeout(() => {
        const member = this.boardMembers.find((m) => m.id === editMemberId);
        if (member && member.position === 'Advisory Board Member') {
          this.editBoardMember(member);
        }
      }, 1000);
    }
  }

  private scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  loadBoardMembers() {
    this.loading = true;
    this.firebaseService.getBoardMembers().subscribe({
      next: (members) => {
        this.boardMembers = members.filter(
          (member) => member.isActive !== false
        );
        // Filter only Advisory Board Members
        this.advisoryMembers = this.boardMembers.filter(
          (member) => member.position === 'Advisory Board Member'
        );
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading board members:', error);
        this.loading = false;
      },
    });
  }

  getBoardMembersByPosition(position: string): BoardMember[] {
    return this.boardMembers.filter((member) => member.position === position);
  }

  hasAnyMembersInPosition(position: string): boolean {
    return this.getBoardMembersByPosition(position).length > 0;
  }

  isAdmin(): boolean {
    return !!this.currentUser;
  }

  getTruncatedBio(member: BoardMember): string {
    if (!member.bio) return '';

    let bioText = '';
    if (member.bioContentType === 'text' || typeof member.bio === 'string') {
      bioText = typeof member.bio === 'string' ? member.bio : '';
    } else if (member.bioContentType === 'list' && Array.isArray(member.bio)) {
      bioText = member.bio.join(', ');
    }

    return bioText.length > this.bioPreviewLength
      ? bioText.substring(0, this.bioPreviewLength) + '...'
      : bioText;
  }

  hasAdditionalContent(member: BoardMember): boolean {
    return !!(
      (member.bio && member.bio.length > this.bioPreviewLength) ||
      (member.dynamicSections && member.dynamicSections.length > 0)
    );
  }

  openMemberProfile(member: BoardMember) {
    this.modalService.openModal(member);
  }

  addBoardMember() {
    // Navigate to admin panel for adding new Advisory Board Member
    if (this.isAdmin()) {
      sessionStorage.removeItem('editMemberId'); // Clear any existing edit state
      this.router.navigate(['/admin']).then(() => {
        // Ensure admin page starts from top
        this.scrollToTop();
      });
    }
  }

  editBoardMember(member: BoardMember) {
    this.modalService.openModal(member);
  }

  async toggleMemberStatus(member: BoardMember) {
    if (!member.id) return;

    const newStatus = !member.isActive;
    const action = newStatus ? 'activate' : 'deactivate';

    if (confirm(`Are you sure you want to ${action} ${member.name}?`)) {
      try {
        await this.firebaseService.updateBoardMember(member.id, {
          isActive: newStatus,
        });

        // Reload the board members
        this.loadBoardMembers();

        alert(`${member.name} has been ${action}d successfully.`);
      } catch (error) {
        console.error(`Error ${action}ing member:`, error);
        alert(`Error ${action}ing member. Please try again.`);
      }
    }
  }
}
