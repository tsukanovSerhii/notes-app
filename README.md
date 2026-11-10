# NoteVoid

A local-first Markdown notes app with a live preview, PDF/Markdown export and
a calm galaxy background. Notes never leave the browser: no account, no server.

Built with **Next.js 16** (App Router), **React 19**, **TypeScript** (strict)
and **Tailwind CSS 4**.

![NoteVoid on desktop](docs/screenshot.png)

<details>
<summary>Mobile layout</summary>

<img src="docs/screenshot-mobile.png" alt="NoteVoid on a phone" width="320" />

</details>

---

## Features

- **Live GFM preview**: tables, task lists, strikethrough. Edit, split or
  preview-only view modes.
- **Formatting toolbar and shortcuts**: bold, italic, headings, lists,
  checkboxes, quotes, links, code, tables. Native **Ctrl + Z** keeps working
  after toolbar actions.
- **Smart lists**: Enter continues a bullet, numbered or task list and ends it
  on an empty item.
- **Pinning, search and undo**: pinned notes stay on top, search covers titles
  and content, and every delete can be undone from a toast.
- **Autosave with status**: debounced writes to `localStorage`, with a visible
  "Saving… / Saved / Not saved" state.
- **Cross-tab sync**: open the app in two tabs and edits show up in both.
- **Export** the active note as a light-themed **PDF** or a **.md** file.
- **Templates**: meeting notes, to-do list, daily journal, code snippet.
- **Responsive**: on phones the notes list becomes a drawer.
- **Accessible**: semantic list and buttons, labelled controls, visible focus
  rings, keyboard-reachable actions, WCAG AA text contrast, and
  `prefers-reduced-motion` support.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt + N` | New note |
| `/` | Focus search |
| `Ctrl/Cmd + B`, `I`, `K` | Bold, italic, link |
| `Enter` in a list | Continue or end the list |
| `Esc` | Close menus, clear search, close the drawer |

---

## Architecture

```
UI components ──► useNotes() ──► notesStore ──► notesReducer (pure)
                     │               │
         useSyncExternalStore        └──► storage.ts ──► localStorage
```

| Layer | File | Responsibility |
| --- | --- | --- |
| Reducer | [`app/lib/notes/reducer.ts`](app/lib/notes/reducer.ts) | Pure state transitions: create, update, delete/undo, pin, select, sort, filter |
| Storage | [`app/lib/notes/storage.ts`](app/lib/notes/storage.ts) | Versioned schema, validation of untrusted data, migration from the legacy format |
| Store | [`app/lib/notes/store.ts`](app/lib/notes/store.ts) | Holds state, debounces persistence, reports save status, applies cross-tab changes |
| Hook | [`app/hooks/useNotes.ts`](app/hooks/useNotes.ts) | Connects React to the store via `useSyncExternalStore` |
| Editor logic | [`app/lib/markdownActions.ts`](app/lib/markdownActions.ts) | Pure text transforms (`wrap`, `prefix`, `insert`, `continueList`) |

### Design decisions

- **`useSyncExternalStore` instead of `useEffect` + `setState`.** `localStorage`
  is an external store. Reading it through a server snapshot and a client
  snapshot avoids hydration mismatches and the cascading render that loading
  data in an effect causes.
- **The logic has no React and no DOM.** The reducer, storage parser and
  Markdown transforms take plain values and return plain values, so they are
  unit-tested without a browser. The store gets its storage, clock, ID
  generator and timers injected, which makes debounce behaviour testable
  without real waiting.
- **Debounced, fail-safe persistence.** Typing no longer serializes every note
  on every keystroke. Pending writes are flushed on `pagehide` and when the tab
  is hidden. A full or blocked storage shows an error state instead of crashing.
- **Stored data is untrusted.** Every stored note is validated and normalized;
  corrupt JSON or malformed entries are dropped instead of breaking the app.
  The payload is versioned (`{ version: 1, notes, activeId }`), and the earlier
  bare-array format is still read.
- **Native undo.** Toolbar edits go through `execCommand("insertText")` and
  replace only the changed range, so the browser's undo stack survives. If the
  browser refuses, the edit falls back to a state update.
- **Rendering cost.** The preview uses `useDeferredValue`, so long notes do not
  slow typing. The PDF copy of a note is mounted only while an export runs
  (before, a second Markdown tree re-rendered on every keystroke).
  `html2pdf.js` is loaded with a dynamic `import()`, only on export.
- **The background stays cheap.** The canvas scales for HiDPI, caps at 30 fps,
  pauses in hidden tabs and draws a static frame when reduced motion is
  preferred. The floating shapes use a seeded PRNG, so server and client
  render the same markup.

---

## Getting started

Requirements: **Node.js 20+**.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:unit` | Unit tests for the pure logic in `app/lib` |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm test` | Unit tests, then end-to-end tests |
| `npm run check` | Lint, typecheck and unit tests (quick pre-push check) |

## Testing

- **Unit tests** (`app/**/*.test.ts`, 57 tests) cover the reducer, storage
  parsing and migration, the store (debounce, flush, quota errors, cross-tab
  sync), the Markdown transforms and the text helpers. They run on the
  Playwright test runner without a browser, so the project needs only one test
  runner.
- **End-to-end tests** (`e2e/`, 24 tests) cover note CRUD, undo, pinning,
  search, persistence, cross-tab sync, the toolbar, native undo, list
  continuation, view modes, shortcuts, PDF and Markdown export, and the mobile
  drawer.

```bash
npx playwright install chromium   # first run only
npm test
```

## CI

[GitHub Actions](.github/workflows/ci.yml) runs lint, typecheck, unit tests
and the production build, then runs the end-to-end suite against
`next start`. The Playwright report is uploaded when a run fails.

## Project structure

```
app/
  components/
    editor/      Editor, Toolbar, StatusBar, Preview, Markdown, ExportMenu,
                 ViewModeToggle, MarkdownCheatsheet
    sidebar/     Sidebar, NoteItem, SearchBar
    ui/          Button, Icon, Toast, GalaxyBackground, FloatingElements
  hooks/         useNotes, useDismiss, useMediaQuery
  lib/
    notes/       reducer, storage, store, welcome note (+ tests)
    markdownActions, textarea, text, templates, download, cn (+ tests)
  types/         Note
  page.tsx       App shell: layout, shortcuts, toasts
e2e/             Playwright end-to-end tests
```

## Possible next steps

- Syntax highlighting in code blocks (`rehype-highlight`)
- Tags and folders
- Import of `.md` files and a JSON backup
- IndexedDB storage for large note collections
- Optional sync backend
