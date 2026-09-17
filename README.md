# SuperLaser Social App

## Topic feed aggregator

Pulls posts from X, Substack, Mastodon, Reddit, and arXiv that match a topic
you choose, and shows them merged into a single chronological feed in the
browser.

### Run it

```
npm start
```

Then open http://localhost:3000, type a topic, and search. Each source
reports its own status (result count, or why it was skipped) in the bar
above the results, so a missing/expired credential on one source never
blocks the others.

### Configure sources

Copy `.env.example` to `.env` and fill in what you have — nothing is
required to run the app, but a source with no credentials configured is
skipped:

- **X (Twitter)** — needs `TWITTER_BEARER_TOKEN` from a developer app at
  https://developer.x.com. Search access on the X API is a paid tier;
  there's no free or reliable scraping alternative, so this is the one
  source that costs money to enable. Recent search only covers the last
  ~7 days.
- **Substack** — has two ways to build the list of publications it reads
  from, and both can be used together:
  - `SUBSTACK_FEEDS` in `.env`, a comma-separated list of feed URLs
    (`https://<publication>.substack.com/feed`), for publications you
    already know you want.
  - The **Discover** panel in the UI (click "Substack: discover writers by
    topic"): search a topic, and any matching publications found get a
    "+ Keep" button. Keeping one saves it to `data/substack-feeds.json`
    (git-ignored) so it's included in every future topic search, and you
    can remove it again from the Following list. This is the only way to
    find *new* publications by topic rather than ones you already follow —
    see the note below on how it works.

  Any feed, from either source, can carry a **category** tag — a way to
  scope a search to a set of publications instead of always searching all
  of them. In `SUBSTACK_FEEDS`, prefix an entry with `category=`, e.g.
  `poetry=https://example.substack.com/feed`; an entry with no `category=`
  prefix has no category and is only searched when no category filter is
  applied. When following a publication from Discover, fill in the
  "Category tag" field before clicking "+ Keep" to tag it the same way.
  The "Category" dropdown above the main search box lists every category
  currently in use (from `.env` and Following, for both Substack and
  Reddit — see below) and narrows their feed lists to just that tag; X,
  Mastodon, and arXiv results are unaffected by it, since all three already
  do real full-text search and have no "which sources" problem to solve.
- **Mastodon** — works out of the box against `https://mastodon.social`
  (or set `MASTODON_INSTANCE` to your home instance) by matching the topic
  as a hashtag against that instance's public timeline. Set
  `MASTODON_ACCESS_TOKEN` (create one under Settings → Development on your
  instance) to instead use full-text search, which works for multi-word
  topics too and isn't limited to hashtags.
- **Reddit** — works out of the box with no key, using Reddit's public
  search (site-wide by default). Optionally tag specific subreddits with a
  category in `REDDIT_SUBREDDITS` (same `category=value` format as
  `SUBSTACK_FEEDS`), so selecting that category restricts the search to
  just those subreddits instead of all of Reddit. Reddit tightened API
  terms in 2023 for commercial/high-volume use — this uses the public JSON
  endpoints, which is fine for personal use but isn't a guaranteed-forever
  arrangement the way a real API key would be.
- **arXiv** — needs no configuration at all; it's a genuinely free,
  unlimited, no-key official API, the one source here with zero setup
  friction. Best fit for the math/science category, though it isn't
  scoped by the category filter — arXiv already does full-text search on
  its own, same reasoning as X and Mastodon above.

### How it's built

No frameworks or npm dependencies — a small Node `http` server
(`src/server.js`) serves the static UI in `public/` and a JSON endpoint,
`GET /api/feed?topic=...&sources=x,substack,mastodon,reddit,arxiv&category=...`,
that fans out to `src/sources/{x,substack,mastodon,reddit,arxiv}.js` in
parallel, normalizes each platform's response into
`{ source, author, text, url, publishedAt }`, and returns everything
merged and sorted by time. `category` only affects Substack and Reddit,
narrowing their feed/subreddit lists to that tag before searching.
`src/xml.js` holds the shared RSS/Atom parsing helpers Substack and arXiv
both use.

Substack discovery is separate: `GET /api/substack/discover?topic=...`
(`src/sources/substackDiscover.js`) and the follow/unfollow endpoints at
`/api/substack/following` (`src/substackStore.js`) manage the persisted
list that `src/sources/substack.js` reads from alongside `SUBSTACK_FEEDS`.
`GET /api/categories` lists every distinct category tag in use across
Substack and Reddit, for the dropdown.

### A note on Substack discovery specifically

Substack has no official, documented search API — full stop. The Discover
panel works by calling the same internal endpoint Substack's own website
uses for its search box. That's the only way to search Substack by topic
without already knowing which publications to look at, but it comes with
real caveats:

- It's undocumented. Substack can change its shape, rate-limit it, or block
  it outright at any time, with no notice and no changelog to check.
- The parser is written defensively (it scans the response for
  publication-shaped data rather than assuming one exact JSON structure) so
  minor changes shouldn't break it, but a bigger change might make it
  return nothing until the code is updated.
- If it stops working, `SUBSTACK_FEEDS` in `.env` still works as a manual
  fallback — it only depends on Substack's public RSS feeds, which are a
  stable, documented feature.

### Install it on your phone (PWA)

The app is a Progressive Web App — run it as usual (`npm start`), open it
in your phone's browser (same network as the machine running it), then:

- **Android/Chrome**: use the browser menu → "Add to Home Screen" (or the
  install prompt Chrome shows automatically).
- **iOS/Safari**: tap the Share icon → "Add to Home Screen".

It then opens full-screen with its own icon, no browser chrome. This is
the same server and code as the desktop version — no separate mobile
build. The app shell (the page itself, not live feed data) is cached by a
service worker (`public/sw.js`) so it still opens instantly offline; the
feed itself still needs a network connection since it's live data.

Icons live in `public/icons/`, generated by `scripts/generate-icons.mjs`
(zero image-library dependencies — a minimal hand-rolled PNG encoder).
Re-run it if you ever change the icon design.

### Other limitations to know about

- X's search API is paid and rate-limited; heavy topic-switching can burn
  through your monthly quota fast.
- Mastodon's federated network means a single instance's timeline/search
  only sees what that instance knows about, not all of Mastodon.
- Reddit's public JSON endpoints work without a key for personal use today,
  but aren't a documented, versioned API the way arXiv's is — treat it as
  the least stable of the free sources long-term.

## NGS data script

`scripts/fetch-ngs.js` downloads Next Gen Stats CSVs from nflverse. See the
script header for usage; it runs on a weekly schedule via
`.github/workflows/fetch-ngs.yml`.
