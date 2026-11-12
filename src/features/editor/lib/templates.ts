import { todayLocalISO } from "@/shared/lib/text";

export type BuiltinTemplateId = "meeting" | "todo" | "journal" | "snippet";

export interface NoteTemplate {
  /** A built-in id, or `note:<id>` for a template saved as a note. */
  id: string;
  label: string;
  title: string;
  /** Set for templates the user saved. */
  custom?: true;
  /** Built on demand so dates are always current. */
  body: () => string;
}

/** What to show for a template: its own name, or the translated built-in one. */
export function templateName(template: NoteTemplate, names: Record<BuiltinTemplateId, string>): string {
  return template.custom ? template.label : (names[template.id as BuiltinTemplateId] ?? template.label);
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
