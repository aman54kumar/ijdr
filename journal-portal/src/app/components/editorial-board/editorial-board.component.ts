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
  selector: 'app-editorial-board',
  imports: [CommonModule, RouterModule, BoardMemberModalComponent],
  templateUrl: './editorial-board.component.html',
  styleUrl: './editorial-board.component.scss',
})
export class EditorialBoardComponent implements OnInit {
  boardMembers: BoardMember[] = [];
  loading = true;
  currentUser: User | null = null;

  // Bio truncation settings
  readonly bioPreviewLength = 120; // characters

  // Position order for display (removed Advisory Board Member as it's on its own page now)
  positionOrder = [
    'Patron',
    'Chief Editor',
    'Associate Editor',
    'Editorial Board Member',
  ];

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
  }

  // Scroll to top of the page
  private scrollToTop() {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'smooth',
    });
  }

  loadBoardMembers() {
    this.loading = true;
    this.firebaseService.getBoardMembers().subscribe({
      next: (members) => {
        this.boardMembers = members;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading board members:', error);
        this.loading = false;
      },
    });
  }

  getBoardMembersByPosition(position: string): BoardMember[] {
    return this.boardMembers
      .filter((member) => member.position === position && member.isActive)
      .sort((a, b) => a.order - b.order);
  }

  hasAnyMembersInPosition(position: string): boolean {
    return this.getBoardMembersByPosition(position).length > 0;
  }

  // Helper method to ensure content is treated as array for ngFor
  getContentAsArray(content: string | string[]): string[] {
    if (Array.isArray(content)) {
      return content;
    } else if (typeof content === 'string') {
      // If it's a string that contains newlines, split it
      if (content.includes('\n')) {
        return content
          .split('\n')
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      }
      // If it's a single string, return as single-item array
      return [content];
    }
    return [];
  }

  // Helper method to ensure content is treated as string for display
  getContentAsString(content: string | string[]): string {
    return Array.isArray(content) ? content.join(', ') : content || '';
  }

  // Modal functionality
  openMemberProfile(member: BoardMember): void {
    this.modalService.openModal(member);
  }

  // Bio truncation functionality
  getTruncatedBio(member: BoardMember): string {
    if (!member.bio) return '';

    const bioText = Array.isArray(member.bio)
      ? member.bio.join(' ')
      : member.bio;

    if (bioText.length <= this.bioPreviewLength) {
      return bioText;
    }

    return bioText.substring(0, this.bioPreviewLength).trim() + '...';
  }

  // Check if member has additional content beyond name and affiliation
  hasAdditionalContent(member: BoardMember): boolean {
    return !!(
      member.bio ||
      (member.dynamicSections && member.dynamicSections.length > 0) ||
      member.email ||
      member.phone
    );
  }

  // Check if current user is admin
  isAdmin(): boolean {
    return !!this.currentUser;
  }

  // Edit board member - navigate to admin panel
  editBoardMember(member: BoardMember) {
    if (this.isAdmin()) {
      // Store the member ID in session storage for the admin panel to pick up
      sessionStorage.setItem('editMemberId', member.id);
      this.router.navigate(['/admin']).then(() => {
        // Ensure admin page starts from top
        this.scrollToTop();
      });
    }
  }

  // Add new board member - navigate to admin panel
  addBoardMember() {
    if (this.isAdmin()) {
      sessionStorage.removeItem('editMemberId'); // Clear any existing edit state
      this.router.navigate(['/admin']).then(() => {
        // Ensure admin page starts from top
        this.scrollToTop();
      });
    }
  }

  // Quick toggle active status
  async toggleMemberStatus(member: BoardMember) {
    if (
      this.isAdmin() &&
      confirm(`${member.isActive ? 'Deactivate' : 'Activate'} ${member.name}?`)
    ) {
      try {
        await this.firebaseService.updateBoardMember(member.id, {
          isActive: !member.isActive,
        });
        this.loadBoardMembers(); // Refresh the list
        // Scroll to top after status change to show updated state
        setTimeout(() => this.scrollToTop(), 100);
      } catch (error) {
        console.error('Error updating member status:', error);
        alert('Error updating member status. Please try again.');
      }
    }
  }
}
