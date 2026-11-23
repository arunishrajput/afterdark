# Phase 13: PWA, Mobile and Safety Polish

**Goal:** an installable, resilient and pleasant mobile app. Manifest, icons, offline shell, update flow, the iOS and Android install experience, safe areas and viewport fixes, haptics and sound, solid reconnects, battery throttling, the How-to-Play screen, the safety UX pass, and a Lighthouse audit.

**Depends on:** Phase 12.

**Read first:**
- [ARCHITECTURE.md §8, §11](../ARCHITECTURE.md)
- [UI_UX.md](../UI_UX.md) (all of it)
- [PRD.md §7–8](../PRD.md) (NFRs, safety)
- [CONFIG.md](../CONFIG.md) (`stationarySendIntervalMs`)
- [RULES.md §10](../RULES.md#10-connectivity)

**Skills to use:** `mobile-native`, `frontend-ui-engineering`, `impeccable` (polish pass), `performance-optimization`, `web-design-guidelines`, `source-driven-development` (vite-plugin-pwa and Workbox config).

## Scope
- **In:** PWA, install UX, mobile fixes, haptics and audio, reconnect UX, battery optimisation, How-to-Play, safety prompts, accessibility, and performance work on the bundle and tiles.
- **Out:** push notifications, background location (not possible in browsers).

## Tasks
- [ ] **13.1 vite-plugin-pwa:**
  - manifest: name, short_name, standalone, portrait, `theme_color` and `background_color` from the tokens
  - icons: 192, 512 and maskable, generated from one SVG logo that Claude designs (crescent moon + mask motif)
  - Workbox: precache the shell; runtime CacheFirst for map tiles (max 500 entries, 7 days); NetworkFirst for `index.html`
  - `registerType: 'prompt'` with an "Update available, tap to reload" toast, never shown mid-game; queue it until the lobby or results screen
- [ ] **13.2 Install UX:** Android `beforeinstallprompt` → an "Install AfterDark" button on Home. iOS: detect Safari when not standalone and show Add-to-Home-Screen instructions (Share → Add to Home Screen), dismissable and remembered.
- [ ] **13.3 Mobile fixes** (from the `mobile-native` skill):
  - `100dvh` layouts
  - safe-area insets (notch, home bar)
  - `viewport-fit=cover`
  - no tap highlight flash
  - `touch-action` on the map and minigames
  - disable pull-to-refresh during play
  - inputs ≥ 16 px (no zoom)
  - no long-press text selection on buttons
  - status-bar meta tags matching the theme
- [ ] **13.4 Haptics and audio:** `useHaptics` (vibrate patterns per event; no-op on iOS) and a small WebAudio sound kit generated in code (reveal chime, section enter, at-pin, success, fail, infection box, meeting alarm, jammed, fooled) with a mute toggle remembered in localStorage. Keep imposter-specific sounds quiet and short, so they don't give the player away.
- [ ] **13.5 Reconnect resilience:**
  - Socket.IO backoff tuned
  - a visible "Reconnecting…" banner with retry
  - on resume, re-fetch the view and re-sync the clock
  - re-acquire the wake lock on `visibilitychange`
  - a "You were away; your location went stale" notice when the player comes back from the background
- [ ] **13.6 Battery:** send every 5 s when stationary (movement under 3 m over 10 s) and every 1 s when moving. Drop high-accuracy GPS in the lobby when the setup step doesn't need it. Measure it in the field-test template.
- [ ] **13.7 How to Play:** 5 illustrated cards (inline SVG): Goal · Tasks & directions · Imposters & infection · Meetings & voting · Safety. Reachable from Home and the Lobby. A first-run hint in the Lobby.
- [ ] **13.8 Safety UX pass:** check the join notice text, the "Stop somewhere safe" interstitial before every minigame, Leave game in the menu with a confirm, and no "run" wording anywhere (grep the copy).
- [ ] **13.9 Accessibility pass:** run the `web-design-guidelines` review; fix contrast, focus states, aria labels on icon buttons, and reduced-motion handling.
- [ ] **13.10 Performance:**
  - Lighthouse (mobile) on the production build: PWA installable, Performance ≥ 85, Accessibility ≥ 95
  - initial JS ≤ 300 KB gzipped (check the bundle; lazy-load map, minigames and results)
  - fix regressions
- [ ] **13.11 E2E updates:** offline shell loads when the network is offline (Playwright `context.setOffline`); the update toast appears; How-to-Play opens.
- [ ] **13.12 Wrap up.** Update the docs. Commit, tag, push. Ask the human for a field test of install and battery.

## Acceptance criteria
- The app installs on Android (prompt) and iOS (instructions), and launches standalone in the dark theme.
- The offline shell loads. Updates never interrupt a game.
- Reconnects are smooth and visible. Battery throttling is active.
- Lighthouse targets are met. The bundle budget is met.

## Verification
```
pnpm verify && pnpm e2e
pnpm build && npx lighthouse <prod-url> --form-factor=mobile --only-categories=performance,accessibility,best-practices
```

## Manual steps for the human
Install on your phone (both platforms if possible), play 20 min, and report the battery drop and any rough edges.

## Docs to update
ARCHITECTURE.md §8, UI_UX.md (if the design evolved), PROGRESS.md.
