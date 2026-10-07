import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  SiteSettingsService,
  isSafeBannerLink,
} from '../../../services/site-settings.service';
import { ToastService } from '../../../services/toast.service';

function optionalLinkValidator(c: AbstractControl): ValidationErrors | null {
  const v = String(c.value ?? '').trim();
  return !v || isSafeBannerLink(v) ? null : { link: true };
}

@Component({
  selector: 'app-admin-announcement',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-announcement.component.html',
})
export class AdminAnnouncementComponent implements OnInit {
  private fb = inject(FormBuilder);
  private settings = inject(SiteSettingsService);
  private toast = inject(ToastService);

  loading = true;
  saving = false;

  form = this.fb.nonNullable.group({
    enabled: [false],
    text: ['', [Validators.maxLength(280)]],
    linkUrl: ['', [optionalLinkValidator]],
    linkLabel: ['', [Validators.maxLength(40)]],
  });

  async ngOnInit() {
    const a = await firstValueFrom(this.settings.getAnnouncement());
    if (a) {
      this.form.patchValue({
        enabled: !!a.enabled,
        text: a.text ?? '',
        linkUrl: a.linkUrl ?? '',
        linkLabel: a.linkLabel ?? '',
      });
    }
    this.loading = false;
  }

  async save() {
    const v = this.form.getRawValue();
    if (v.enabled && !v.text.trim()) {
      this.toast.show('Enter the announcement text before enabling it.', 'warning');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    try {
      await this.settings.saveAnnouncement(v);
      this.toast.show(
        v.enabled ? 'Announcement saved and live.' : 'Announcement saved (hidden).',
        'success'
      );
    } catch {
      this.toast.show('Could not save the announcement.', 'danger');
    } finally {
      this.saving = false;
    }
  }
}
