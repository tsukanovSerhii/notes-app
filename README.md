# NoteVoid

A local-first Markdown notes app: live preview, wiki links, folders and
tags, math and diagrams, version history, a command palette, light and dark
themes, English and Ukrainian, and optional end-to-end encrypted sync between
devices. Notes live in the browser (IndexedDB) and the app works offline; the
sync server is opt-in.

Built with **Next.js 16** (App Router + Route Handlers), **React 19**,
**TypeScript** (strict) and **Tailwind CSS 4**. No UI or state libraries. In
the browser: `react-markdown` with `remark-gfm`, `html2pdf.js`, and KaTeX and
Mermaid loaded only when a note needs them; on the server, `pg` when sync is
backed by Postgres. Encryption uses the built-in Web Crypto API.

![NoteVoid on desktop](docs/screenshot.png)

<details>
<summary>Mobile layout</summary>

<img src="docs/screenshot-mobile.png" alt="NoteVoid on a phone" width="320" />

</details>

---

## Features

**Writing**
- Live GFM preview (tables, task lists, strikethrough) with edit, split and
  preview-only modes.
- **Wiki links**: `[[Note title]]` or `[[Note title|text]]` opens that note,
  or creates it; each note lists the notes that link to it.
- **Math** with KaTeX (`$…$`, `$$…$$`) and **diagrams** with Mermaid
  (```` ```mermaid ````), both loaded only when a note uses them.
- **Version history**: earlier versions of each note are kept on the device
  every few minutes while editing, and any of them can be restored.
- **Syntax highlighting** for TypeScript/JavaScript, JSON, CSS, HTML, bash and
  Python, using an in-house tokenizer with no dependencies. Code blocks show
  their language and have a Copy button.
- Formatting toolbar and shortcuts. Native **Ctrl + Z** keeps working after
  toolbar actions. Enter continues or ends lists.
- Templates, a Markdown cheatsheet, and word count with reading time.

**Organizing**
- **Folders**: create, rename and delete them (deleting a folder keeps its
  notes) and filter the list by folder.
- **Tags**: chip input with suggestions; filter by tag; search also matches
  tags.
- Pinning, and full-text search that highlights matches and shows the text
  around them.
- **Drag and drop** notes onto a folder, out of folders, or into the trash;
  sort the list by last edit, creation or title.
- **Command palette** (`Ctrl/Cmd + Shift + P`, or `Ctrl/Cmd + K` outside the
  editor) to jump to any note or run any command.
- **Trash**: deleted notes wait 30 days, can be opened read-only, restored or
  deleted forever. The trash syncs, so a note deleted on one device can be
  restored on another.
- The list sorts by and shows the last **edit** of the text; pinning,
  tagging or moving a note does not count as editing it.

**Data**
- **IndexedDB storage** with one record per note, debounced incremental
  writes, a visible save status, and cross-tab updates via `BroadcastChannel`.
- **Import** `.md`/`.txt` files from the menu or by dropping them onto the
  window.
- **Backup**: download every note and folder as JSON, and restore it later,
  including notes deleted since the backup.
- **Export** a note as a PDF or a `.md` file.
- **Sync** (optional, **end-to-end encrypted**): turn it on, copy the sync
  key, paste it on another device. The server only ever sees ciphertext.
  Changes merge in both directions, and when two devices edit the same note
  between syncs **neither text is lost**: the overwritten one is kept as a
  note marked "conflict copy".

**Offline and security**
- **Installable PWA** that opens and works without a network after the first
  visit (service worker caches the app shell; notes are already local).
- **Nonce-based Content Security Policy** plus hardening headers, and a
  rate-limited sync endpoint.

**Quality**
- **Light and dark themes**, following the system by default, with no flash
  of the wrong theme on load.
- **English and Ukrainian**, chosen from the browser language or the menu,
  with correct plural forms.
- Responsive layout (the notes list is a drawer on phones). Semantic markup,
  labelled controls, focus rings, WCAG AA contrast, `prefers-reduced-motion`.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt + N` | New note (in the current folder) |
| `/` | Focus search |
| `Ctrl/Cmd + Shift + P` | Command palette (also `Ctrl/Cmd + K` outside the editor) |
| `Ctrl/Cmd + B`, `I`, `K` | Bold, italic, link |
| `Enter` in a list | Continue or end the list |
| `Esc` | Close menus and dialogs, clear search, close the drawer |

---

## Architecture

```
                 ┌──────────── browser ─────────────────────────────┐
 UI components ──► useNotes ──► notesStore ──► notesReducer (pure)  │
                 │                 │  ▲                            │
                 │                 │  └── BroadcastChannel (tabs)  │
                 │                 ▼                               │
                 │          NotesPersistence ── IndexedDB          │
                 │          (localStorage fallback)                │
                 │                                                 │
                 │  useSync ──► syncClient ── POST /api/sync ──────┼──► Route Handler
                 └─────────────────────────────────────────────────┘     └► mergeData ► SyncRepository
```

| Layer | File | Responsibility |
| --- | --- | --- |
| Model | [`app/types/note.ts`](app/types/note.ts) | `Note`, `Folder`, `Tombstones`, `NotesData` |
| Reducer | [`app/lib/notes/reducer.ts`](app/lib/notes/reducer.ts) | Pure transitions: notes, folders, tags, delete/undo, merge |
| Merge | [`app/lib/notes/merge.ts`](app/lib/notes/merge.ts) | Last-write-wins merge with tombstones, shared by client and server |
| Validation | [`app/lib/notes/storage.ts`](app/lib/notes/storage.ts) | Parses untrusted data (storage, backups, the API); reads legacy formats |
| Persistence | [`idb.ts`](app/lib/notes/idb.ts), [`persistence.ts`](app/lib/notes/persistence.ts) | IndexedDB with incremental writes, an unload journal and migration; localStorage and in-memory implementations |
| Store | [`app/lib/notes/store.ts`](app/lib/notes/store.ts) | Async hydration, dirty tracking, debounced saves, save status, cross-tab reloads |
| Sync | [`app/lib/sync/`](app/lib/sync/) | Client (debounce, no overlapping requests, offline and error states), server handler, file repository |
| API | [`app/api/sync/route.ts`](app/api/sync/route.ts) | Size limits and validation, then the shared handler |
| Highlighter | [`app/lib/highlight.ts`](app/lib/highlight.ts) | Sticky-regex tokenizer that returns tokens rendered as React spans |

### Design decisions

- **`useSyncExternalStore` instead of `useEffect` + `setState`.** Storage is
  an external system. A server snapshot plus a client snapshot avoids
  hydration mismatches and cascading renders.
- **The logic has no React and no DOM.** The reducer, merge, validation,
  highlighter, import parsing and the sync handler are plain functions. The
  store and the sync client get their persistence, clock, ID generator, timers
  and `fetch` injected. That is why 187 unit tests run in about 3 seconds with no
  browser.
- **IndexedDB with incremental writes.** The store diffs note references
  between states, collects the changed IDs, and writes only those records plus
  a small metadata record, so typing in one note does not re-serialize the
  whole collection. Writes are debounced and serialized. Data stored by earlier
  builds in localStorage migrates once.
- **No lost edits on close.** An IndexedDB transaction started in `pagehide`
  may not finish, so the pending change is also written synchronously to a
  small localStorage journal, which is replayed on the next load.
- **Sync as a commutative merge.** Every entity has an `updatedAt`, and
  deletions leave tombstones. `mergeData` keeps the newest version, drops
  anything deleted after its last edit, and moves notes out of deleted
  folders. Because the merge is commutative and idempotent, the server and
  every device converge whatever the order of requests. Exact `updatedAt`
  ties are broken by content, not by argument order. Restoring from the trash
  or a backup bumps `updatedAt`, so the restore wins everywhere.
- **Clocks are not trusted.** Each sync measures the device's clock offset
  from the server time and the request midpoint; every timestamp comes from
  the corrected clock, and the offset is persisted. The reducer also stamps
  each change at least 1 ms after the version it was made on, so an edit or
  deletion always beats the version the user saw, even one a fast clock
  dated in the future.
- **No silent loss on conflicts.** Clients send `since`, the moment of their
  last merged snapshot, and a device id; notes record `editedBy`. Before
  merging, the server finds text that last-write-wins would drop: the
  device's own edits made after `since`, or other devices' edits it has not
  seen. It keeps each as a copy marked with `conflictOf`, whose id derives
  from the lost version, so retries cannot duplicate it. `editedBy` rules out false
  alarms from text the device merely received and sent back, or its own
  earlier text from a reply that never arrived.
- **A synced soft-delete.** Deleting sets `trashedAt`, which syncs like any
  field. Only purging (manually or after 30 days) leaves a tombstone.
- **`updatedAt` versus `editedAt`.** `updatedAt` is the sync version and
  moves on every change; `editedAt` moves only when title or text change and
  is what the UI shows and sorts by.
- **End-to-end encryption.** The sync key, a random 144-bit secret, never
  leaves the device. HKDF-SHA256 derives three keys from it: a space token
  sent in its place (the server files data under the token's SHA-256), an
  AES-GCM-256 key that seals titles, text, tags and folder names with a
  fresh IV, and an HMAC key for a hash of each note's text. Every blob is
  bound to its entity's id as AES-GCM additional data, so the server cannot
  move one note's text onto another. Ids, timestamps, pin, folder and trash
  state stay readable, because the server merges and detects conflicts with
  them; it compares texts only through their keyed hashes. A conflict copy
  is marked with `conflictOf` rather than renamed, since the server cannot
  rename what it cannot read. Earlier, unencrypted clients get `426`, and a
  device's first encrypted sync erases its old plaintext space, naming it by
  the hash of the key it was stored under so the key is not sent again.
  Lose the key and the synced copy cannot be recovered; each device keeps
  its own local copy regardless.
- **Optimistic concurrency, so it scales out.** Storage sits behind a
  two-method `SyncRepository`; writes only succeed over the version that was
  read, and the handler retries with fresh data when another instance won.
  Postgres (one row per space, used when `DATABASE_URL` is set) makes that
  safe across instances; JSON files (atomic temp-file + rename) suit one
  server. Requests are also serialized per space within a process. One
  contract test runs every repository, Postgres on in-process PGlite.
- **Delta sync.** The server versions each space and records the version at
  which every note, folder and tombstone last changed. Clients keep the last
  version as a cursor: after the first full exchange of a page load, they
  send only what changed since their last snapshot and receive only what
  changed after the cursor.
- **Tombstones expire.** After 90 days they are pruned on the server and on
  every device. The server remembers the newest pruned deletion (the
  horizon) and ignores unknown entities older than it from a device that has
  not synced since, so a long-offline device cannot revive deleted notes.
- **Data from outside is untrusted.** Storage, backups and API bodies all go
  through the same validators. Malformed entries are dropped, and payloads and
  files are size-limited.
- **Native undo.** Toolbar edits use `execCommand("insertText")` on the
  changed range, so the browser undo stack survives. If the browser refuses,
  the edit falls back to a state update.
- **Rendering cost.** The preview uses `useDeferredValue`, highlighting is
  memoised per block and skipped for huge blocks, merges keep object identity
  for unchanged notes (memoised rows don't re-render), and the PDF tree and
  `html2pdf.js` load only during export.
- **Offline without a library.** A small hand-written service worker
  (`public/sw.js`) serves navigations network-first with a 3 s timeout and a
  cached fallback, and hashed `/_next/static` files cache-first. It precaches
  the page and everything it references on install, and the page hands over
  chunks it loaded before the worker took control, so the first visit is
  already complete offline. It is registered only in production builds.
- **Typed translations.** All UI strings live in one dictionary; the
  Ukrainian one is typed as the English one's shape, so a missing key fails
  the build. Counts use `Intl.PluralRules` (Ukrainian has three forms). The
  server renders English and the client switches after hydration through
  `useSyncExternalStore`, so there is no hydration mismatch.
- **A theme without a flash.** Themes are the same design tokens with a
  second palette under `[data-theme="light"]`. A one-line script in `<head>`,
  carrying the request's CSP nonce, sets the theme before the first paint.
- **History by observation.** A recorder subscribes to the store and, when a
  note's text changes, saves the version from just before the change, at most
  every five minutes per note, in its own IndexedDB object store. That covers
  edits and text replaced by sync alike, without touching the reducer.
- **Heavy features load on demand.** KaTeX and Mermaid are dynamic imports
  triggered by the content itself; Mermaid runs in strict mode, which
  sanitizes the SVG it returns.
- **Defence in depth against XSS.** The sync key sits in `localStorage`, so
  `proxy.ts` sends a per-request nonce CSP with `'strict-dynamic'`: only
  scripts Next.js stamped can run, lazily loaded chunks still work, and
  injected inline handlers are blocked. The root layout renders per request
  so the nonce can be applied.
- **Rate limiting before work.** Token buckets limit sync requests per IP
  before the body is read and per space before any storage access, and
  return `429` with `Retry-After`, which the sync client honours.

---

## Getting started

Requirements: **Node.js 20+**.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Sync server configuration

The sync API runs inside the Next.js server, so no separate service is needed.

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | unset | Postgres connection string. When set, sync spaces live in Postgres (the table is created on first use) and any number of instances can serve sync |
| `SYNC_DATA_DIR` | `.data/sync` | Without `DATABASE_URL`: where sync spaces are stored (one JSON file each) |
| `SYNC_DISABLED` | unset | Set to `true` to turn the endpoint off |
| `SYNC_RATE_LIMIT_IP` | `120` | Sync requests per minute per client IP (`0` turns it off) |
| `SYNC_RATE_LIMIT_SPACE` | `240` | Sync requests per minute per sync space (`0` turns it off) |

The per-IP limit reads `X-Forwarded-For`, so behind a reverse proxy make sure
the proxy sets it. Limits are kept in memory, which suits a single server.

On serverless hosts with a read-only file system, set `DATABASE_URL` (for
example a managed Postgres such as Neon, Supabase or RDS).

### Deploying

1. Create a Postgres database and copy its connection string.
2. Deploy the app to any Node.js host (`npm run build && npm start`), or to a
   platform with Next.js support, with `DATABASE_URL` set.
3. Put it behind HTTPS. If the host does not set `X-Forwarded-For`, the
   per-IP limit applies to all clients together.

Rate limits and the per-space lock live in each instance's memory, so with
several instances the limits apply per instance; correctness does not depend
on them.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:unit` | Unit tests for `app/lib` |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm test` | Unit tests, then end-to-end tests |
| `npm run check` | Lint, typecheck and unit tests |

## Testing

- **Unit tests** (`app/**/*.test.ts`, 187 tests) cover the reducer, merge
  properties (commutative, idempotent, tombstones), validation and migration,
  the store (incremental and debounced writes, failures, cross-tab reloads,
  unload journal), the highlighter, import/backup parsing, the sync server
  (validation, merging, concurrent writes, conflict detection, optimistic
  retries, deltas, tombstone pruning, every repository including Postgres) and the sync
  client (two devices converging through the handler, concurrent edits
  keeping both texts, debounce, errors, `Retry-After`), encryption (key
  derivation, sealing, wrong keys, tampering, moved blobs, the server never
  holding plaintext or the key), the skew-corrected
  clock, the trash, note history, wiki links, search highlighting, fuzzy
  matching, math detection, translations and plural rules, the rate limiter
  and the security headers. They run on the
  Playwright runner without a browser.
- **End-to-end tests** (`e2e/`, 54 tests) cover the whole app, including
  folders, tags, highlighting, IndexedDB storage, migration from
  localStorage, Markdown import, backup and restore, and **two browser
  contexts syncing through the real API route** (concurrent edits included,
  and a check that the server's files hold no plaintext),
  the trash, history (on Playwright's clock), wiki links, the command palette,
  drag and drop, themes, both languages, KaTeX and Mermaid, the CSP (every script is
  nonced, no violations, injected handlers are blocked) and **opening and
  editing notes offline**. The offline tests need the production build, so
  they run in CI or locally with `npm run build && CI=1 npm run test:e2e`.

```bash
npx playwright install chromium   # first run only
npm test
```

## CI

[GitHub Actions](.github/workflows/ci.yml) runs lint, typecheck, unit tests
and the production build, then runs the end-to-end suite against
`next start`.

## Project structure

```
app/
  api/sync/      Sync Route Handler
  components/
    editor/      Editor, Toolbar, NoteMeta, StatusBar, Preview, Markdown,
                 CodeBlock, ExportMenu, ViewModeToggle, MarkdownCheatsheet,
                 Backlinks, HistoryDialog, MermaidDiagram
    sidebar/     Sidebar, LibraryNav, NoteItem, SearchBar
    sync/        SyncButton, SyncDialog
    ui/          Button, Icon, Modal, Toast, GalaxyBackground, FloatingElements
    AppMenu, DropOverlay, ServiceWorker, CommandPalette, ThemeController
  hooks/         useNotes, useSync, useImport, useDismiss, useMediaQuery
  lib/
    notes/       reducer, merge, storage, persistence, idb, store, history, welcome
    sync/        protocol, client, server, conflicts, crypto, wire, space, fileRepository, postgresRepository, rateLimit
    security/    CSP and security headers
    i18n/        typed dictionaries (en, uk), useI18n, plural rules
    clock, fuzzy, highlight, importExport, markdownActions, markdownExtras,
    textarea, text, templates, theme, wikiLinks
  types/         Note, Folder, NotesData
  manifest.ts    Web app manifest
public/          Service worker and app icons
proxy.ts         Per-request CSP nonce
e2e/             Playwright end-to-end tests
```

## Possible next steps

- Real accounts instead of sync keys
- A hosted demo
- Images stored with notes (they would need encrypting and syncing as
  binary data, within the request size limit)
- An inverted search index in a Web Worker for very large libraries
- Field-level merge, so two devices editing different fields of a note
  don't overwrite each other

## License

[MIT](LICENSE)
