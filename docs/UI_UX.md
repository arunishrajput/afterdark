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

- **Type:** a display face for titles (e.g. "Space Grotesk"), Inter for UI, JetBrains Mono for codes, tags and timers, all from Google Fonts. Minimum body size 16 px.
- **Contrast:** WCAG AA at minimum, AAA for HUD numbers. Tap targets ≥ 44 px. Never rely on colour alone: roles also have icons and text labels.
- **Motion:** short and purposeful (150–250 ms), respecting `prefers-reduced-motion`. Haptics on Android through `navigator.vibrate`. iOS has no vibration, so use sound and visual pulses instead.

## 2. Screens
| Screen | Key content | Notes |
|---|---|---|
| **Home** | Logo, "Create game", "Join game" (code input), How to play | `?code=` pre-fills Join |
| **Join / Create** | Username field and safety notice checkbox (required) | Validates in real time |
| **Lobby** | Large code with share and QR buttons, player list (ready ✓, host 👑, connection dot), map preview, setup checklist, Ready button, Test-mode badge | Ready is disabled until location is granted and good |
| **Host setup** (host only) | Steps: ① Boundary ② Regions ③ Task points ④ No-go zones ⑤ Base ⑥ Settings (presets Quick 15 / Standard 25 / Long 40, with advanced settings collapsed) | Each step shows ✓ when valid. Any edit un-readies everyone, with a toast. |
| **Permission gate** | Explains location and wake lock, with "Allow" and troubleshooting tips for iOS and Android | Shown before Ready |
| **Spawn** | Map with your spawn pin, distance, compass arrow, "6/8 players in position" and spawn timer | Host sees "Force start" |
| **Role reveal** | "Press and hold to reveal". While held, a full-screen role card shows CREW (blue, shield icon) or IMPOSTER (red, mask icon), your tag, and for imposters the class card and allies | Releasing hides it. Auto-continues after 10 s. |
| **Game (crew)** | Top bar: match timer · infection boxes · team score bar. Map in the middle. Bottom sheet: 3 task cards (+ partner card) showing stage, direction, distance and arrow; reroll; meeting button | Weak GPS, stale and out-of-bounds banners |
| **Game (imposter)** | Same layout in red. The ability bar replaces the task sheet: Infect (enabled when a target is in range, with a channel ring), class ability button(s) with cooldown rings, the partner co-op card, an "infected" list chip | Phantom: "Place fake task" mode with a crosshair |
| **Camouflaged imposter** | Looks exactly like the crew game screen, with decoy task cards. A **discreet** imposter-only cue: a thin countdown line at the very top edge and a long-press menu to reach Infect | It must survive someone glancing at the screen |
| **Minigame sheet** | "Stop somewhere safe" interstitial (tap to continue), then the game with instructions, a timer for show, and success or failure feedback | Full-screen sheet, so the map is hidden |
| **Co-op waiting** | "Waiting for `<tag>`…", the PIN panel once joined, cancel | |
| **Task Stop overlay** | "SYSTEMS JAMMED", countdown, glitch effect | Shown to everyone |
| **Fooled overlay** | Big, playful "You got fooled by a fake task!" with a laughing ghost illustration | Dismissable after 2 s |
| **Meeting** | **Neutral theme for everyone.** Gather (distance to Base, arrivals) → Discuss (countdown, roster) → Vote (roster cards + Skip, confirm) → Result (tallies, ejection reveal) | Big type, so it can be held up in a circle |
| **Spectator** | Neutral theme, "You were ejected", public map and HUD | No hidden information |
| **Results** | Winner banner and reason, roles/classes/tags revealed, infection timeline, meeting history, leaderboard (crew MVP, top infector, most fooled), Play again (host) | Neutral theme |
| **How to play** | 5 short illustrated cards | Reachable from Home and the Lobby |

## 3. HUD details
- **Infection boxes:** `crewCount` squares. Filled boxes = compromised. A notch after box number `threshold` marks the imposter win line. When a box fills, animate it with a glitch, play a sound, and show the toast "Someone has been compromised".
- **Team score bar:** shows `teamScore / targetScore`, plus a +N float animation when it goes up.
- **Timer:** mm:ss of game time remaining. Shows "PAUSED" while frozen.
- **Task card:** shows the stage icon (compass, then pin, then target), the "NE · Region A" label, and a distance and bearing arrow from the device heading when available, falling back to a map-north arrow. Tapping centres the map.
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
- The safety notice is shown on join. The "Stop somewhere safe" interstitial is shown before every minigame. "Leave game" is always reachable from the menu. Guidance never says "run".
