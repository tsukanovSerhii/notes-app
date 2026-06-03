# NoteVoid

A clean, dark Markdown notes app with a live preview, a starry galaxy
background, and one-click PDF export. Notes are stored locally in your browser —
no account, no server.

Built with **Next.js 16** (App Router), **React 19**, **TypeScript**, and
**Tailwind CSS 4**.

---

## Features

- **Live Markdown preview** — GitHub-Flavored Markdown (tables, task lists,
  strikethrough) rendered as you type.
- **Formatting toolbar** — bold, italic, headings, lists, checkboxes, quotes,
  links, inline/block code, and tables, inserted at the cursor.
- **Keyboard shortcuts** — `Ctrl/Cmd + B`, `Ctrl/Cmd + I`, `Ctrl/Cmd + K`.
- **Note templates** — Meeting notes, To-do list, Daily journal, Code snippet.
- **Markdown cheatsheet** — a quick syntax reference in the editor.
- **Search** — filter notes by title or content.
- **Local persistence** — notes are saved to `localStorage`.
- **PDF export** — export the active note as a clean, light-themed PDF.
- **Galaxy background** — animated canvas stars, soft nebulae, and drifting
  SVG shapes.

---

## Getting started

Requirements: **Node.js 20+**.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Playwright end-to-end tests |
| `npm run test:ui` | Run the tests in Playwright's UI mode |
| `npm run test:report` | Open the last HTML test report |

---

## Testing

End-to-end tests live in [`e2e/`](e2e/) and run on
[Playwright](https://playwright.dev/). They cover note CRUD, search,
persistence, the Markdown preview, the editor toolbar, templates, keyboard
shortcuts, and PDF export.

```bash
npx playwright install chromium   # first run only
npm test
```

The test runner reuses a dev server on port `3000` if one is already running,
otherwise it starts its own.

---

## Project structure

```
app/
  components/
    editor/      Editor, Preview, Toolbar, ExportButton, MarkdownCheatsheet
    sidebar/     Sidebar, NoteItem, SearchBar
    ui/          Button, GalaxyBackground, FloatingElements
  hooks/         useNotes — note state + localStorage
  lib/           cn, markdownActions, templates
  types/         note
  layout.tsx     fonts + background
  page.tsx       three-column app shell
  globals.css    design tokens + base styles
e2e/             Playwright tests
```

---

## Tech stack

- [Next.js 16](https://nextjs.org/) — App Router
- [React 19](https://react.dev/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [react-markdown](https://github.com/remarkjs/react-markdown) +
  [remark-gfm](https://github.com/remarkjs/remark-gfm)
- [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) — PDF export
- [Playwright](https://playwright.dev/) — end-to-end tests
