# Heiken-sports — StreamSports99 API Docs

A dark-themed, fully static **API Docs page** for StreamSports99, the sports-streaming site powered by the [cdnlivetv.is](https://cdnlivetv.is) real-time sports data API — with a **working stream player demo** (custom controls + a buffering strategy tuned for live sport), **smart-TV browser support**, and an **Android app** (Android 6.0+ / Android TV).

Built with **plain HTML + CSS + vanilla JavaScript**. No build step, no framework. The only vendored dependency is [hls.js](https://github.com/video-dev/hls.js) (`js/vendor/hls.min.js`) for HLS playback in MSE browsers.

## Run it

Any static file server works, e.g.:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## What's on the page

- **Header** — sticky nav with mobile hamburger menu, sign-in / register actions
- **Sports category bar** — 21 sports with event counts; each chip deep-links to its matching free API endpoint below
- **Hero** — platform intro with live stats (600+ channels, 26 free endpoints, since 2018)
- **What is cdnlivetv.is?** — platform overview + 4 feature cards
- **Sports Coverage** — 18 covered sports
- **How It Works** — 3-step integration guide (fetch → process → embed)
- **Stream Player Demo** — a real, embeddable player (see below)
- **Free API Endpoints (26)** — every free endpoint with its full URL, one-click **copy** button, direct **open** link, and a live **filter** box
- **API Response Formats** — key differences, format ↔ sports table, and syntax-highlighted JSON examples for both the *Team vs Team* and *Event-Based* formats
- **Support** — contact card with copy-to-clipboard email
- **Footer** — full sitemap with event counts, hosting disclaimer, and keyboard-shortcuts dialog
- **Ad placements** — two placeholder ad slots + a Musiqly sponsored card, repeated three times down the page

## The stream player (`#player`)

A production-style demo of "Step 3: Embed Streams".

**Playback engines**

- HLS (`.m3u8`) via vendored **hls.js 1.7** in MSE browsers (Chrome, Edge, Firefox…)
- Native HLS fallback in Safari, native video for `.mp4`/`.webm`
- Paste any custom stream URL — including ones returned by the free API endpoints — into the side panel

**Video controls**

- Play/pause, seek bar with **buffered-range visualization**, volume slider + mute
- Quality menu (Auto/adaptive + every rendition with bitrate), playback speed for VOD
- LIVE badge with **GO LIVE** catch-up button when behind the live edge
- Picture-in-Picture, fullscreen (player chrome stays visible in fullscreen)
- Auto-hiding control bar, buffering spinner, autoplay-blocked → muted playback with "tap to unmute"

**Buffering strategy ("good buffers")**

- Up to **120s forward buffer** (profile-switchable at runtime: Smooth 120s / Balanced 60s / Data-saver 24s) with a 120 MB memory cap
- Generous segment retry policy (8 retries, exponential backoff) at the fragment level
- **Stall watchdog** — detects ~2s freezes and nudges playback / returns to the live edge
- Auto-reconnect with exponential backoff on fatal network errors, `recoverMediaError()` recovery on media errors
- `capLevelToPlayerSize`, `startFragPrefetch`, ABR with sane starting estimate
- Live **buffer-health pill** in the control bar (green/amber/red) and a stats overlay (resolution, bitrate, buffer ahead/behind, dropped frames, live latency, retries, stall recoveries)

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `/` | Focus the endpoint filter |
| `?` | Toggle the shortcuts dialog |
| `Esc` | Close dialog / clear filter |
| `T` | Back to top |
| `E` | Jump to endpoints |
| `F` | Jump to response formats |
| `C` | Jump to support |
| `P` | Jump to the player demo |
| `Ctrl`+`D` | Bookmark this site |

With the **player focused**: `Space` play/pause · `←`/`→` seek 10s · `↑`/`↓` volume · `M` mute · `F` fullscreen · `I` stats

## Smart TV / old-browser compatibility

The site runs on smart-TV browsers and old Android WebView engines:

- **D-pad spatial navigation** (`js/main.js`) — arrow keys move focus to the nearest focusable element, ENTER activates; sliders/inputs keep native arrow behaviour
- **TV mode** (`html.tv`) — overscan-safe margins, larger fonts and hit targets, always-visible player controls, unmissable focus ring. Auto-detected from the UA (Android TV, Fire TV `AFT*`, BRAVIA, WebOS, NetCast, HbbTV, …)
- **Engine fallbacks** (`css/compat.css`) — flexbox-`gap` margin fallbacks (`.no-flexgap`), non-grid layouts for Chromium < 57 (`.no-grid`), literal-colour emergency skin for engines without CSS custom properties (`.no-cssvars`), `aspect-ratio`/`clamp()`/`inset` fallbacks, and `padStart`/`closest` polyfills
- Practical baseline: **Chromium 49+** (Android 6.0.1 with an updated WebView), fully featured at Chromium 84+

## Android app (Android 6.0+ / Android TV)

A ~1 MB WebView wrapper in [`android/`](android/) — leanback launcher banner, D-pad support, HTML5 fullscreen video, autoplay enabled, offline fallback to the bundled copy of the site, crash recovery. See **[android/README.md](android/README.md)** for building the APK (GitHub Actions does it automatically — no local tools needed) and sideloading onto a TV.

## Structure

```
index.html            # the page (all content)
css/styles.css        # dark sports-streaming theme + player UI
css/compat.css        # TV mode + legacy-engine fallbacks (no-flexgap/no-grid/no-cssvars)
js/main.js            # endpoints, filter, JSON highlighting, shortcuts, TV detection, D-pad spatial nav
js/player.js          # stream player: controls, HLS engine, buffering & recovery
js/vendor/hls.min.js  # hls.js 1.7.2 (vendored, no CDN needed)
scripts/              # icon/banner generator + Android asset sync
android/              # WebView app (Android 6.0+ / Android TV) — see android/README.md
android/ci-workflow-reference.yml  # GitHub Actions APK build (copy to .github/workflows/ to activate)
```

> Note: nav/footer links to pages other than API Docs (Schedule, Sports News, Premium, …) show a "not part of this build" toast — only the API Docs page was in scope. Demo streams in the player are public test feeds (Mux, Unified Streaming, Apple, Akamai, Google); the cdnlivetv.is API itself was unreachable from the build environment, so its data is represented exactly as documented.
