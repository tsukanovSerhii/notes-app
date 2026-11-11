# NoteVoid

A local-first Markdown notes app: live preview, folders and tags, syntax
highlighting, import/export, and optional sync between devices. Notes live in
the browser (IndexedDB); the sync server is opt-in.

Built with **Next.js 16** (App Router + Route Handlers), **React 19**,
**TypeScript** (strict) and **Tailwind CSS 4**. No UI or state libraries:
only `react-markdown`, `remark-gfm` and `html2pdf.js` at runtime.

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
- Pinning, full-text search, and undo for every delete.

**Data**
- **IndexedDB storage** with one record per note, debounced incremental
  writes, a visible save status, and cross-tab updates via `BroadcastChannel`.
- **Import** `.md`/`.txt` files from the menu or by dropping them onto the
  window.
- **Backup**: download every note and folder as JSON, and restore it later,
  including notes deleted since the backup.
- **Export** a note as a PDF or a `.md` file.
- **Sync** (optional): turn it on, copy the sync key, paste it on another
  device. Changes merge in both directions.

**Offline and security**
- **Installable PWA** that opens and works without a network after the first
  visit (service worker caches the app shell; notes are already local).
- **Nonce-based Content Security Policy** plus hardening headers, and a
  rate-limited sync endpoint.

**Quality**
- Responsive layout (the notes list is a drawer on phones). Semantic markup,
  labelled controls, focus rings, WCAG AA contrast, `prefers-reduced-motion`.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt + N` | New note (in the current folder) |
| `/` | Focus search |
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
  and `fetch` injected. That is why 107 unit tests run in about 3 seconds with no
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
  every device converge whatever the order of requests. Undo and restoring a
  backup bump `updatedAt`, so a restored note wins over its tombstone
  everywhere.
- **Sync without accounts.** The sync key is a random 144-bit bearer secret.
  The server stores data under its SHA-256 hash and never stores the key.
  Read-merge-write is serialized per space, so concurrent devices don't lose
  writes. Storage sits behind a two-method `SyncRepository` interface; the
  JSON-file implementation (atomic temp-file + rename) is fine for a single
  server, and a Postgres implementation would be one file.
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
| `SYNC_DATA_DIR` | `.data/sync` | Where sync spaces are stored (one JSON file each) |
| `SYNC_DISABLED` | unset | Set to `true` to turn the endpoint off |
| `SYNC_RATE_LIMIT_IP` | `120` | Sync requests per minute per client IP (`0` turns it off) |
| `SYNC_RATE_LIMIT_SPACE` | `240` | Sync requests per minute per sync space (`0` turns it off) |

The per-IP limit reads `X-Forwarded-For`, so behind a reverse proxy make sure
the proxy sets it. Limits are kept in memory, which suits a single server.

On serverless hosts with a read-only file system, implement `SyncRepository`
for a database.

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

- **Unit tests** (`app/**/*.test.ts`, 107 tests) cover the reducer, merge
  properties (commutative, idempotent, tombstones), validation and migration,
  the store (incremental and debounced writes, failures, cross-tab reloads,
  unload journal), the highlighter, import/backup parsing, the sync server
  (validation, merging, concurrent writes) and the sync client (two devices
  converging through the handler, debounce, errors, `Retry-After`), the rate
  limiter and the security headers. They run on the
  Playwright runner without a browser.
- **End-to-end tests** (`e2e/`, 38 tests) cover the whole app, including
  folders, tags, highlighting, IndexedDB storage, migration from
  localStorage, Markdown import, backup and restore, and **two browser
  contexts syncing through the real API route**, the CSP (every script is
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
                 CodeBlock, ExportMenu, ViewModeToggle, MarkdownCheatsheet
    sidebar/     Sidebar, LibraryNav, NoteItem, SearchBar
    sync/        SyncButton, SyncDialog
    ui/          Button, Icon, Modal, Toast, GalaxyBackground, FloatingElements
    AppMenu, DropOverlay, ServiceWorker
  hooks/         useNotes, useSync, useImport, useDismiss, useMediaQuery
  lib/
    notes/       reducer, merge, storage, persistence, idb, store, welcome
    sync/        protocol, client, server, fileRepository, rateLimit
    security/    CSP and security headers
    highlight, importExport, markdownActions, textarea, text, templates
  types/         Note, Folder, NotesData
  manifest.ts    Web app manifest
public/          Service worker and app icons
proxy.ts         Per-request CSP nonce
e2e/             Playwright end-to-end tests
```

## Possible next steps

- A Postgres `SyncRepository` and real accounts instead of sync keys
- Pruning old tombstones
- Field-level merge, so two devices editing different fields of a note
  don't overwrite each other
- Drag and drop of notes between folders

## License

[MIT](LICENSE)
