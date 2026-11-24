# AfterDark trailer

A 60-second, 1080p, 30 fps trailer built with [Remotion](https://www.remotion.dev). Standalone project: it is not part of the pnpm workspace and is ignored by ESLint and Prettier.

**Final video:** `out/afterdark-trailer.mp4` (git-ignored; re-render to regenerate).

## How it is built
- `src/Trailer.tsx` is the timeline. Scene boundaries sit on 2 s bar lines of the 120 BPM soundtrack.
- `src/world.tsx` is the 3D night-city map (camera, projected markers, trails) and the crewmate character.
- `src/kit.tsx` has the shared motion bits (text slam, shockwave, shake, phone frame).
- `src/scenes/` has one file per act: `Map` (hook, arena), `Intro` (title), `Lineup`, `Tasks`, `Hunt`, `Meet`, `Ending`, `Finale` (end card).
- `audio/make-music.mjs` synthesises the soundtrack (`node audio/make-music.mjs`, then convert to `public/music.mp3` with ffmpeg).
- `capture/` records real gameplay screenshots with Playwright (only four are used, in `public/footage/`).

## Commands (run inside `trailer/`)
```bash
npm install --ignore-workspace
npx remotion studio src/index.ts          # live preview
npx remotion render src/index.ts Trailer out/afterdark-trailer.mp4 --codec=h264 --crf=16 --audio-codec=aac --audio-bitrate=320k
```
If Remotion's own browser download fails, add `--browser-executable=<path to a chrome-headless-shell>` (Playwright's works). A full render takes about 20 minutes.
