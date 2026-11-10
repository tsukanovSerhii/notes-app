import type { Note } from "@/app/types/note";

const WELCOME = `# Welcome to NoteVoid

A Markdown notes app that lives entirely in your browser. No account, no server: your notes are saved to \`localStorage\` as you type.

## Try it

- [x] Open this note
- [ ] Select some text and press **Ctrl + B**
- [ ] Insert a template from the toolbar
- [ ] Export this note as **PDF** or **Markdown**
- [ ] Open the app in a second tab and watch notes sync

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| \`Alt + N\` | New note |
| \`/\` | Search notes |
| \`Ctrl + B\` / \`Ctrl + I\` | Bold / italic |
| \`Ctrl + K\` | Link |

## Code blocks

\`\`\`ts
function greet(name: string): string {
  return \`Hello, \${name}!\`;
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
      createdAt: now,
      updatedAt: now,
    },
  ];
}
