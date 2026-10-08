import { Injectable, Optional, inject } from '@angular/core';
import { Analytics, logEvent } from '@angular/fire/analytics';

/** Event names used across the site. Parameters must never carry personal data or search text. */
export type SiteEvent =
  | 'journal_open'
  | 'pdf_view'
  | 'article_view'
  | 'search'
  | 'cite_copy'
  | 'ai_summary_view';

@Injectable({ providedIn: 'root' })
export class AnalyticsEventsService {
  private analytics = inject(Analytics, { optional: true });

  log(name: SiteEvent, params: Record<string, string | number | boolean> = {}): void {
    if (!this.analytics) return;
    try {
      logEvent(this.analytics, name as string, params);
    } catch {
      /* analytics is best effort */
    }
  }
}
