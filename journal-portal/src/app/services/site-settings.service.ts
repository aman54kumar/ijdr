import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  docData,
  setDoc,
  Timestamp,
} from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Announcement } from '../type/journals.type';

@Injectable({ providedIn: 'root' })
export class SiteSettingsService {
  private firestore = inject(Firestore);

  /** Live `siteSettings/announcement`; emits undefined when missing or unreadable. */
  getAnnouncement(): Observable<Announcement | undefined> {
    return (
      docData(doc(this.firestore, 'siteSettings', 'announcement')) as Observable<
        Announcement | undefined
      >
    ).pipe(catchError(() => of(undefined)));
  }

  async saveAnnouncement(a: Omit<Announcement, 'updatedAt'>): Promise<void> {
    await setDoc(doc(this.firestore, 'siteSettings', 'announcement'), {
      enabled: a.enabled,
      text: a.text.trim(),
      linkUrl: (a.linkUrl ?? '').trim(),
      linkLabel: (a.linkLabel ?? '').trim(),
      updatedAt: Timestamp.now(),
    });
  }
}

/** Only allow in-app paths and http(s) links in the banner. */
export function isSafeBannerLink(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  return /^\/(?!\/)/.test(url) || /^https?:\/\//i.test(url);
}
