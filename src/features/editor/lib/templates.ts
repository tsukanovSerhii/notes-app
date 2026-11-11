import { todayLocalISO } from "@/shared/lib/text";

export interface NoteTemplate {
  id: "meeting" | "todo" | "journal" | "snippet";
  label: string;
  title: string;
  /** Built on demand so dates are always current. */
  body: () => string;
}

export const TEMPLATES: NoteTemplate[] = [
  {
    id: "meeting",
    label: "Meeting notes",
    title: "Meeting notes",
    body: () => `# Meeting notes

**Date:** ${todayLocalISO()}
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
    body: () => `# To-do

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
    body: () => `# ${todayLocalISO()}

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
    body: () => `# Snippet

What it does:

\`\`\`js
// your code here
\`\`\`
`,
  },
];
