# LinkedIn launch post

The collaborative LinkedIn post announcing AfterDark after the Code N Mode hackathon (organised by 32 BIT, the game dev club of SIT), published on 2026-11-25.

| File | What it is |
|---|---|
| `post.txt` | The post text (about 1,800 characters; LinkedIn's limit is 3,000). Written as "we" so it reads right from every co-author's profile. |
| `first-comment.txt` | The links, posted as the first comment: the trailer, the live game and the source code. |
| `images/AfterDark-carousel.pdf` | The 5 slides as a swipeable document post. |
| `images/01-cover.png` … `05-trailer.png` | The same slides as 1080 × 1350 images. |
| `_source/` | `slides.html` (the slides, in the app's and the trailer's look), `render.mjs` (renders the PNGs and the PDF) and the frames they use (trailer stills, app screenshots, the logo). |

## Re-render the slides
From the repository root, after `pnpm install` (it uses the repo's Playwright Chromium):
```bash
node marketing/linkedin/_source/render.mjs
```

## Posting checklist (for a repost or a new platform)
1. Tag the organiser: type `@32 BIT` where the text names them and pick their page.
2. Attach `images/AfterDark-carousel.pdf` (**+** → **Add a document**, title `AfterDark: Among Us for the real world`), or the five PNGs in order.
3. Publish, then post `first-comment.txt` as the first comment: posts with links in the body tend to reach fewer people.
4. Reply to comments in the first hour.

## Alt text for the images
1. AfterDark logo over a neon night map of a city, with players' light trails and task pins. Text: "We built Among Us for the real world."
2. Three stills: players and task pins on a real map, an imposter infecting a player, and the "Emergency meeting" alarm.
3. Three phones running AfterDark: the secret Crew role card, the map with task cards, and "Systems jammed".
4. Stats: 1,140 automated tests, 0 secrets leaked, 100% server-decided, 20 games of 8 players load-tested, real GPS with safety checks.
5. The trailer thumbnail with a play button, and the play link afterdark-24gx.onrender.com.

## Other opening lines
- "Among Us, but the map is our city and the imposters are standing right next to you."
- "What if the imposter wasn't on your screen, but standing next to you?"
- "We turned a city into a game board for 8 players and 2 liars."
