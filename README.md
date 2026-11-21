# Khatm Circle: a group Quran khatm in one link

Free at **https://pb-khatm-circle.pages.dev**. An organiser picks what the khatm is for (in memory of someone, for someone
who is ill, Ramadan, an occasion, a regular circle), an optional finish date and message, and shares one link in the
WhatsApp group. People open it, type a name, tap a juz to take it, and tap "I've read it". No accounts, no app, no ads.

- 30-juz grid (free / being read / read), each juz linked to Quran.com; "Your juz" card with Read / I've read it / give back.
- Claims are first-come ("Yusuf just took Juz 7"). Juz taken more than 3 days ago and not read are marked.
- Organiser: add a juz for someone not on the link (optionally already read), mark read for someone, free a juz, edit, delete,
  start the next round on the same link (round history kept).
- "Copy as a list": the numbered WhatsApp list people already post, with names and ✅.
- Completion card + 1080×1080 result card to share; link preview with live state ("18 of 30 juz taken · 9 read · 12 still free").
- Group dhikr mode: shared counter towards a target, tap counter kept on the phone, quick +33/+100/+313/+1000, latest feed, undo.
- Personal link (`#k=` token) to use the same identity on another device. Live updates by polling a version every 10 s.

## Stack
Cloudflare Pages (static `public/`) + Pages Functions (`functions/`). Data lives in **one SQLite-backed Durable Object**
in the Worker `pb-khatm-circle-db` (`worker/`), because the account is at the free plan's 10 D1 databases.
`worker/index.js` wraps the object's SQL storage in a small D1-style shim, so `worker/api.js` is plain SQL.
Rate limits per IP hash (create 20/h, join 60/h, writes 600/h). A khatm is deleted 400 days after its last activity.

## Develop
```
npx -y pnpm@9 install
(cd worker && npx wrangler dev --port 8791 --ip 127.0.0.1 --persist-to ../.wrangler/state) &
npx wrangler pages dev --port 8790 --ip 127.0.0.1 --persist-to .wrangler/state
npm run test:unit
BASE=http://127.0.0.1:8790 node tests/e2e/run.mjs     # real Chromium, several browser contexts, screenshots in shots/
node tools/render-images.mjs                           # og.png + icons
```

## Deploy
```
set -a; . ../../.env; set +a
(cd worker && npx wrangler deploy)        # only when worker/ changed
npx wrangler pages deploy --branch main
BASE=https://pb-khatm-circle.pages.dev node tests/e2e/run.mjs   # deletes its own khatms
```
Product, support and privacy page: `docs/` on GitHub Pages.
