import { Component, OnInit, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ContactService } from '../../services/contact.service';
import { ToastService } from '../../services/toast.service';
import { Analytics, logEvent } from '@angular/fire/analytics';

@Component({
  selector: 'app-contact',
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss',
})
export class ContactComponent implements OnInit {
  form: FormGroup;
  submitting = false;

  constructor(
    private fb: FormBuilder,
    private contactService: ContactService,
    private toast: ToastService,
    @Optional() private analytics: Analytics | null
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(200)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(320)]],
      message: ['', [Validators.required, Validators.maxLength(10000)]],
    });
  }

  ngOnInit() {
    this.scrollToTop();
  }

  async onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting = true;
    try {
      const { name, email, message } = this.form.value;
      await this.contactService.submitMessage(name, email, message);
      this.form.reset();
      this.toast.show('Thank you — your message was sent.', 'success');
      if (this.analytics) {
        logEvent(this.analytics, 'contact_submit', {});
      }
    } catch {
      this.toast.show('Could not send your message. Please try again later.', 'danger');
    } finally {
      this.submitting = false;
    }
  }

  private scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
