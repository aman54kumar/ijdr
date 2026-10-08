import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SubmissionService, checkFile } from '../../../services/submission.service';

@Component({
  selector: 'app-submission-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './submission-form.component.html',
  styleUrl: './submission-form.component.scss',
})
export class SubmissionFormComponent {
  private fb = inject(FormBuilder);
  private service = inject(SubmissionService);

  readonly available = this.service.available;
  sending = false;
  error = '';
  reference = '';
  manuscript: File | null = null;
  coverLetter: File | null = null;
  manuscriptError = '';
  coverError = '';

  form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(320)]],
    affiliation: ['', [Validators.required, Validators.maxLength(300)]],
    phone: ['', [Validators.maxLength(40)]],
    title: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(400)]],
    abstract: ['', [Validators.required, Validators.minLength(100), Validators.maxLength(4000)]],
    keywords: ['', [Validators.required]],
    note: ['', [Validators.maxLength(2000)]],
    consent: [false, [Validators.requiredTrue]],
  });

  onFile(kind: 'manuscript' | 'coverLetter', ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0] ?? null;
    const err = file ? checkFile(kind, file) : null;
    if (kind === 'manuscript') {
      this.manuscript = err ? null : file;
      this.manuscriptError = err ?? '';
    } else {
      this.coverLetter = err ? null : file;
      this.coverError = err ?? '';
    }
    if (err) (ev.target as HTMLInputElement).value = '';
  }

  invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  async submit() {
    this.error = '';
    this.form.markAllAsTouched();
    if (!this.manuscript) this.manuscriptError ||= 'Please choose your manuscript file.';
    const kw = this.form.controls.keywords.value.split(/[,;\n]/).filter((k) => k.trim()).length;
    if (kw < 2) this.form.controls.keywords.setErrors({ min: true });
    if (this.form.invalid || !this.manuscript || this.sending) return;

    const v = this.form.getRawValue();
    const data = new FormData();
    for (const k of ['name', 'email', 'affiliation', 'phone', 'title', 'abstract', 'keywords', 'note'] as const) {
      data.append(k, v[k]);
    }
    data.append('consent', 'true');
    data.append('manuscript', this.manuscript);
    if (this.coverLetter) data.append('coverLetter', this.coverLetter);

    this.sending = true;
    try {
      this.reference = await this.service.submit(data);
      this.form.reset();
      this.manuscript = this.coverLetter = null;
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.sending = false;
    }
  }
}
