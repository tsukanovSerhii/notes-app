// Ready-made note templates inserted via the "Templates" menu.

export interface NoteTemplate {
  id: string;
  label: string;
  title: string; // suggested note title
  body: string; // markdown body inserted into the editor
}

export const TEMPLATES: NoteTemplate[] = [
  {
    id: "meeting",
    label: "Meeting notes",
    title: "Meeting notes",
    body: `# Meeting notes

**Date:** ${todayISO()}
**Attendees:**

## Agenda
-

## Discussion
-

## Action items
- [ ] First action
- [ ] Second action
`,
  },
  {
    id: "todo",
    label: "To-do list",
    title: "To-do list",
    body: `# To-do

## Today
- [ ] First task
- [ ] Second task

## Later
- [ ] Someday
`,
  },
  {
    id: "journal",
    label: "Daily journal",
    title: "Daily journal",
    body: `# ${todayISO()}

## How I feel


## What happened


## Notes
-
`,
  },
  {
    id: "snippet",
    label: "Code snippet",
    title: "Code snippet",
    body: `# Snippet

What it does:

\`\`\`js
// your code here
\`\`\`
`,
  },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
