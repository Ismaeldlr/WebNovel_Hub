# Contributing

Bug reports, site requests and pull requests are welcome. For anything bigger than a small
fix, please open an issue first so we can agree on the approach.

## Setup

You need [Node.js](https://nodejs.org) 22.12 or newer.

```bash
npm install
npm run dev
```

This starts the interface at <http://localhost:5173> and a small local server that runs the
app's core on Node, with its database in `data/dev.db`. Most work (the interface, the library
logic, the scrapers) can be done this way, without building the Windows or Android app.

Sites that need the app's own browser window (Ranobes, and WTR Lab's sign-in) only work in the
Windows and Android apps.

### Windows app

Install [Rust](https://www.rust-lang.org/tools/install) and the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), then:

```bash
npm run dev:desktop
```

`npm run build:desktop` builds the installer into `apps/desktop/src-tauri/target/release/bundle`.

### Android app

Install [Android Studio](https://developer.android.com/studio), then:

```bash
npm run sync --workspace @webnovel-hub/mobile
npm run open --workspace @webnovel-hub/mobile
```

`sync` builds the interface and copies it into the Android project; run it again after each
change. Android Studio then runs the app on a phone or an emulator.

## Commands

| Command                                 | What it does                                                       |
| --------------------------------------- | ------------------------------------------------------------------ |
| `npm run dev`                           | Interface and local server, for working in a browser.              |
| `npm run check`                         | Everything CI runs: lint, typecheck, tests and build.              |
| `npm test`                              | Unit tests (Vitest).                                               |
| `npm run lint`                          | ESLint and Prettier.                                               |
| `npm run format`                        | Formats every file with Prettier.                                  |
| `npm run scrape -- <novel URL>`         | Runs a site's adapter against the real site and prints the result. |
| `npm run scrape -- --samples [site...]` | The same, for one sample novel per site.                           |
| `npm run set-version -- 1.2.3`          | Sets the apps' version everywhere it is written.                   |

Please run `npm run check` before opening a pull request.

## Code layout

- `apps/web` is the interface, written once and run by every app.
- `packages/core` holds everything else: the SQLite schema and migrations, the library and
  reading logic, the jobs that import novels and fetch chapters, and the scrapers.
- `packages/platform-*` give the core what each app provides: SQLite, HTTP, files,
  notifications and a browser window.
- `apps/desktop` and `apps/mobile` wrap the interface in a Tauri window and an Android
  WebView.

## Adding a site

Each site is an adapter in `packages/core/src/scraper/adapters/<site>/`:

1. Copy an adapter for a similar site. Several sites built on the same theme share one adapter
   file (`madara/`, `novelfull/`, `readwn/`), where a new site is often a few lines.
2. Fill in the site's name, home page and hosts, and the methods that read a novel's details,
   its chapter list and a chapter's text. Keep CSS selectors in `selectors.ts`.
3. Register the adapter in `adapters/registry.ts`.
4. Add tests next to it, and check the real site with `npm run scrape -- <novel URL>`.

Adapters only read what a reader asks for, through the shared session, which keeps a delay
between requests to the same host. Adapters must not solve CAPTCHAs, disguise the app as
another browser, or get around logins and paywalls.

Tests that read saved copies of site pages skip themselves when those pages aren't present,
as in a fresh clone.

## Pull requests

- Keep each pull request to one change, and describe what it changes and why.
- Write commit messages in the imperative ("Add NovelBin", "Fix chapter order on Royal Road").
- New behaviour comes with tests.

## Releasing

A release is a pull request that changes the version:

1. Run `npm run set-version -- 1.2.3` and commit the result ("Webnovel Hub 1.2.3").
2. Optionally, give the pull request a `## Release notes` section: it opens the release's
   text, before the download instructions.
3. Merge it. The Release workflow tags the merge `v1.2.3`, builds the Windows installer and
   the Android APKs, and publishes them as the latest release, which installed apps offer as
   an update.

Pull requests that leave the version alone release nothing. If a release fails, fix the cause
and run the Release workflow by hand (Actions, Release, Run workflow) with the version.

The workflow needs the signing keys as repository secrets: `TAURI_SIGNING_PRIVATE_KEY` (the
updater key; `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` too if it has one), and the Android upload key
as `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and
`ANDROID_KEY_PASSWORD`. Keep the keys backed up privately: without them, installed apps can't
update.

## License

By contributing, you agree that your contributions are licensed under the project's
[license](LICENSE).
