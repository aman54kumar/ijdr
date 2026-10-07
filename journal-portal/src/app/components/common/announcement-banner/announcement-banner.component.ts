import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Announcement } from '../../../type/journals.type';
import {
  SiteSettingsService,
  isSafeBannerLink,
} from '../../../services/site-settings.service';

const DISMISS_KEY = 'ijdr-announcement-dismissed';

@Component({
  selector: 'app-announcement-banner',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './announcement-banner.component.html',
  styleUrl: './announcement-banner.component.scss',
})
export class AnnouncementBannerComponent {
  private settings = inject(SiteSettingsService);
  readonly announcement = toSignal(this.settings.getAnnouncement());
  private dismissedVersion: string | null = this.readDismissed();
  dismissed = false;

  /** Dismissal is remembered per announcement version (its updatedAt). */
  get visible(): boolean {
    const a = this.announcement();
    return (
      !!a?.enabled &&
      !!a.text &&
      !this.dismissed &&
      this.dismissedVersion !== this.version(a)
    );
  }

  isInternal(url: string | undefined): boolean {
    return !!url && url.startsWith('/');
  }

  isSafe(url: string | undefined): boolean {
    return isSafeBannerLink(url);
  }

  dismiss(): void {
    const a = this.announcement();
    this.dismissed = true;
    try {
      localStorage.setItem(DISMISS_KEY, this.version(a));
    } catch {
      // storage unavailable: dismissed for this page view only
    }
  }

  private version(a: Announcement | undefined): string {
    const t = a?.updatedAt;
    return String(t?.toMillis?.() ?? t?.seconds ?? a?.text ?? '');
  }

  private readDismissed(): string | null {
    try {
      return localStorage.getItem(DISMISS_KEY);
    } catch {
      return null;
    }
  }
}
