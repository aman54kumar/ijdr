import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
  ValidatorFn,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  FirebaseJournalService,
  FirebaseJournal,
} from '../../services/firebase-journal.service';
import { PdfModalService } from '../../services/pdf-modal.service';
import { AuthService } from '../../services/auth.service';
import { User } from '@angular/fire/auth';
import { AdminManagementComponent } from './admin-management/admin-management.component';
import { AdminInsightsComponent } from './admin-insights/admin-insights.component';
import { AdminMessagesComponent } from './admin-messages/admin-messages.component';
import { BoardMember, BoardMemberSection } from '../../type/journals.type';
import { ToastService } from '../../services/toast.service';
import { ConfirmModalService } from '../../services/confirm-modal.service';

/** ISSN is optional in the UI; only validate format when non-empty. */
function optionalIssnValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = control.value;
    if (raw == null || String(raw).trim() === '') return null;
    const v = String(raw).trim();
    return /^\d{4}-\d{3}[0-9XxA-Za-z]$/.test(v) ? null : { pattern: true };
  };
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    AdminManagementComponent,
    AdminInsightsComponent,
    AdminMessagesComponent,
    DragDropModule,
  ],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
})
export class AdminComponent implements OnInit {
  currentView:
    | 'journals'
    | 'create-journal'
    | 'admin-management'
    | 'board-management'
    | 'create-board-member'
    | 'insights'
    | 'messages' = 'journals';

  journals: FirebaseJournal[] = [];
  selectedJournal: FirebaseJournal | null = null;
  journalForm!: FormGroup;
  selectedPDFFile: File | null = null;
  uploading = false;
  loading = false;

  // Authentication
  currentUser: User | null = null;
  loggingOut = false;

  // Board Member Management
  boardMembers: BoardMember[] = [];
  selectedBoardMember: BoardMember | null = null;
  boardMemberForm: FormGroup;
  selectedBoardMemberImage: File | null = null;
  availablePositions = [
    'Patron',
    'Chief Editor',
    'Associate Editor',
    'Editorial Board Member',
    'Advisory Board Member',
  ];
  editingBoardMember = false;

  constructor(
    private firebaseService: FirebaseJournalService,
    private authService: AuthService,
    private router: Router,
    private fb: FormBuilder,
    private pdfModalService: PdfModalService,
    private toast: ToastService,
    private confirmModal: ConfirmModalService
  ) {
    this.journalForm = this.fb.group({
      title: ['', Validators.required],
      edition: ['', Validators.required],
      volume: [null, [Validators.required, Validators.min(1)]],
      number: [null, [Validators.required, Validators.min(1)]],
      year: ['', [Validators.required, Validators.pattern(/^\d{4}$/)]],
      description: [''],
      ssn: ['2249-104X', optionalIssnValidator()],
    });

    this.boardMemberForm = this.fb.group({
      name: ['', Validators.required],
      position: ['Editorial Board Member', Validators.required],
      affiliation: [''],
      bio: [''],
      bioContentType: ['text'],
      email: ['', Validators.email],
      phone: [''],
      order: [1, [Validators.required, Validators.min(1)]],
      isActive: [true],
      dynamicSections: this.fb.array([]),
    });
  }

  ngOnInit() {
    // Scroll to top of page when component loads
    this.scrollToTop();

    this.loadJournals();
    this.loadBoardMembers();

    // Subscribe to authentication state
    this.authService.currentUser$.subscribe((user) => {
      this.currentUser = user;
    });

    // Keep `title` in sync with Edition + Year for journal creation.
    // (The UI shows a generated title preview; this ensures the required `title`
    // control is actually populated so the form can be valid.)
    this.journalForm.get('edition')?.valueChanges.subscribe(() => {
      this.syncJournalTitle();
    });
    this.journalForm.get('year')?.valueChanges.subscribe(() => {
      this.syncJournalTitle();
    });
    this.syncJournalTitle();

    // Check if we're coming from editorial board to edit a specific member
    this.checkForDirectEdit();
  }

  // Scroll to top of the page
  private scrollToTop() {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'smooth',
    });
  }

  checkForDirectEdit() {
    const editMemberId = sessionStorage.getItem('editMemberId');
    if (editMemberId) {
      // Clear the session storage
      sessionStorage.removeItem('editMemberId');

      // Wait for board members to load, then find and edit the member
      this.firebaseService.getBoardMembers().subscribe({
        next: (members) => {
          const memberToEdit = members.find((m) => m.id === editMemberId);
          if (memberToEdit) {
            // Switch to board management view first
            this.setView('board-management');
            // Then trigger edit after a short delay to ensure view is ready
            setTimeout(() => {
              this.editBoardMember(memberToEdit);
            }, 100);
          }
        },
        error: (error) => {
          console.error('Error loading member for direct edit:', error);
        },
      });
    }
  }

  loadJournals() {
    this.loading = true;
    this.firebaseService.getJournals().subscribe({
      next: (journals) => {
        this.journals = journals;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading journals:', error);
        this.loading = false;
      },
    });
  }

  // File handling
  onPDFSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedPDFFile = input.files[0];
    }
  }

  // Generate title from edition and year
  getGeneratedTitle(): string {
    const edition = this.journalForm.get('edition')?.value;
    const year = this.journalForm.get('year')?.value;

    if (edition && year) {
      return `${edition}, ${year}`;
    } else if (edition) {
      return `${edition}`;
    } else if (year) {
      return `${year}`;
    }

    return '';
  }

  private syncJournalTitle() {
    const generatedTitle = this.getGeneratedTitle();
    this.journalForm.patchValue(
      { title: generatedTitle || '' },
      { emitEvent: false }
    );
  }

  // Journal Management
  async createJournal() {
    // Ensure `title` is populated from Edition + Year before validating/saving.
    this.syncJournalTitle();

    if (this.journalForm.valid && this.selectedPDFFile) {
      try {
        this.uploading = true;
        // Check auth state
        this.authService.currentUser$.subscribe((user) => {
          console.log('Creating journal with auth user:', user);
        });

        const journalData = this.journalForm.value;
        console.log('Journal data:', journalData);
        console.log('PDF file:', this.selectedPDFFile);

        await this.firebaseService.createJournal(
          journalData,
          this.selectedPDFFile
        );

        this.journalForm.reset();
        this.journalForm.patchValue({ ssn: '2249-104X' }); // Restore default ISSN
        this.selectedPDFFile = null;
        this.currentView = 'journals';
        this.loadJournals();
        this.toast.show('Journal created successfully!', 'success');
      } catch (error) {
        console.error('Error creating journal:', error);
        this.toast.show(
          `Error creating journal. Check the console for details.`,
          'danger'
        );
      } finally {
        this.uploading = false;
      }
    } else {
      this.journalForm.markAllAsTouched();
      if (!this.selectedPDFFile) {
        this.toast.show('Please select a PDF file.', 'warning');
      }
    }
  }

  async updateJournal() {
    if (this.selectedJournal && this.journalForm.valid) {
      try {
        this.uploading = true;
        const journalData = this.journalForm.value;

        await this.firebaseService.updateJournal(
          this.selectedJournal.id!,
          journalData,
          this.selectedPDFFile || undefined
        );

        this.selectedJournal = null;
        this.journalForm.reset();
        this.journalForm.patchValue({ ssn: '2249-104X' }); // Restore default ISSN
        this.selectedPDFFile = null;
        this.currentView = 'journals';
        this.loadJournals();
        this.toast.show('Journal updated successfully!', 'success');
      } catch (error) {
        console.error('Error updating journal:', error);
        this.toast.show('Error updating journal. Please try again.', 'danger');
      } finally {
        this.uploading = false;
      }
    }
  }

  async deleteJournal(journal: FirebaseJournal) {
    const ok = await this.confirmModal.ask(
      'Delete journal',
      `Delete "${journal.title}"? This cannot be undone.`
    );
    if (!ok) {
      return;
    }
    try {
      await this.firebaseService.deleteJournal(journal.id!);
      this.loadJournals();
      this.toast.show('Journal deleted successfully!', 'success');
    } catch (error) {
      console.error('Error deleting journal:', error);
      this.toast.show('Error deleting journal. Please try again.', 'danger');
    }
  }

  editJournal(journal: FirebaseJournal) {
    this.selectedJournal = journal;
    this.journalForm.patchValue({
      title: journal.title,
      edition: journal.edition,
      volume: journal.volume,
      number: journal.number,
      year: journal.year,
      description: journal.description || '',
      ssn: journal.ssn || '',
    });
    this.currentView = 'create-journal';
  }

  // View navigation
  setView(
    view:
      | 'journals'
      | 'create-journal'
      | 'admin-management'
      | 'board-management'
      | 'create-board-member'
      | 'insights'
      | 'messages'
  ) {
    this.currentView = view;
    this.selectedJournal = null;
    this.journalForm.reset();
    this.journalForm.patchValue({ ssn: '2249-104X' }); // Restore default ISSN
    this.selectedPDFFile = null;

    // Scroll to top when changing views
    setTimeout(() => this.scrollToTop(), 100);
  }

  // Form submission
  async saveJournal() {
    console.log('Form submission attempt:', {
      formValid: this.journalForm.valid,
      formValue: this.journalForm.value,
      formErrors: this.getFormValidationErrors(),
      selectedPDFFile: this.selectedPDFFile ? this.selectedPDFFile.name : null,
      selectedJournal: this.selectedJournal ? this.selectedJournal.id : null,
    });

    if (this.selectedJournal) {
      await this.updateJournal();
    } else {
      await this.createJournal();
    }
  }

  // Helper method for debugging form validation
  getFormValidationErrors(): any {
    const formErrors: any = {};
    Object.keys(this.journalForm.controls).forEach((key) => {
      const controlErrors = this.journalForm.get(key)?.errors;
      if (controlErrors) {
        formErrors[key] = controlErrors;
      }
    });
    return formErrors;
  }

  /** Matches the Create/Update Journal button `[disabled]` logic. */
  get isJournalSubmitDisabled(): boolean {
    return (
      this.uploading ||
      this.journalForm.invalid ||
      (!this.selectedJournal && !this.selectedPDFFile)
    );
  }

  /** Human-readable reasons the journal submit button stays disabled. */
  getJournalSubmitBlockers(): string[] {
    const out: string[] = [];
    if (this.uploading) out.push('Saving in progress—please wait.');
    if (!this.selectedJournal && !this.selectedPDFFile) {
      out.push('Choose a PDF file under “Journal PDF”.');
    }
    if (this.journalForm.invalid) {
      const c = this.journalForm.controls;
      if (c['title']?.invalid) {
        out.push(
          'Title is still empty—select an edition (and year for the full title).'
        );
      }
      if (c['edition']?.invalid) {
        out.push('Select an edition: January–June or July–December.');
      }
      if (c['volume']?.invalid) {
        out.push('Volume must be a number ≥ 1.');
      }
      if (c['number']?.invalid) {
        out.push('Issue number must be a number ≥ 1.');
      }
      if (c['year']?.invalid) {
        out.push('Year must be exactly 4 digits (e.g. 2024).');
      }
      if (c['ssn']?.invalid) {
        out.push(
          'ISSN format is invalid (use e.g. 2249-104X) or clear the field.'
        );
      }
    }
    return out;
  }

  // Authentication Methods
  async logout() {
    if (this.loggingOut) {
      return;
    }
    this.loggingOut = true;
    try {
      await this.authService.signOut();
      await this.router.navigateByUrl('/login', { replaceUrl: true });
    } catch (error) {
      console.error('Logout error:', error);
      this.toast.show('Could not sign out. Please try again.', 'danger');
    } finally {
      this.loggingOut = false;
    }
  }

  getUserDisplayName(): string {
    return (
      this.currentUser?.displayName || this.currentUser?.email || 'Admin User'
    );
  }

  // Helper methods
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  openPDFInNewTab(journal: FirebaseJournal) {
    if (journal.id) {
      // Convert FirebaseJournal to iJournal format for the modal
      const modalJournal = {
        id: journal.id,
        title: journal.title,
        edition: journal.edition,
        volume: journal.volume,
        number: journal.number,
        year: journal.year,
        description: journal.description,
        ssn: journal.ssn,
        pdfUrl: journal.pdfUrl,
        pdfFileName: journal.pdfFileName,
        fileSize: journal.fileSize,
        createdAt: journal.createdAt,
        updatedAt: journal.updatedAt,
      };
      this.pdfModalService.openModal(modalJournal);
    } else {
      this.toast.show('Journal not available.', 'warning');
    }
  }

  // ==================== BOARD MEMBER MANAGEMENT ====================

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
        this.toast.show('Error loading board members. Please try again.', 'danger');
      },
    });
  }

  async createBoardMember() {
    if (this.boardMemberForm.valid) {
      try {
        this.uploading = true;
        const formValue = this.boardMemberForm.value;

        // Process dynamic sections
        const processedDynamicSections =
          formValue.dynamicSections?.map((section: any) => ({
            id: section.id,
            heading: section.heading || '',
            contentType: section.contentType || 'text',
            content:
              section.contentType === 'list'
                ? section.content
                    .split('\n')
                    .map((item: string) => item.trim())
                    .filter((item: string) => item.length > 0)
                : section.content || '',
            order: section.order || 1,
          })) || [];

        const memberData = {
          name: formValue.name || '',
          position: formValue.position || 'Editorial Board Member',
          affiliation: formValue.affiliation || '', // Explicitly set empty string
          bio:
            formValue.bioContentType === 'list'
              ? formValue.bio
                ? formValue.bio
                    .split('\n')
                    .map((item: string) => item.trim())
                    .filter((item: string) => item.length > 0)
                : []
              : formValue.bio || '', // Explicitly set empty string
          bioContentType: formValue.bioContentType || 'text',
          email: formValue.email || '', // Explicitly set empty string
          phone: formValue.phone || '', // Explicitly set empty string
          order: await this.firebaseService.getNextOrderForPosition(
            formValue.position
          ),
          isActive:
            formValue.isActive !== undefined ? formValue.isActive : true,
          dynamicSections: processedDynamicSections,
        };

        await this.firebaseService.createBoardMember(
          memberData,
          this.selectedBoardMemberImage || undefined
        );

        this.resetBoardMemberForm();
        this.loadBoardMembers();
        this.setView('board-management');
        this.toast.show('Board member created successfully!', 'success');
      } catch (error) {
        console.error('Error creating board member:', error);
        this.toast.show('Error creating board member. Please try again.', 'danger');
      } finally {
        this.uploading = false;
      }
    } else {
      this.toast.show('Please fill in all required fields correctly.', 'warning');
    }
  }

  async updateBoardMember() {
    if (this.boardMemberForm.valid && this.selectedBoardMember) {
      try {
        this.uploading = true;
        const formValue = this.boardMemberForm.value;

        // Process dynamic sections
        const processedDynamicSections =
          formValue.dynamicSections?.map((section: any) => ({
            id: section.id,
            heading: section.heading || '',
            contentType: section.contentType || 'text',
            content:
              section.contentType === 'list'
                ? section.content
                    .split('\n')
                    .map((item: string) => item.trim())
                    .filter((item: string) => item.length > 0)
                : section.content || '',
            order: section.order || 1,
          })) || [];

        const memberData = {
          name: formValue.name || '',
          position: formValue.position || 'Editorial Board Member',
          affiliation: formValue.affiliation || '', // Explicitly set empty string
          bio:
            formValue.bioContentType === 'list'
              ? formValue.bio
                ? formValue.bio
                    .split('\n')
                    .map((item: string) => item.trim())
                    .filter((item: string) => item.length > 0)
                : []
              : formValue.bio || '', // Explicitly set empty string
          bioContentType: formValue.bioContentType || 'text',
          email: formValue.email || '', // Explicitly set empty string
          phone: formValue.phone || '', // Explicitly set empty string
          order: formValue.order || 1,
          isActive:
            formValue.isActive !== undefined ? formValue.isActive : true,
          dynamicSections: processedDynamicSections,
        };

        await this.firebaseService.updateBoardMember(
          this.selectedBoardMember.id,
          memberData,
          this.selectedBoardMemberImage || undefined
        );

        this.resetBoardMemberForm();
        this.loadBoardMembers();
        this.setView('board-management');
        this.toast.show('Board member updated successfully!', 'success');
      } catch (error) {
        console.error('Error updating board member:', error);
        this.toast.show('Error updating board member. Please try again.', 'danger');
      } finally {
        this.uploading = false;
      }
    }
  }

  async deleteBoardMember(member: BoardMember) {
    const ok = await this.confirmModal.ask(
      'Deactivate member',
      `Deactivate ${member.name}? They will be hidden from the public board.`
    );
    if (!ok) {
      return;
    }
    try {
      await this.firebaseService.deleteBoardMember(member.id);
      this.loadBoardMembers();
      this.toast.show('Board member deactivated successfully!', 'success');
    } catch (error) {
      console.error('Error deleting board member:', error);
      this.toast.show('Error deactivating board member. Please try again.', 'danger');
    }
  }

  editBoardMember(member: BoardMember) {
    this.selectedBoardMember = member;
    this.editingBoardMember = true;

    // First reset the form to clear all previous data
    this.resetBoardMemberForm();

    // Then set the new values (this ensures all fields are properly cleared)
    this.boardMemberForm.patchValue({
      name: member.name || '',
      position: member.position || 'Editorial Board Member',
      affiliation: member.affiliation || '',
      bio: Array.isArray(member.bio) ? member.bio.join('\n') : member.bio || '',
      bioContentType: member.bioContentType || 'text',
      email: member.email || '',
      phone: member.phone || '',
      order: member.order || 1,
      isActive: member.isActive !== undefined ? member.isActive : true,
    });

    // Set dynamic sections (handle undefined/null case)
    const sections = member.dynamicSections || [];
    this.setDynamicSections(sections);

    // Reset the editing flag since resetBoardMemberForm() sets it to false
    this.editingBoardMember = true;
    this.selectedBoardMember = member;

    this.setView('create-board-member');

    // Scroll to top of the form
    setTimeout(() => {
      const formElement = document.querySelector('.create-board-member-form');
      if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }

  onBoardMemberImageSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (
      file &&
      (file.type === 'image/jpeg' ||
        file.type === 'image/png' ||
        file.type === 'image/webp')
    ) {
      this.selectedBoardMemberImage = file;
    } else if (file) {
      this.toast.show('Please select a valid image file (JPEG, PNG, or WebP).', 'warning');
      input.value = '';
    }
  }

  resetBoardMemberForm() {
    this.boardMemberForm.reset({
      name: '',
      position: 'Editorial Board Member',
      affiliation: '',
      bio: '',
      bioContentType: 'text',
      email: '',
      phone: '',
      order: 1,
      isActive: true,
    });
    this.selectedBoardMember = null;
    this.selectedBoardMemberImage = null;
    this.editingBoardMember = false;
    this.clearDynamicSections();
  }

  // Dynamic Sections Management
  get dynamicSectionsArray() {
    return this.boardMemberForm.get('dynamicSections') as FormArray;
  }

  addDynamicSection() {
    const sectionGroup = this.fb.group({
      id: [this.generateSectionId()],
      heading: ['', Validators.required],
      contentType: ['text', Validators.required],
      content: ['', Validators.required],
      order: [this.dynamicSectionsArray.length + 1],
    });
    this.dynamicSectionsArray.push(sectionGroup);
  }

  removeDynamicSection(index: number) {
    this.dynamicSectionsArray.removeAt(index);
  }

  setDynamicSections(sections: BoardMemberSection[]) {
    this.clearDynamicSections();
    if (sections && Array.isArray(sections)) {
      sections.forEach((section) => {
        const sectionGroup = this.fb.group({
          id: [section.id],
          heading: [section.heading, Validators.required],
          contentType: [section.contentType, Validators.required],
          content: [
            Array.isArray(section.content)
              ? section.content.join('\n')
              : section.content,
            Validators.required,
          ],
          order: [section.order],
        });
        this.dynamicSectionsArray.push(sectionGroup);
      });
    }
  }

  clearDynamicSections() {
    while (this.dynamicSectionsArray.length > 0) {
      this.dynamicSectionsArray.removeAt(0);
    }
  }

  private generateSectionId(): string {
    return (
      'section_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    );
  }

  // Content type change handler
  onContentTypeChange(index: number, contentType: string) {
    const sectionGroup = this.dynamicSectionsArray.at(index);
    const currentContent = sectionGroup.get('content')?.value || '';

    if (contentType === 'list' && typeof currentContent === 'string') {
      // Convert string to array format
      sectionGroup.patchValue({
        content: currentContent
          .split('\n')
          .filter((line) => line.trim() !== ''),
      });
    } else if (contentType === 'text' && Array.isArray(currentContent)) {
      // Convert array to string format
      sectionGroup.patchValue({
        content: currentContent.join('\n'),
      });
    }
  }

  getBoardMembersByPosition(position: string): BoardMember[] {
    return this.boardMembers.filter((member) => member.position === position);
  }

  // ==================== DRAG & DROP FUNCTIONALITY ====================

  async onBoardMemberDrop(event: CdkDragDrop<BoardMember[]>, position: string) {
    const membersInPosition = this.getBoardMembersByPosition(position);

    if (event.previousIndex !== event.currentIndex) {
      // Create a copy of the array to manipulate
      const reorderedMembers = [...membersInPosition];
      moveItemInArray(
        reorderedMembers,
        event.previousIndex,
        event.currentIndex
      );

      try {
        // Update order values for all members in this position
        const updatePromises = reorderedMembers.map((member, index) => {
          const newOrder = index + 1;
          return this.firebaseService.updateBoardMember(member.id, {
            order: newOrder,
          });
        });

        await Promise.all(updatePromises);

        // Reload board members to reflect changes
        this.loadBoardMembers();

        console.log(`Reordered ${position} members successfully`);
      } catch (error) {
        console.error('Error reordering board members:', error);
        this.toast.show('Error updating order. Please try again.', 'danger');
      }
    }
  }

  // Get members sorted by current order for drag-drop display
  getBoardMembersByPositionSorted(position: string): BoardMember[] {
    return this.getBoardMembersByPosition(position).sort(
      (a, b) => a.order - b.order
    );
  }

  // TrackBy function for better performance during drag operations
  trackByMemberId(index: number, member: BoardMember): string {
    return member.id;
  }

  // Helper method to ensure content is treated as array for ngFor
  getContentAsArray(content: string | string[]): string[] {
    return Array.isArray(content) ? content : [content];
  }

  // Helper method to ensure content is treated as string for display
  getContentAsString(content: string | string[]): string {
    return Array.isArray(content) ? content.join(', ') : content;
  }

  // Handle bio content type changes
  onBioContentTypeChange(newContentType: string) {
    const bioControl = this.boardMemberForm.get('bio');
    const currentContent = bioControl?.value || '';

    if (newContentType === 'list' && typeof currentContent === 'string') {
      // Converting from text to list - keep content as-is for editing
      bioControl?.setValue(currentContent);
    } else if (
      newContentType === 'text' &&
      typeof currentContent === 'string'
    ) {
      // Converting from list to text - join with spaces
      const lines = currentContent
        .split('\n')
        .filter((line: string) => line.trim());
      bioControl?.setValue(lines.join(' '));
    }
  }
}
