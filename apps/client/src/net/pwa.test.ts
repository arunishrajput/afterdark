import { describe, expect, it } from 'vitest';

import { isIosSafariBrowser, updateBannerAllowed } from './pwa';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const IPAD_OS =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';

describe('updateBannerAllowed', () => {
  it('holds the update back while a game is running', () => {
    for (const phase of ['spawning', 'reveal', 'playing'])
      expect(updateBannerAllowed(phase)).toBe(false);
  });
  it('shows it on Home, in the lobby and on the results', () => {
    for (const phase of [undefined, 'lobby', 'ended'])
      expect(updateBannerAllowed(phase)).toBe(true);
  });
});

describe('isIosSafariBrowser', () => {
  it('is true for iPhone Safari and iPadOS Safari outside the installed app', () => {
    expect(isIosSafariBrowser(IPHONE_SAFARI, 5, false)).toBe(true);
    expect(isIosSafariBrowser(IPAD_OS, 5, false)).toBe(true);
  });
  it('is false once installed, in other iOS browsers, on a desktop Mac and on Android', () => {
    expect(isIosSafariBrowser(IPHONE_SAFARI, 5, true)).toBe(false);
    expect(isIosSafariBrowser(IPHONE_CHROME, 5, false)).toBe(false);
    expect(isIosSafariBrowser(IPAD_OS, 0, false)).toBe(false);
    expect(isIosSafariBrowser(ANDROID, 5, false)).toBe(false);
  });
});
