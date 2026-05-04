This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Private Font Awesome Packages

This project uses `@fortawesome/pro-solid-svg-icons`, which is a private package.

- The repo `.npmrc` is configured to read the token from `FONTAWESOME_NPM_AUTH_TOKEN`.
- Do not commit raw auth tokens to git.
- For local dev, set the env var in your shell.
- For deploys (e.g. Vercel), add `FONTAWESOME_NPM_AUTH_TOKEN` in project Environment Variables.

## Analytics (Google Analytics 4)

Analytics is optional and only enabled when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set.

### Setup

1. Create a GA4 Web Data Stream and copy the Measurement ID (format: `G-XXXXXXXXXX`).
2. Add this to your environment:

   ```bash
   NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
   ```

3. Restart the app and verify traffic in GA4 Realtime.
4. (Optional) For ad-hoc debugging, append `?gtm_debug=x` to the URL or use the
   GA4 DebugView in Admin → DebugView.

If `NEXT_PUBLIC_GA_MEASUREMENT_ID` is not present, no analytics script is loaded
and every `track*` helper is a silent no-op.

### Identity model

We never collect PII. Each browser is assigned an anonymous `client_id` (UUID,
stored in `localStorage` under `kglw.analytics.clientId.v1`) and a rolling
`session_id` that rotates after 30 minutes of inactivity (matching GA4's
default session window). Both are sent on every event so you can build
per-user funnels and retention reports in GA4 without identifying anyone.

### Events emitted

All events are GA4 custom events. Names are stable; add or rename them in
[`utils/analytics.ts`](utils/analytics.ts) only.

| Event | Params (besides `client_id`/`session_id`) | Source |
| --- | --- | --- |
| `page_view` | `page_path`, `page_location` | route changes |
| `nav_click` | `label`, `href` | bottom nav tabs |
| `play_track` | `song_title`, `show_key`, `show_date`, `venue`, `track_url`, `playlist_id`, `playlist_name`, `playlist_source`, `source` | audio element actually starts producing sound |
| `pause_track` | playback context + `position_seconds` | explicit pause button |
| `track_complete` | playback context + `duration_seconds`, `percent_listened=100` | audio `ended` event |
| `track_skip` | playback context + `direction` (`next`/`prev`/`stop`/`auto`), `position_seconds`, `duration_seconds`, `percent_listened` | next/prev/stop pressed |
| `seek_track` | playback context + `from_seconds`, `to_seconds`, `delta_seconds` | scrubber drag (throttled to 1/750ms) |
| `next_version` | playback context | merge/forward variant button |
| `love_song` | playback context | heart button in song sheet |
| `share_song` | playback context + `result` (`copied`/`error`) | share button in song sheet |
| `open_song_sheet` | playback context | ⋮ button on player bar |
| `open_queue_sheet` | playback context + `queue_length` | queue icon |
| `playlist_create` | `playlist_name`, `playlist_source` | user creates a playlist (prebuilt seeders excluded) |
| `playlist_delete` | `playlist_name`, `playlist_source`, `slot_count` | playlist deleted |
| `playlist_rename` | `playlist_id`, `playlist_from`, `playlist_to` | playlist renamed |
| `playlist_duplicate` | `playlist_from`, `playlist_to` | "duplicate" action |
| `track_add_to_playlist` | `playlist_name`, `playlist_source`, `song_title`, `show_key`, `result` (`added`/`fused`/`exists`) | user playlist gains a track or variant |
| `track_remove_from_playlist` | `playlist_name` | user removes a slot |
| `slot_variants_set` | `playlist_name`, `variant_count` | variants explicitly reordered/replaced |
| `chain_create` | `playlist_name`, `chain_length` | user chains 2+ slots |
| `chain_remove` | `playlist_name` | user unchains a group |

### Recommended GA4 setup

In **Admin → Data display → Custom definitions**, register these as
**event-scoped custom dimensions** so they're queryable in Explorations and
Looker Studio:

| Dimension name | Event parameter |
| --- | --- |
| Song Title | `song_title` |
| Show Key | `show_key` |
| Show Date | `show_date` |
| Venue | `venue` |
| Playlist Name | `playlist_name` |
| Playlist Source | `playlist_source` |
| Skip Direction | `direction` |
| Add Result | `result` |
| Client ID (App) | `client_id` |
| Session ID (App) | `session_id` |

Register `percent_listened`, `duration_seconds`, `position_seconds`,
`chain_length`, `slot_count`, `variant_count`, and `queue_length` as
**event-scoped custom metrics** to chart distributions.

### Mark conversions

In GA4 → Admin → Events, toggle "Mark as conversion" for the high-signal
events: `playlist_create`, `track_add_to_playlist`, `chain_create`,
`love_song`, `track_complete`.

### Suggested explorations / dashboards

- **Most played songs**: `play_track` count by `song_title`.
- **Most played shows**: `play_track` count by `show_key` (date + venue).
- **Listen-rate distribution**: average of `percent_listened` on `track_skip`
  + share of `track_complete` vs `track_skip` per `song_title`.
- **Playlist funnel**: `view_song` → `track_add_to_playlist` → `play_track`
  with `playlist_id` set, grouped by `client_id`.
- **Songs most added to playlists**: `track_add_to_playlist` count by
  `song_title` filtered to `result != exists`.
- **Chains created**: count of `chain_create` per session, plus distribution
  of `chain_length`.
- **Bounce / engagement**: GA4's built-in **Engagement → Pages and screens**
  report uses our `page_view` events; "Engaged sessions / session" is the
  inverse of bounce rate.
- **Web Vitals**: enable **Enhanced Measurement** on the GA4 stream — it
  auto-collects scroll depth, outbound clicks, file downloads, and Core Web
  Vitals without any extra code.

### Privacy

- No personal data is collected.
- The anonymous `client_id` lives in `localStorage`; clearing site data
  resets it.
- The whole pipeline is gated behind `NEXT_PUBLIC_GA_MEASUREMENT_ID` so
  staging or local builds run with zero tracking by default.

