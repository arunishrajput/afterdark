/**
 * PWA plumbing (ARCHITECTURE §8): service-worker registration with a queued
 * update, Android's install prompt and the iOS Add-to-Home-Screen hint.
 */
import { registerSW } from 'virtual:pwa-register';
import { create } from 'zustand';

const UPDATE_CHECK_MS = 60 * 60 * 1000;
const IOS_HINT_KEY = 'afterdark.iosHintDismissed';

/** Chromium's install prompt event (not in lib.dom). */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** A new build is installed and waiting for a reload. */
  updateReady: boolean;
  /** Chromium offered to install the app; kept until the player taps the button. */
  installEvent: InstallPromptEvent | undefined;
  installed: boolean;
  /** The player closed the iOS instructions (remembered on this device). */
  iosHintDismissed: boolean;
}

export const usePwa = create<PwaState>()(() => ({
  updateReady: false,
  installEvent: undefined,
  installed: false,
  iosHintDismissed: readIosHintDismissed(),
}));

function readIosHintDismissed(): boolean {
  try {
    return globalThis.localStorage?.getItem(IOS_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissIosHint(): void {
  usePwa.setState({ iosHintDismissed: true });
  try {
    globalThis.localStorage?.setItem(IOS_HINT_KEY, '1');
  } catch {
    // blocked storage: the hint just comes back next visit
  }
}

/**
 * Updates reload the page, so they never show mid-game (PHASE-13 §13.1):
 * only on Home (no lobby), in a lobby, or on the results screen.
 */
export function updateBannerAllowed(phase: string | undefined): boolean {
  return phase === undefined || phase === 'lobby' || phase === 'ended';
}

/** True on Safari for iPhone/iPad (including iPadOS, which reports as a Mac) outside the installed app. */
export function isIosSafariBrowser(
  userAgent: string,
  maxTouchPoints: number,
  standalone: boolean,
): boolean {
  if (standalone) return false;
  const iPhoneLike = /iPhone|iPad|iPod/.test(userAgent);
  const iPadOs = /Macintosh/.test(userAgent) && maxTouchPoints > 1;
  if (!iPhoneLike && !iPadOs) return false;
  // Other iOS browsers (Chrome, Firefox, Edge, Opera) cannot add to the Home Screen the same way.
  return !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(userAgent);
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
  );
}

let applyUpdate: ((reload?: boolean) => Promise<void>) | undefined;

/** Activates the waiting service worker and reloads. */
export function reloadForUpdate(): void {
  void applyUpdate?.(true);
}

/** Android/Chromium: shows the browser's install dialog. */
export async function promptInstall(): Promise<void> {
  const event = usePwa.getState().installEvent;
  if (!event) return;
  usePwa.setState({ installEvent: undefined }); // an event can be used once
  await event.prompt();
  await event.userChoice;
}

let started = false;

export function startPwa(): void {
  if (started) return;
  started = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own button on Home
    usePwa.setState({ installEvent: e as InstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => {
    usePwa.setState({ installed: true, installEvent: undefined });
  });
  if (!('serviceWorker' in navigator)) return;
  applyUpdate = registerSW({
    onNeedRefresh: () => usePwa.setState({ updateReady: true }),
    onRegisteredSW: (_url, registration) => {
      if (registration) setInterval(() => void registration.update(), UPDATE_CHECK_MS);
    },
  });
}
