# SuperLaser FF App

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
- **Substack** — needs `SUBSTACK_FEEDS`, a comma-separated list of the
  publications' RSS feed URLs (`https://<publication>.substack.com/feed`).
  Substack has no public search API, so the app pulls each publication's
  feed directly and filters posts whose title/description mention the
  topic. Add the specific publications you follow.
- **Mastodon** — works out of the box against `https://mastodon.social`
  (or set `MASTODON_INSTANCE` to your home instance) by matching the topic
  as a hashtag against that instance's public timeline. Set
  `MASTODON_ACCESS_TOKEN` (create one under Settings → Development on your
  instance) to instead use full-text search, which works for multi-word
  topics too and isn't limited to hashtags.

### How it's built

No frameworks or npm dependencies — a small Node `http` server
(`src/server.js`) serves the static UI in `public/` and a JSON endpoint,
`GET /api/feed?topic=...&sources=x,substack,mastodon`, that fans out to
`src/sources/{x,substack,mastodon}.js` in parallel, normalizes each
platform's response into `{ source, author, text, url, publishedAt }`, and
returns everything merged and sorted by time.

### Limitations to know about

- X's search API is paid and rate-limited; heavy topic-switching can burn
  through your monthly quota fast.
- Substack filtering only sees the publications you list — it can't
  discover new ones for a topic, since there's no Substack-wide search API.
- Mastodon's federated network means a single instance's timeline/search
  only sees what that instance knows about, not all of Mastodon.

## NGS data script

`scripts/fetch-ngs.js` downloads Next Gen Stats CSVs from nflverse. See the
script header for usage; it runs on a weekly schedule via
`.github/workflows/fetch-ngs.yml`.
