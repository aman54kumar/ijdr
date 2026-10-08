import {
  PAGE_GAP, clampPage, countOccurrences, fitScale, lastPageKey, nextZoom, pageAtScroll, readLastPage, saveLastPage,
  scrollTopForPage, startingPage,
} from './pdf-reader.util';

describe('pdf-reader.util', () => {
  it('clamps pages', () => {
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(99, 10)).toBe(10);
    expect(clampPage(4.6, 10)).toBe(5);
    expect(clampPage(NaN, 10)).toBe(1);
  });

  it('steps zoom through presets and stops at the ends', () => {
    expect(nextZoom(1, 1)).toBe(1.25);
    expect(nextZoom(1.1, 1)).toBe(1.25);
    expect(nextZoom(3, 1)).toBe(3);
    expect(nextZoom(1, -1)).toBe(0.75);
    expect(nextZoom(0.5, -1)).toBe(0.5);
  });

  it('computes fit scales', () => {
    const page = { width: 600, height: 800 };
    expect(fitScale('width', { width: 632, height: 400 }, page)).toBeCloseTo(1, 5);
    // short viewport: fitting the whole page is smaller than fitting the width
    expect(fitScale('page', { width: 632, height: 416 }, page)).toBeLessThan(fitScale('width', { width: 632, height: 416 }, page));
    expect(fitScale('width', { width: 10, height: 10 }, page)).toBe(0.25);
  });

  it('maps scroll position to page and back', () => {
    const h = 1000;
    expect(pageAtScroll(0, 900, h, 50)).toBe(1);
    expect(pageAtScroll(scrollTopForPage(7, h), 900, h, 50)).toBe(7);
    expect(scrollTopForPage(3, h)).toBe(2 * (h + PAGE_GAP));
    expect(pageAtScroll(1e9, 900, h, 50)).toBe(50);
  });

  it('counts occurrences', () => {
    expect(countOccurrences('aaa a', 'a')).toBe(4);
    expect(countOccurrences('credit and rural credit', 'credit')).toBe(2);
    expect(countOccurrences('x', '')).toBe(0);
  });

  it('chooses the starting page: deep link, then remembered, then 1', () => {
    expect(startingPage(5, 9, 20)).toBe(5);
    expect(startingPage(null, 9, 20)).toBe(9);
    expect(startingPage(undefined, null, 20)).toBe(1);
    expect(startingPage(99, null, 20)).toBe(20);
  });

  it('remembers the last page per issue', () => {
    localStorage.removeItem(lastPageKey('t1'));
    expect(readLastPage('t1')).toBeNull();
    saveLastPage('t1', 12);
    expect(readLastPage('t1')).toBe(12);
    localStorage.removeItem(lastPageKey('t1'));
  });
});
