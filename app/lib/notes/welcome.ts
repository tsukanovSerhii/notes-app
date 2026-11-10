import type { Note } from "@/app/types/note";

const WELCOME = `# Welcome to NoteVoid

A local-first Markdown notes app. Notes are stored in your browser (IndexedDB) as you type, and you can optionally sync them between devices.

## Try it

- [x] Open this note
- [ ] Select some text and press **Ctrl + B**
- [ ] Add a tag below the title and filter by it in the sidebar
- [ ] Create a folder and move this note into it
- [ ] Drop a \`.md\` file onto the window to import it
- [ ] Export this note as **PDF** or **Markdown**, or download a full backup
- [ ] Turn on sync from the cloud button and open the app on another device

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| \`Alt + N\` | New note |
| \`/\` | Search notes |
| \`Ctrl + B\` / \`Ctrl + I\` | Bold / italic |
| \`Ctrl + K\` | Link |

## Code blocks are highlighted

\`\`\`ts
// The highlighter is ~200 lines, no dependencies.
function greet(name: string): string {
  const count = 42;
  return \`Hello, \${name}! You have \${count} notes.\`;
}
\`\`\`

> Deleted something by accident? Every delete can be undone from the toast.
`;

export function createWelcomeNotes(now: number): Note[] {
  return [
    {
      id: "welcome",
      title: "Welcome to NoteVoid",
      content: WELCOME,
      pinned: true,
      tags: ["getting-started"],
      folderId: null,
      createdAt: now,
      updatedAt: now,
    },
  ];
}
