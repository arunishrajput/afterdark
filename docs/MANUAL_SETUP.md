# Manual Steps for the Human

Claude Code does everything it can by itself. This file lists the few things only **you** can do: logins, phone settings, walking outside and accounts. Each step is tagged with the phase that needs it, and Claude will remind you at the end of that phase.

> **Tip:** to run a command inside the Claude Code session so its output lands in the chat, type `!` and then the command, for example `! gh auth status`.

## Already done (checked on 2026-11-23)
- ✅ Node v26.8.2, pnpm 11.21, git 2.54, GitHub CLI 2.98 are installed.
- ✅ `gh` is logged in to github.com, with the `repo` and `workflow` scopes.
- ✅ git `user.name` and `user.email` are set.
- ✅ `cloudflared` and `ngrok` are installed (used for HTTPS on phones).

---

## Phase 0: project setup
1. **Answer Claude's questions** about the GitHub repo name (suggested: `afterdark`) and visibility (public or private).
2. **Approve tool permissions** when Claude Code asks (`pnpm`, `git`, `gh`, and Playwright's browser download).
3. If a step fails because `gh` has logged out, run:
   ```
   ! gh auth login
   ```
   Choose **GitHub.com → HTTPS → Login with a web browser**, enter the one-time code in the browser, then tell Claude "done".

## Phase 2 onward: testing on your real phone (optional but recommended)
Phone browsers only allow GPS on **HTTPS** pages. A tunnel gives your laptop's dev server an HTTPS address.
1. With `pnpm dev` running (Claude starts it), run:
   ```
   ! pnpm tunnel
   ```
   Copy the `https://….trycloudflare.com` URL it prints.
2. Open that URL on your phone.
3. **iPhone (Safari):**
   - Settings → Privacy & Security → Location Services → **On**.
   - Settings → Privacy & Security → Location Services → **Safari Websites** → **While Using the App**, and turn **Precise Location** on.
   - When the page asks, tap **Allow**.
   - Turn off Low Power Mode during play, and keep the screen on (the app requests this automatically).
4. **Android (Chrome):**
   - Settings → Location → **On**, and **Use precise location** on (Google Location Accuracy).
   - In Chrome: ⋮ → Settings → Site settings → Location → allow for the tunnel URL.
   - Turn off Battery Saver for Chrome during play.
5. The tunnel URL changes every time you restart it.

## Phase 6: deployment on Render (free)
1. Go to <https://render.com> and **sign up with GitHub**.
2. Allow Render to access the AfterDark repository (all repositories, or just this one).
3. In the Render dashboard: **New → Blueprint** → choose the AfterDark repo → Render reads `render.yaml` (Claude created it) → **Apply**.
4. Wait for the first deploy (about 3–5 min). Copy the service URL (`https://afterdark-xxxx.onrender.com`) and paste it into the chat for Claude. Claude records it in PROGRESS.md and runs the smoke test.
5. Every push to `main` now redeploys automatically.
6. **Free-tier note:** the service sleeps after about 15 minutes idle and the first load then takes about 50 s. Before a demo, open the URL a minute early (or upgrade to the Starter plan).
7. Optional: Settings → Custom Domain if you own a domain.

## Phase 6 onward: field test (after each big feature)
Follow the checklist in [TESTING.md §6](TESTING.md#6-field-test-checklist-the-human-runs-this-from-phase-6) with at least 2 phones outdoors. Paste your notes into PROGRESS.md → **Field-test notes**. Mark anything that blocks play with 🔴. The next session fixes 🔴 items first.

## Phase 14: demo day
1. Warm the Render service 2 minutes before the demo.
2. For an indoor demo: create the lobby with **Test mode** on, run `! pnpm bots -- --url <render-url> --code <CODE> --count 6`, and present from one phone plus a projector (laptop browser).
3. For a live outdoor demo: do a 5-minute dry run in the area first, and draw the boundary around open, safe ground.
