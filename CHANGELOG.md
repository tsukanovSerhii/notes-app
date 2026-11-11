# Changelog

All notable changes to NoteVoid. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-12

The first release since the portfolio version. The app is installable and
works offline, sync is end-to-end encrypted and no longer loses edits, and
the code is organised by feature.

### Upgrading

- **Sync protocol changed (breaking).** Synced notes are now encrypted on the
  device, so every device must load the new version. Older clients get a
  `426` and a prompt to reload. On its first encrypted sync, a device asks the
  server to erase its old plaintext space.
- **Local database upgraded** from version 1 to 2 (adds the history store).
  Existing notes are kept.
- **The sync key cannot be recovered.** Without it the synced copy is
  unreadable; each device keeps its own local copy regardless.

### Added

- **Offline and installable:** a web app manifest, icons and a service worker
  that caches the app shell.
- **Security:** a per-request nonce Content Security Policy and hardening
  headers, and rate limiting of the sync endpoint per IP and per space.
- **End-to-end encrypted sync:** the key never leaves the device (HKDF-derived
  space token, AES-GCM for text, HMAC for change detection).
- **Conflict copies:** when two devices edit the same note between syncs,
  neither text is lost.
- **Trash:** deleted notes wait 30 days and sync across devices.
- **Postgres storage** for sync (`DATABASE_URL`), optimistic concurrency, delta
  sync and tombstone expiry.
- **Wiki links** (`[[Note]]`) with backlinks; **KaTeX** math and **Mermaid**
  diagrams, loaded on demand.
- **Version history** for each note, kept on the device.
- **Command palette** (`Ctrl/Cmd+Shift+P`).
- **Search** that highlights matches and shows the text around them.
- **Drag and drop** of notes into folders and the trash; sort by last edit,
  creation or title.
- **Light theme** (follows the system) and a **Ukrainian** translation.
- `LICENSE` (MIT), `.env.example`, Dependabot and CodeQL.

### Changed

- The list shows and sorts by when the text was last edited; pinning, tagging
  or moving a note no longer moves it to the top.
- Merging breaks `updatedAt` ties deterministically, and edits are always
  stamped after the version they were made on, so a device with a fast clock
  can no longer win every conflict.
- Device clocks are corrected towards the server's time.
- The code moved from `app/` to `src/`, organised into `app`, `features` and
  `shared`, with the dependency rules enforced by ESLint.

### Security

- Next.js upgraded from 16.2.7 to 16.4.6, which fixes several advisories
  (remote code execution in the image optimizer, a proxy bypass, SSRF, cache
  poisoning). KaTeX is pinned to 0.18.11 for its prototype-pollution fix.
- Two moderate advisories remain in a build-time Tailwind dependency; they do
  not affect the running app.

### Fixed

- Moving a note into an existing folder was undone by delta sync.
- The command palette lost the first characters typed after opening.
- The starfield kept animating in the light theme, where it is hidden.

## [0.1.0]

The portfolio version: Markdown editor with live preview, folders and tags,
syntax highlighting, import/export, IndexedDB storage and optional plaintext
sync.
