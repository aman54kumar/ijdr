import { Injectable } from '@angular/core';
import type { AppCheck } from 'firebase/app-check';
import { environment } from '../../environments/environment';

/**
 * Firebase App Check (reCAPTCHA v3), started on demand. It is only needed by the public AI
 * features and the manuscript form, so the ~700 kB of reCAPTCHA code stays off every other page.
 */
@Injectable({ providedIn: 'root' })
export class AppCheckService {
  readonly enabled = !!environment.recaptchaSiteKey;
  private instance?: Promise<AppCheck | null>;

  ensure(): Promise<AppCheck | null> {
    if (!this.enabled) return Promise.resolve(null);
    this.instance ??= (async () => {
      const [{ getApp }, ac] = await Promise.all([import('firebase/app'), import('firebase/app-check')]);
      if (!environment.production) {
        // Prints a debug token in the console; register it under Firebase Console -> App Check -> Manage debug tokens.
        (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }
      return ac.initializeAppCheck(getApp(), {
        provider: new ac.ReCaptchaEnterpriseProvider(environment.recaptchaSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    })();
    return this.instance;
  }

  /** Start loading once the page is idle, so the first AI or upload call is not delayed. */
  warmUp(): void {
    if (!this.enabled) return;
    const run = () => void this.ensure().catch(() => undefined);
    if ('requestIdleCallback' in window) {
      (window as unknown as { requestIdleCallback: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback(run, { timeout: 4000 });
    } else {
      setTimeout(run, 2000);
    }
  }

  async token(): Promise<string> {
    const ac = await this.ensure();
    if (!ac) throw new Error('App Check is not configured.');
    const { getToken } = await import('firebase/app-check');
    return (await getToken(ac)).token;
  }
}
