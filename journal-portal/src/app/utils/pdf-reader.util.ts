/** Pure helpers for the PDF reader (unit tested). */

export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
export const PAGE_GAP = 12;

export function clampPage(n: number, total: number): number {
  if (!Number.isFinite(n) || total < 1) return 1;
  return Math.min(Math.max(Math.round(n), 1), total);
}

export function nextZoom(current: number, dir: 1 | -1): number {
  if (dir === 1) {
    return ZOOM_STEPS.find((z) => z > current + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  }
  return [...ZOOM_STEPS].reverse().find((z) => z < current - 0.001) ?? ZOOM_STEPS[0];
}

/** Scale that fits a page of (pageW x pageH) into the container, either by width or whole page. */
export function fitScale(
  mode: 'width' | 'page',
  box: { width: number; height: number },
  page: { width: number; height: number },
  padding = 32
): number {
  const byWidth = (box.width - padding) / page.width;
  const s = mode === 'width' ? byWidth : Math.min(byWidth, (box.height - padding / 2) / page.height);
  return Math.min(Math.max(s, 0.25), 4);
}

/** The page shown at the top third of the viewport, for stacked pages of equal height. */
export function pageAtScroll(scrollTop: number, viewportHeight: number, pageHeight: number, total: number): number {
  const probe = scrollTop + viewportHeight / 3;
  return clampPage(Math.floor(probe / (pageHeight + PAGE_GAP)) + 1, total);
}

export function scrollTopForPage(page: number, pageHeight: number): number {
  return (Math.max(page, 1) - 1) * (pageHeight + PAGE_GAP);
}

/** Count non-overlapping occurrences of `needle` in `hay` (both already lower-cased). */
export function countOccurrences(hay: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) n++;
  return n;
}

export const lastPageKey = (journalId: string) => `ijdr-pdf-page-${journalId}`;

export function readLastPage(journalId: string): number | null {
  try {
    const v = parseInt(localStorage.getItem(lastPageKey(journalId)) ?? '', 10);
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveLastPage(journalId: string, page: number): void {
  try {
    localStorage.setItem(lastPageKey(journalId), String(page));
  } catch {
    /* storage unavailable */
  }
}

/** Page a reader should open at: an explicit deep link wins, then the remembered page, else 1. */
export function startingPage(deepLink: number | null | undefined, remembered: number | null, total: number): number {
  if (deepLink && deepLink > 0) return clampPage(deepLink, total);
  if (remembered && remembered > 0) return clampPage(remembered, total);
  return 1;
}
