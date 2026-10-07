import { isSafeBannerLink } from './site-settings.service';

describe('isSafeBannerLink', () => {
  it('allows in-app paths and http(s) URLs', () => {
    expect(isSafeBannerLink('/contribute')).toBeTrue();
    expect(isSafeBannerLink('https://example.org/x')).toBeTrue();
    expect(isSafeBannerLink('http://example.org')).toBeTrue();
  });

  it('rejects empty, protocol-relative and script-like links', () => {
    expect(isSafeBannerLink('')).toBeFalse();
    expect(isSafeBannerLink(undefined)).toBeFalse();
    expect(isSafeBannerLink('//evil.example')).toBeFalse();
    expect(isSafeBannerLink('javascript:alert(1)')).toBeFalse();
    expect(isSafeBannerLink('mailto:a@b.c')).toBeFalse();
  });
});
