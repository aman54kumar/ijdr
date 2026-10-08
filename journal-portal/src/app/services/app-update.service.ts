import { Injectable, inject } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';
import { ConfirmModalService } from './confirm-modal.service';

/** Offers a reload when the service worker has downloaded a new version of the site. */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private updates = inject(SwUpdate, { optional: true });
  private confirm = inject(ConfirmModalService);
  private prompting = false;

  start(): void {
    const updates = this.updates;
    if (!updates?.isEnabled) return;
    updates.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(async () => {
        if (this.prompting) return;
        this.prompting = true;
        const reload = await this.confirm.ask('Update available', 'A new version of this site is ready. Reload now to use it?');
        this.prompting = false;
        if (reload) document.location.reload();
      });
    // Look for updates now and every 6 hours while the tab stays open.
    void updates.checkForUpdate().catch(() => undefined);
    setInterval(() => void updates.checkForUpdate().catch(() => undefined), 6 * 60 * 60 * 1000);
  }
}
