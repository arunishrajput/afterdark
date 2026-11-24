# AfterDark trailer

A 60-second, 1080p, 30 fps cinematic trailer built with [Remotion](https://www.remotion.dev). **Published:** <https://www.youtube.com/watch?v=U6HoX-31tbk>. Standalone project: it is not part of the pnpm workspace and is ignored by ESLint and Prettier, so `pnpm verify` never sees it.

**Video:** `out/afterdark-trailer.mp4` · **Thumbnail:** `out/afterdark-thumbnail.jpg` (1280×720). Both are git-ignored; re-render with the commands below. Upload copy is in [YOUTUBE.md](YOUTUBE.md).

## How it is built
- `src/cine/timeline.json` is the edit: every scene's start and end, shared by the picture and the score. Scene boundaries sit on beats of the 120 BPM score.
- `src/cine/Cine.tsx` lays the scenes on the timeline. `act1.tsx` (map reveal, lineup, role reveal), `act2.tsx` (scatter, navigation, the imposter's tools), `games.tsx` (live minigames), `act3.tsx` (meeting, vote, ejection, montage, title and call to action).
- `src/cine/CityMap.tsx` is the map: a baked base image plus vector streets that draw themselves, a 3D camera, and projected players, light trails and pins.
- `src/cine/actors.tsx` has the crewmate character and the phone with the app's UI. `fx.tsx` is the film layer: grain, light leaks, anamorphic flares, whip pans with motion blur, glitches and title cards.
- `prep/build_map.py` turns `prep/osm-connaught-place.json` (OpenStreetMap data, © OpenStreetMap contributors, ODbL) into `public/map/base.png` and `src/data/map.json`, including the walking routes.
- `audio/make-music.mjs` synthesises the score and places every sound effect on the frame of its picture event. It writes `public/music.wav` (git-ignored, deterministic).
- `src/Thumbnail.tsx` is the YouTube thumbnail. `capture/` is the Playwright rig that captured `public/footage/host-game.png` from the real game (the phone map in two shots).

## Commands (run inside `trailer/`)
```bash
npm install --ignore-workspace
node audio/make-music.mjs                      # the score → public/music.wav (needed before a render)
npx remotion studio src/index.ts               # live preview
npx remotion render src/index.ts Trailer out/afterdark-trailer.mp4 --codec=h264 --crf=15 --audio-codec=aac --audio-bitrate=320k
npx remotion still src/index.ts Thumbnail out/afterdark-thumbnail.jpg --image-format=jpeg --jpeg-quality=92 --scale=0.66667
node prep/stills.mjs /tmp/sheet.png 1.5 12.3 21.6   # chosen seconds → one contact sheet, for review
python3 -I prep/build_map.py                   # only if the map data or routes change
```
If Remotion's own browser download fails, add `--browser-executable=<path to a chrome-headless-shell>` (Playwright's works; `prep/stills.mjs` reads the path from `/tmp/bx.txt`). A full render takes about 10 minutes on an M-series Mac.
