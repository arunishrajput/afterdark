# UI / UX Specification

Mobile-first, one-handed, readable outdoors and at night. The core flow is in [RULES.md](RULES.md). Use the `frontend-ui-engineering`, `mobile-native` and `impeccable` skills when building UI.

## 1. Visual identity: "AfterDark"
- **Mood:** a night-time ops console, using deep blacks, neon edges, scanlines kept to a minimum, and a monospace for codes and tags.
- **Themes** are CSS variables on `<html data-theme>`:

| Token | `crew` | `imposter` | `neutral` (meetings, lobby, results) |
|---|---|---|---|
| `--bg` | #05070D | #0D0505 | #07080A |
| `--surface` | #0E1424 | #1F0B0B | #14161B |
| `--accent` | #2E8BFF | #FF3B3B | #E6E8EE |
| `--accent-glow` | rgba(46,139,255,.45) | rgba(255,59,59,.45) | rgba(230,232,238,.25) |
| `--text` | #E8EEFF | #FFECEC | #F2F3F5 |
| `--muted` | #8A94B3 | #B38A8A | #8E929C |
| `--danger` | #FF5A5A | #FFB020 | #FF5A5A |
| `--infected` (imposter only) | — | #7CFF4F | — |

- **Type:** a display face for titles (e.g. "Space Grotesk"), Inter for UI, JetBrains Mono for codes, tags and timers, all self-hosted variable fonts (Fontsource, latin subset), so they also work offline. Minimum body size 16 px.
- **Contrast:** WCAG AA at minimum, AAA for HUD numbers. Tap targets ≥ 44 px. Never rely on colour alone: roles also have icons and text labels.
- **Motion:** short and purposeful (150–250 ms), respecting `prefers-reduced-motion`. Haptics on Android through `navigator.vibrate`. iOS has no vibration, so use sound and visual pulses instead. Sounds are a small WebAudio kit (`net/sounds.ts`) with a **Sound** toggle in the lobby header and the game menu (remembered on the device; vibration is unaffected). Imposter-only cues are quiet and short (ADR-102). Every interactive element shows a `:focus-visible` outline in the theme accent.

## 2. Screens
| Screen | Key content | Notes |
|---|---|---|
| **Home** | A hero (ADR-110): the live night map (players walking in a drawn area, task pins, the Base, the crescent-and-eye, one player tailed by an Imposter), the split-tone AfterDark wordmark, "Among Us, played on your feet.", a one-line pitch, the facts line (players and minutes, from the config and presets), "Create game", "Join game" (code input), Install, How to play, the connection pill. Below the fold, "How a game goes" (three beats with the How to play pictures, the win conditions, "Walk, never run", "Read the full rules"). Two columns on a laptop | `?code=` pre-fills Join. Create and Join stay above the fold on a 360 × 640 phone. The map stands still with reduced motion |
| **Join / Create** | Username field and safety notice checkbox (required) | Validates in real time |
| **Lobby** | Large code with share and QR buttons, player list (ready ✓, host 👑, connection dot), map preview, setup checklist, Ready button, Test-mode badge | Ready is disabled until location is granted and good |
| **Host setup** (host only) | Steps: ① Boundary ② Regions ③ Task points ④ No-go zones ⑤ Base ⑥ Settings (presets Quick 15 / Standard 25 / Long 40, with advanced settings collapsed) | Each step shows ✓ when valid. Any edit un-readies everyone, with a toast. |
| **Permission gate** | Explains location and wake lock, with "Allow" and troubleshooting tips for iOS and Android | Shown before Ready |
| **Spawn** | Map with your spawn pin, distance, compass arrow, "6/8 players in position" and spawn timer | Host sees "Force start" |
| **Role reveal** | "Press and hold to reveal". While held, a full-screen role card shows CREW (blue, shield icon) or IMPOSTER (red, mask icon), your tag, and for imposters the class card and allies | Releasing hides it. Auto-continues after 10 s. The screen stays neutral until the hold, and the card is not in the DOM otherwise (ADR-057). |
| **Game (crew)** | A full-screen map, like a maps app (ADR-103). Floating top bar: match timer · infection boxes · team score bar · menu, with the status banners under it. Round **Fit** and **Locate me** buttons at the right, above the sheet. Floating bottom sheet: 3 task cards (+ partner card) showing stage, direction, distance and arrow, the card menu (reroll, report), and the status row (role, tag, your score, Meeting). Tap or swipe the sheet's handle to collapse it to the most useful card (at the pin, partner waiting, nearest) and see more map | Weak GPS, stale and out-of-bounds banners. Fits, Locate me and a tapped card centre on the band the bars leave free; the map never moves by itself when the sheet changes height. Toasts float just above the sheet |
| **Game (imposter)** | Same layout in red. The sheet holds the ability bar instead of task cards: Infect (enabled when a target is in range, with a channel ring), class ability button(s) with cooldown rings, the partner co-op card, an "infected" list chip | Phantom: "Place fake task" mode: the sheet becomes the placer bar and a crosshair marks the middle of the free band |
| **Camouflaged imposter** | Looks exactly like the crew game screen, with decoy task cards. A **discreet** imposter-only cue: a thin countdown line at the very top edge and a long-press menu to reach Infect | It must survive someone glancing at the screen |
| **Minigame sheet** | "Stop somewhere safe" interstitial (tap to continue), then the game with instructions, a timer for show, and success or failure feedback | Full-screen sheet, so the map is hidden. Every game is a lazy chunk with targets ≥ 44 px. Letter games (Mini Crossword, Signal Decode) use the on-screen `LetterPad` so the system keyboard never opens. Sliding Puzzle: numbered tiles, tap one beside the gap. Pattern Memory: flashes carry their step number, "Watch again" is free. Key Fetch: hold the round button for the whole time on leg 1 (lifting restarts it), then the card shows "🔑 Key in hand"; on leg 2 tap the turns in the order shown (arrows plus the words Left and Right) |
| **Co-op** | Waiting is on the task card: "Waiting for `<tag>`…", the safety line and **Cancel**, with the map still in view (ADR-104). Once both have joined, the full-screen PIN panel (show yours, type theirs, Step out), then "Co-op task complete" | |
| **Task Stop overlay** | "SYSTEMS JAMMED", countdown, glitch effect | Shown to everyone |
| **Fooled overlay** | Big, playful "You got fooled by a fake task!" with a laughing ghost illustration | Dismissable after 2 s |
| **Meeting** | **Neutral theme for everyone.** Gather (distance to Base, arrivals, **Show the map**) → Discuss (countdown, roster) → Vote (roster cards + Skip, confirm) → Result (tallies, ejection reveal) | Big type, so it can be held up in a circle. Show the map (Gather only, ADR-105): the full-screen map with the Base and its 30 m ring, the countdown on top, the arrow, distance, arrivals and "Back to the meeting" below; no tasks or fakes, and no ally or infection marks on any dot. It closes when Discuss starts |
| **Spectator** | Neutral theme, the same full-screen map and floating top bar as the game, "You were ejected" in the bottom sheet | No hidden information |
| **Results** | Winner banner and reason (crew blue or imposter red glow; "Aborted by host" after an abort), "Who was who" cards flipping in one by one (imposters first: role, class, tag), team-score chart against the target, awards (crew MVP, top infector, most fooled) and the ranked leaderboard, timeline (icon, match-clock time, a sentence), meeting history (counts only), **Play again** (host) or "Waiting for the host…", optional Share result (Web Share, text only), Leave | Neutral theme. One scrolling page; the reveal never relies on colour alone (ADR-098) |
| **How to play** | 5 short illustrated cards (inline SVG): The goal · Tasks and directions · Imposters and infection · Meetings and voting · Safety first | Reachable from Home and the Lobby; the Lobby shows a one-time "New to AfterDark?" hint (remembered per device) |

## 2b. Connection, install and update bars
- **Reconnecting…** (top bar, with *Retry now*): appears after `reconnectBannerAfterMs` (2 s) offline, for anyone in a lobby or game. The copy says the game is safe: it is, because the state lives on the server.
- **Update available. Tap to reload**: only on Home, in the lobby and on the results screen; never during spawn, reveal or play (ADR-099).
- **Install AfterDark** (Home): a button where the browser offers installation; on iOS Safari, written Share → Add to Home Screen steps that can be dismissed.
- **You were away** toast: after more than `staleAfterS` in the background during a game.

## 3. HUD details
- **Infection boxes:** `crewCount` squares. Filled boxes = compromised. A notch after box number `threshold` marks the imposter win line. When a box fills, animate it with a glitch, play a sound, and show the toast "Someone has been compromised".
- **Team score bar:** shows `teamScore / targetScore`, plus a +N float animation when it goes up.
- **Timer:** mm:ss of game time remaining. Shows "PAUSED" while frozen.
- **Task card:** shows the stage icon (compass, then pin, then target), the "NE · Region A" label (co-op: "Find `<tag>` · NE · Region A"), and a distance and bearing arrow from the device heading when available, falling back to a map-north arrow. The label wraps; it is never cut off. At the pin, Start (or Start co-op / Join, or the co-op wait with Cancel) gets its own full-width row. Tapping the card centres the map on its target.
- **Direction guidance:** a vibration (Android) or chime when entering the section, and again on arrival at the pin, so players don't stare at the screen while walking.

## 4. Copy guidelines
Short, imperative and a little playful. Wording to use exactly:
- "You got fooled by a fake task!"
- "SYSTEMS JAMMED"
- "Go to the Base"
- "Co-op task expired"
- "Return to the zone"
- "Weak GPS: move to open sky"
- "Stop somewhere safe"

## 5. Accessibility and safety
- Every action is reachable by touch with large targets. Minigames avoid colour-only cues. Text scales with system font size where the layout allows.
- No page is ever wider than the screen, and no text is truncated with an ellipsis: long labels and names wrap (ADR-106). `e2e/layout.spec.ts` checks 360 px phones.
- The safety notice is shown on join. The "Stop somewhere safe" interstitial is shown before every minigame. "Leave game" (with a confirm) is reachable from the menu on every in-game screen: spawn, reveal, play, meeting and spectator. Guidance never says "run"; `apps/server/test/clientCopy.test.ts` scans the client's text for it. The join notice includes "walk and never run".
