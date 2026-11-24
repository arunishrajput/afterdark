# AfterDark: 3-Minute Judge Demo

A script for presenting AfterDark to judges indoors, on a projector, with no walking. Two laptop browser windows play two phones in the GPS simulator: one **crew**, one **imposter**. Six in-process bots fill the lobby to 8. Everything shown is the real game on the real server; only the positions are simulated.

## The setup you want on screen
| Window | Who | What it shows |
|---|---|---|
| **A** (left half) | "Host", crew | The host's phone: drawing the area, tasks, the minigame, the infection boxes filling |
| **B** (right half) | "Guest", imposter | The imposter's phone: red theme, Infect, Task Stop |
| **C** (spare tab) | the finished game from the dry run | The results screen, as the fallback ending |

Open both windows at about 390 × 844 (Chrome DevTools → device toolbar → a phone size), side by side, so they read as two phones.

### Getting the roles you want (one crew, one imposter)
Roles are secret and random, so plan for it:
- **Reliable (local server):** run the server with a pinned room salt, `TEST_ROOM_SALT=e2e-a pnpm dev`, and open `http://127.0.0.1:5173/?sim=1`. With that salt, in an 8-player lobby the **creator is crew** and **the first person to join, before the bots, is an imposter** (the same seats the e2e full-game test uses). Only the room's first game is pinned.
- **Live URL:** roles are truly random. If neither window drew imposter, finish or abort the game and tap **Play again** (new roles each game), or present from the crew side only and let the bots be the imposters.

## Pre-demo checklist (10 minutes before)
1. **Warm the server:** open <https://afterdark-24gx.onrender.com> two minutes early (the free plan sleeps after 15 minutes idle; the first load can take a minute). Check that the home screen shows `build <sha>`.
2. **Do a dry run** of the whole script once and **keep its results tab open** (window C, the fallback ending).
3. **Network:** a phone hotspot as backup to the venue Wi-Fi. Laptop on power; phone above 50% battery if you show a real phone.
4. **Browser:** two clean windows (or two profiles: each window is a separate player), sound on, zoom 100%, notifications off.
5. **Local fallback ready:** `pnpm install && pnpm dev` works offline once installed; have the terminal open.
6. Do **not** push to `main` during the demo: every push redeploys Render and ends running lobbies.

## The script (3 minutes)
| Time | Say | Do |
|---|---|---|
| **0:00–0:20** Pitch | "AfterDark is Among Us played on your feet. Crew walk to hidden task spots on a real map and solve quick puzzles. Imposters secretly infect people just by standing near them. When someone gets suspicious, everyone meets face to face and votes. It's a web app: no install, no accounts, share a code and play." | Window A on the home screen. |
| **0:20–0:50** The host draws the play area | "The host draws the area around the venue. AfterDark splits it into regions and places the task spots, avoiding any no-go zones the host marks." | A: **Create game** → name → **Create lobby**. Settings **Edit** → tick **Test mode**, "Who you see on the map" → **Everyone**, "Imposter abilities" → **All three** → **Save**. Expand the map, pick the circle tool, draw about 150 m around the venue; step through ② Regions and ③ Task points to show the labels. |
| **0:50–1:05** Players and bots | "For the demo, one more phone joins, and six bots fill the lobby. In the field these are your friends." | B: open the lobby link (or type the code) → **Join**. A: **Add 7 bots**, then kick one so there are 8. Both: **Ready**. A: **Force start** on the spawn screen. |
| **1:05–1:20** Secret roles | "Everyone holds to read their role in secret. The crew phone turns blue, the imposter phone turns red, and the imposter sees their allies." | A and B: press and hold the circle. Point at the two colours. |
| **1:20–1:50** A task | "Crew only get a direction: North-East of Region B. Walk into that slice of the map and the exact pin appears. At the pin you get a 20-second puzzle; the server checks every answer." | A: tap the first card (the map highlights the section). Long-press inside it (the simulator teleports), wait for the pin, long-press on the pin, **Start** → "Stop somewhere safe" → solve the minigame. Point at the team score going up. |
| **1:50–2:20** Infection | "The imposter infects by staying within 8 metres for 10 seconds. Nobody is told who. The crew only see these boxes fill up: when they reach the line, the imposters win." | B: long-press next to A's marker. When **Infect** is ready, tap it; long-press 25 m away. (Short of time? In **A**'s DevTools console, the host's, `__afterdarkActions.devAdvanceClock(70)` skips the 60 s cooldown or the 60 s incubation; it works on `?sim=1` pages in test mode.) Point at A's infection boxes filling. Optional: B taps **Task Stop** and A shows SYSTEMS JAMMED. |
| **2:20–2:45** Meeting | "Anyone can call one emergency meeting. Every phone alarms, everyone walks to the Base, talks, and votes on their phones." | A: **Meeting** → confirm. Show the alarm, then **Show the map** (the way to the Base). Long-press both windows onto the Base. If the bots are still walking, say so and move on. |
| **2:45–3:00** Results | "At the end everyone sees who was who, the score over time, awards, and a timeline of what happened, then plays again with one tap." | Switch to window C (the dry run's results): the flipping role cards, the chart, the timeline. Tap nothing. |

## If something goes wrong
| Problem | Do this |
|---|---|
| Render is slow or down | Switch to the local server: `pnpm dev` and `http://127.0.0.1:5173/?sim=1` in both windows. Same script. |
| No network at all | The local server needs none once installed. Without the map tiles the area is drawn on a dark background: keep going. |
| Neither window is the imposter | Present the crew side; for the infection beat, show window C's timeline ("Host became infected") instead. |
| The bots are slow to reach the Base | Narrate over the meeting map; skip straight to the results in window C. |
| A long dead moment | Play the 60-second trailer (<https://www.youtube.com/watch?v=jajMJy-C4BI>), or a 30-second screen recording of a full game from the dry run (record it with the OS screen recorder). |

## Useful facts if judges ask
- **Trailer:** a 60-second trailer is on YouTube (<https://www.youtube.com/watch?v=jajMJy-C4BI>). Play it before the demo, or as the fallback if the live game fails.
- **Server-authoritative:** every rule, timer, roll and win check runs on the server. The client only draws and sends intents. Each phone gets its own view built from an allow-list, so a crew phone never receives who is infected, not even in the raw network traffic (tested on every build).
- **Safety:** "Stop somewhere safe" before every puzzle, never "run" in the copy (a test enforces it), no-go zones, and players can report an unsafe spot.
- **Privacy:** positions live in server memory only, are never logged, and vanish with the lobby. No accounts.
- **Scale:** one free Render instance; the Phase 14 load test ran 20 lobbies of 8 bots (see PROGRESS.md).
- **Built with Claude Code:** 15 phases, one per session, with tests at every step (1100+ unit and integration tests, 30+ Playwright specs).
