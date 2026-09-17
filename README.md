# SuperLaser Social App

## Topic feed aggregator

Pulls posts from X, Substack, and Mastodon that match a topic you choose, and
shows them merged into a single chronological feed in the browser.

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
  The "Substack category" dropdown above the main search box lists every
  category currently in use (from both `.env` and Following) and narrows
  the Substack side of a search to just that tag — X and Mastodon results
  are unaffected by it.
- **Mastodon** — works out of the box against `https://mastodon.social`
  (or set `MASTODON_INSTANCE` to your home instance) by matching the topic
  as a hashtag against that instance's public timeline. Set
  `MASTODON_ACCESS_TOKEN` (create one under Settings → Development on your
  instance) to instead use full-text search, which works for multi-word
  topics too and isn't limited to hashtags.

### How it's built

No frameworks or npm dependencies — a small Node `http` server
(`src/server.js`) serves the static UI in `public/` and a JSON endpoint,
`GET /api/feed?topic=...&sources=x,substack,mastodon&category=...`, that
fans out to `src/sources/{x,substack,mastodon}.js` in parallel, normalizes
each platform's response into `{ source, author, text, url, publishedAt }`,
and returns everything merged and sorted by time. `category` only affects
the Substack fetcher, narrowing its feed list to that tag before searching.

Substack discovery is separate: `GET /api/substack/discover?topic=...`
(`src/sources/substackDiscover.js`) and the follow/unfollow endpoints at
`/api/substack/following` (`src/substackStore.js`) manage the persisted
list that `src/sources/substack.js` reads from alongside `SUBSTACK_FEEDS`.
`GET /api/substack/categories` lists every distinct category tag in use
across both, for the dropdown.

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

### Other limitations to know about

- X's search API is paid and rate-limited; heavy topic-switching can burn
  through your monthly quota fast.
- Mastodon's federated network means a single instance's timeline/search
  only sees what that instance knows about, not all of Mastodon.

## NGS data script

`scripts/fetch-ngs.js` downloads Next Gen Stats CSVs from nflverse. See the
script header for usage; it runs on a weekly schedule via
`.github/workflows/fetch-ngs.yml`.
