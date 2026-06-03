@AGENTS.md

Build a full Markdown notes app using Next.js 16 App Router, React 19,
TypeScript, and Tailwind CSS 4.

---

## DESIGN SYSTEM

Design inspired by tailwindcss.com — clean, dark, minimal, professional.

Color palette (add to globals.css as CSS variables):

- --bg-base: #0f0f11 ← main background
- --bg-surface: #18181b ← cards, sidebar
- --bg-elevated: #1f1f23 ← hover states
- --border: #27272a ← borders
- --text-primary: #fafafa ← headings
- --text-muted: #71717a ← secondary text
- --accent: #818cf8 ← indigo accent (like tailwind docs)
- --accent-glow: rgba(129,140,248,0.15)

Typography:

- Font: Inter (import from Google Fonts in layout.tsx)
- Headings: font-weight 600, tight letter-spacing
- Code/monospace: font-family 'JetBrains Mono'

---

## GALAXY BACKGROUND

Create app/components/ui/GalaxyBackground.tsx as a client component. Use an
HTML5 canvas that fills the full viewport (position: fixed, z-index: 0).

Canvas should render:

1. ~400 small white stars that twinkle (opacity oscillates with Math.sin, each
   star has unique phase and speed)
2. 4-5 soft nebula blobs using radial gradients in indigo (#818cf8), cyan
   (#67e8f9), and violet (#a78bfa) at very low opacity (0.04–0.08)
3. Use requestAnimationFrame loop, resize on window resize

Export as default. Use it in app/layout.tsx inside <body>, before {children}.

---

## FLOATING SVG ELEMENTS

Create app/components/ui/FloatingElements.tsx as a client component. Position:
fixed, inset 0, z-index 1, pointer-events: none, overflow: hidden.

Generate 24 elements randomly placed across the screen. Each element slowly
floats from bottom to top (CSS keyframe animation, 14–28s duration, random
delays 0–25s). Opacity: 0.08–0.2. Random sizes (scale 0.6–1.2).

SVG shapes to use (cycle through them):

- Markdown badge: rect with rounded corners + "M↓" text in JetBrains Mono
- Code tag: </> text
- Hash symbol: # (for markdown headings)
- Diamond: rotated square
- Circle ring: two concentric circles
- Curly brace: { }
- Star polygon: 5-point star
- PDF mini icon: document shape with "PDF" label

Colors: use --accent (#818cf8), cyan (#67e8f9), violet (#a78bfa) for
strokes/fills.

Export as default. Add to app/layout.tsx after GalaxyBackground.

---

## FILE STRUCTURE

Create exactly this structure:

app/ layout.tsx ← imports Inter font, adds GalaxyBackground + FloatingElements
page.tsx ← main app shell (Sidebar + Editor + Preview) globals.css ← CSS
variables + Tailwind + base styles

components/ ui/ GalaxyBackground.tsx ← canvas galaxy (use client)
FloatingElements.tsx ← floating SVGs (use client) editor/ Editor.tsx ← textarea
for markdown input (use client) Preview.tsx ← react-markdown renderer (use
client) ExportButton.tsx ← PDF export via html2pdf.js (use client) sidebar/
Sidebar.tsx ← note list container (use client) NoteItem.tsx ← single note row
SearchBar.tsx ← search input

hooks/ useNotes.ts ← all note state logic + localStorage

types/ note.ts ← Note type: { id, title, content, createdAt, updatedAt }

---

## LAYOUT (app/page.tsx)

Three-column layout, full viewport height, dark background:

┌─────────────────────────────────────────────────────┐ │ NAVBAR — logo
"NoteVoid" left, export button right │
├──────────────┬──────────────────┬───────────────────┤ │ │ │ │ │ SIDEBAR │
EDITOR │ PREVIEW │ │ (260px) │ (flex: 1) │ (flex: 1) │ │ │ │ │ │ Search │
<textarea> │ react-markdown │ │ + note list │ line numbers? │ styled output │ │
│ │ │ └──────────────┴──────────────────┴───────────────────┘

All panels sit above the galaxy background (z-index: 2, position: relative).
Panel backgrounds: var(--bg-surface) at 80% opacity with backdrop-filter:
blur(12px). Borders between panels: 1px solid var(--border).

---

## COMPONENTS DETAIL

### Sidebar (components/sidebar/Sidebar.tsx)

- Fixed width 260px, full height, border-right
- Header: "Notes" title + "New note" button (+ icon, accent color)
- SearchBar below header
- Scrollable list of NoteItem components
- Active note highlighted with accent background

### NoteItem (components/sidebar/NoteItem.tsx)

- Show note title (truncated) and relative time (e.g. "2 hours ago")
- Hover state: bg-elevated
- Active state: left border 2px accent color + accent background
- Delete button appears on hover (trash icon, red on hover)

### SearchBar (components/sidebar/SearchBar.tsx)

- Full-width input, dark background, border on focus
- Magnifier icon on left
- Clears on × button

### Editor (components/editor/Editor.tsx)

- Full-height textarea, no resize, no outline
- Background: transparent (shows panel bg)
- Font: JetBrains Mono 14px, line-height 1.8
- Placeholder: "Start writing in Markdown..."
- Character count in bottom-right corner

### Preview (components/editor/Preview.tsx)

- Renders markdown using react-markdown with remark-gfm
- Prose styles: headings in --text-primary, body in --text-muted
- Code blocks: dark bg, monospace font, rounded corners
- id="preview-content" on the wrapper div (needed for PDF export)

### ExportButton (components/editor/ExportButton.tsx)

- Button in navbar: "Export PDF"
- Uses dynamic import: const html2pdf = (await import('html2pdf.js')).default
- Exports the #preview-content div
- Show loading state while generating

---

## HOOKS

### useNotes (hooks/useNotes.ts)

Return these values and functions:

- notes: Note[] ← all notes from localStorage
- activeNote: Note | null
- setActiveNote(id)
- createNote() ← creates untitled note, sets it active
- updateNote(id, patch) ← updates title/content
- deleteNote(id)
- searchQuery: string
- setSearchQuery(query)
- filteredNotes ← notes filtered by searchQuery

Persist notes to localStorage key "notevoid-notes". Use useEffect to sync on
every change. Sort notes by updatedAt descending.

---

## PACKAGES TO INSTALL

Run these installs: npm install react-markdown remark-gfm html2pdf.js npm
install -D @types/html2pdf.js

---

## GLOBALS.CSS

Add after Tailwind directives:

- All CSS variables listed in DESIGN SYSTEM above
- Base: body background var(--bg-base), color var(--text-primary)
- Scrollbar: thin, dark thumb (--border color), transparent track
- Selection: accent background

---

## IMPORTANT RULES

1. Every component that uses useState, useEffect, or browser APIs must have "use
   client" at the top
2. GalaxyBackground and FloatingElements are always "use client"
3. Use Next.js 16 App Router — NO pages/ directory
4. Tailwind 4 uses CSS config — do NOT create tailwind.config.js
5. All imports use @/ alias (e.g. @/components/editor/Editor)
6. Keep components small and focused — one responsibility per file
7. Add a short comment at the top of each file explaining what it does
