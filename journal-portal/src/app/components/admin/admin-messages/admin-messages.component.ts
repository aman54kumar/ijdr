import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ContactService, ContactSubmission, contactStatus } from '../../../services/contact.service';
import { AiService, aiErrorMessage } from '../../../services/ai.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-admin-messages',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-messages.component.html',
  styleUrl: './admin-messages.component.scss',
})
export class AdminMessagesComponent implements OnInit, OnDestroy {
  private contactService = inject(ContactService);
  private ai = inject(AiService);
  private toast = inject(ToastService);
  private subs = new Subscription();

  messages: ContactSubmission[] = [];
  loading = true;
  filter: 'all' | 'new' | 'handled' = 'new';
  q = '';
  triageOn = false;
  triaging = new Set<string>();
  readonly status = contactStatus;

  ngOnInit() {
    this.subs.add(
      this.contactService.getSubmissions().subscribe({
        next: (list) => {
          this.messages = list;
          this.loading = false;
        },
        error: () => (this.loading = false),
      })
    );
    this.subs.add(this.ai.settings$().subscribe((s) => (this.triageOn = s.contactTriage)));
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  get shown(): ContactSubmission[] {
    const q = this.q.trim().toLowerCase();
    return this.messages.filter(
      (m) =>
        (this.filter === 'all' || contactStatus(m) === this.filter) &&
        (!q || `${m.name} ${m.email} ${m.message}`.toLowerCase().includes(q))
    );
  }

  count(s: 'new' | 'handled'): number {
    return this.messages.filter((m) => contactStatus(m) === s).length;
  }

  async toggleHandled(m: ContactSubmission) {
    try {
      await this.contactService.setStatus(m.id, contactStatus(m) === 'handled' ? 'new' : 'handled');
    } catch {
      this.toast.show('Could not update the message.', 'danger');
    }
  }

  async triage(m: ContactSubmission) {
    this.triaging.add(m.id);
    try {
      await this.ai.triageContact(m.id);
    } catch (e) {
      this.toast.show(aiErrorMessage(e), 'danger');
    } finally {
      this.triaging.delete(m.id);
    }
  }

  async copyDraft(m: ContactSubmission) {
    try {
      await navigator.clipboard.writeText(m.triage?.replyDraft ?? '');
      this.toast.show('Reply draft copied. Edit it before sending.', 'success');
    } catch {
      this.toast.show('Could not copy the draft.', 'warning');
    }
  }
}
