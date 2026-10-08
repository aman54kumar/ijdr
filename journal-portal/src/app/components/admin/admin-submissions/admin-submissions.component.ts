import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth } from '@angular/fire/auth';
import { Subscription } from 'rxjs';
import { SubmissionService } from '../../../services/submission.service';
import { ToastService } from '../../../services/toast.service';
import { SUBMISSION_STATUS_LABELS, Submission, SubmissionStatus } from '../../../type/journals.type';

@Component({
  selector: 'app-admin-submissions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-submissions.component.html',
})
export class AdminSubmissionsComponent implements OnInit, OnDestroy {
  private service = inject(SubmissionService);
  private toast = inject(ToastService);
  private auth = inject(Auth);
  private sub?: Subscription;

  all: Submission[] = [];
  loading = true;
  failed = false;
  filter: SubmissionStatus | 'all' = 'all';
  q = '';
  openId: string | null = null;
  noteDraft = '';
  busy = false;

  readonly statuses = Object.entries(SUBMISSION_STATUS_LABELS) as [SubmissionStatus, string][];
  readonly labels = SUBMISSION_STATUS_LABELS;

  ngOnInit() {
    this.sub = this.service.list().subscribe({
      next: (l) => {
        this.all = l;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.failed = true;
      },
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  get shown(): Submission[] {
    const q = this.q.trim().toLowerCase();
    return this.all.filter(
      (s) =>
        (this.filter === 'all' || s.status === this.filter) &&
        (!q || `${s.title} ${s.name} ${s.email} ${s.affiliation} ${s.keywords.join(' ')}`.toLowerCase().includes(q))
    );
  }

  count(status: SubmissionStatus): number {
    return this.all.filter((s) => s.status === status).length;
  }

  get actor(): string {
    return this.auth.currentUser?.email ?? 'admin';
  }

  toggle(s: Submission) {
    this.openId = this.openId === s.id ? null : s.id;
    this.noteDraft = '';
  }

  async setStatus(s: Submission, status: SubmissionStatus) {
    if (status === s.status) return;
    this.busy = true;
    try {
      await this.service.setStatus(s, status, this.actor);
      this.toast.show(`Marked ${this.labels[status].toLowerCase()}.`, 'success');
    } catch {
      this.toast.show('Could not change the status.', 'danger');
    } finally {
      this.busy = false;
    }
  }

  async addNote(s: Submission) {
    const text = this.noteDraft.trim();
    if (!text) return;
    try {
      await this.service.addNote(s, text, this.actor);
      this.noteDraft = '';
    } catch {
      this.toast.show('Could not save the note.', 'danger');
    }
  }

  async download(f: Submission['files'][number]) {
    try {
      await this.service.download(f);
    } catch {
      this.toast.show('Could not download the file.', 'danger');
    }
  }

  size(bytes: number): string {
    return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
}
