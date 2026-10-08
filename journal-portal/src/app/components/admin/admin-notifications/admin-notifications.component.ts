import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, getDoc, setDoc, Timestamp } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { ToastService } from '../../../services/toast.service';

export const MAX_RECIPIENTS = 5;
const EMAIL_RE = /^[^@\s,;<>"]{1,64}@[^@\s,;<>"]+\.[^@\s,;<>"]{2,}$/;

/** Split on commas, semicolons and whitespace; split valid addresses from the rest. */
export function parseRecipients(raw: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const e = part.trim().toLowerCase();
    if (!e) continue;
    if (EMAIL_RE.test(e) && e.length <= 254) {
      if (!valid.includes(e)) valid.push(e);
    } else if (!invalid.includes(part.trim())) {
      invalid.push(part.trim());
    }
  }
  return { valid, invalid };
}

@Component({
  selector: 'app-admin-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-notifications.component.html',
})
export class AdminNotificationsComponent implements OnInit {
  private firestore = inject(Firestore);
  private functions = inject(Functions);
  private toast = inject(ToastService);

  loading = true;
  saving = false;
  testing = false;
  /** True until an admin saves: the deployment's default recipient is in use. */
  usingDefault = true;
  text = '';
  onSubmission = true;
  onContact = true;
  readonly max = MAX_RECIPIENTS;

  async ngOnInit() {
    try {
      const d = (await getDoc(doc(this.firestore, 'adminSettings', 'notifications'))).data();
      if (d) {
        this.usingDefault = !Array.isArray(d['emails']);
        this.text = Array.isArray(d['emails']) ? (d['emails'] as string[]).join('\n') : '';
        this.onSubmission = d['onSubmission'] !== false;
        this.onContact = d['onContact'] !== false;
      }
    } catch {
      this.toast.show('Could not load the notification settings.', 'danger');
    }
    this.loading = false;
  }

  get parsed() {
    return parseRecipients(this.text);
  }

  get problem(): string {
    const p = this.parsed;
    if (p.invalid.length) return `Not a valid email address: ${p.invalid.join(', ')}`;
    if (p.valid.length > this.max) return `At most ${this.max} recipients.`;
    return '';
  }

  async save() {
    if (this.problem) return;
    this.saving = true;
    try {
      await setDoc(doc(this.firestore, 'adminSettings', 'notifications'), {
        emails: this.parsed.valid,
        onSubmission: this.onSubmission,
        onContact: this.onContact,
        updatedAt: Timestamp.now(),
      });
      this.usingDefault = false;
      this.text = this.parsed.valid.join('\n');
      this.toast.show(this.parsed.valid.length ? 'Notification settings saved.' : 'Saved. Email notifications are off (no recipients).', 'success');
    } catch {
      this.toast.show('Could not save the settings.', 'danger');
    } finally {
      this.saving = false;
    }
  }

  async sendTest() {
    this.testing = true;
    try {
      const r = await httpsCallable<unknown, { sentTo: number }>(this.functions, 'sendTestNotification')({});
      this.toast.show(`Test email sent to ${r.data.sentTo} recipient(s).`, 'success');
    } catch (e) {
      this.toast.show((e as { message?: string })?.message || 'The test email failed.', 'danger');
    } finally {
      this.testing = false;
    }
  }
}
