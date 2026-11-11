import type { Note } from "@/app/types/note";

const WELCOME = `# Welcome to NoteVoid

A local-first Markdown notes app. Notes are stored in your browser (IndexedDB) as you type, and you can optionally sync them between devices.

## Try it

- [x] Open this note
- [ ] Select some text and press **Ctrl + B**
- [ ] Add a tag below the title and filter by it in the sidebar
- [ ] Create a folder and drag this note into it
- [ ] Link to another note like this: [[Note title]]
- [ ] Open the command palette: **Ctrl + Shift + P**
- [ ] Drop a \`.md\` file onto the window to import it
- [ ] Export this note as **PDF** or **Markdown**, or download a full backup
- [ ] Turn on sync from the cloud button and open the app on another device

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| \`Alt + N\` | New note |
| \`/\` | Search notes |
| \`Ctrl + Shift + P\` | Command palette |
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

> Deleted something by accident? Notes wait in the trash for 30 days.
`;

const WELCOME_UK = `# Вітаємо в NoteVoid

Нотатки в Markdown, що зберігаються локально. Нотатки зберігаються у вашому браузері (IndexedDB) під час набору, а за бажання синхронізуються між пристроями з наскрізним шифруванням.

## Спробуйте

- [x] Відкрити цю нотатку
- [ ] Виділити текст і натиснути **Ctrl + B**
- [ ] Додати тег під заголовком і відфільтрувати за ним у бічній панелі
- [ ] Створити папку й перетягнути в неї цю нотатку
- [ ] Послатися на іншу нотатку так: [[Назва нотатки]]
- [ ] Відкрити палітру команд: **Ctrl + Shift + P**
- [ ] Перетягнути \`.md\`-файл у вікно, щоб імпортувати його
- [ ] Експортувати нотатку в **PDF** чи **Markdown** або завантажити резервну копію
- [ ] Увімкнути синхронізацію кнопкою з хмаркою й відкрити застосунок на іншому пристрої

## Гарячі клавіші

| Клавіші | Дія |
| --- | --- |
| \`Alt + N\` | Нова нотатка |
| \`/\` | Пошук нотаток |
| \`Ctrl + Shift + P\` | Палітра команд |
| \`Ctrl + B\` / \`Ctrl + I\` | Жирний / курсив |
| \`Ctrl + K\` | Посилання |

## Код підсвічується

\`\`\`ts
function greet(name: string): string {
  const count = 42;
  return \`Привіт, \${name}! У вас \${count} нотаток.\`;
}
\`\`\`

> Видалили щось випадково? Нотатка 30 днів чекає в кошику.
`;

export function createWelcomeNotes(now: number, locale: "en" | "uk" = "en"): Note[] {
  const uk = locale === "uk";
  return [
    {
      id: "welcome",
      title: uk ? "Вітаємо в NoteVoid" : "Welcome to NoteVoid",
      content: uk ? WELCOME_UK : WELCOME,
      pinned: true,
      tags: [uk ? "початок" : "getting-started"],
      folderId: null,
      createdAt: now,
      updatedAt: now,
      editedAt: now,
      editedBy: null,
      trashedAt: null,
      conflictOf: null,
    },
  ];
}
