import { environment } from '../../environments/environment';

/**
 * URL used in iframes / "open in new tab" for issue PDFs.
 * In production, uses the Hosting → Cloud Function proxy `/pdf/{id}` so the response
 * `Content-Disposition` filename is neutral (not the original upload name in Storage).
 * In development, uses the direct Storage download URL (localhost has no `/pdf` rewrite).
 */
export function publicPdfDisplayUrl(
  journalId: string,
  directStorageDownloadUrl: string
): string {
  if (!journalId?.trim() || !directStorageDownloadUrl) {
    return directStorageDownloadUrl;
  }
  if (!environment.production) {
    return directStorageDownloadUrl;
  }
  const origin = environment.siteUrl.replace(/\/$/, '');
  return `${origin}/pdf/${encodeURIComponent(journalId)}`;
}
