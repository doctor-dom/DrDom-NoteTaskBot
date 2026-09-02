# Changelog

## 2026-08-31 — v0.3.4

- Parent task title is now `File Name | Local Relative Path | page N` (one parent per note page).
- Subtask suffix is location-only: `Call dentist @ | upper |`.
- **Add context** on the capture review screen attaches a PNG of the current page as a Todoist comment on the parent.
- Plugin-tab button **add context -> Todoist** runs the same attach flow without a lasso selection.

## 2026-08-29 — v0.3.3

- Parent task title is now `File Name | Local Relative Path` from the note path (e.g. `RTL | Note>CHP - Professional>Service Weeks>8-24-26 CON`).
- Same path reuses the same parent; same file name in different folders gets different parents.
- Old name-only parents are not migrated; the next capture creates a new parent with the richer title.

## 2026-08-29 — v0.3.2

- Prefer due/priority in `[brackets]`; looser OCR aliases inside (e.g. `tommorrow`, `I1` / `l1`).
- Conservative parse outside brackets (no `I1`/`l1` mapping).
- Review shows corrections and hints when no due/priority was parsed.

## 2026-08-29 — v0.3.1

- Parse due phrases (`tomorrow`, `next Monday`, …) and priority (`!!1`–`!!4` / `p1`–`p4`) from OCR; send as `due_string` + `priority` on create.
- Subtask suffix is now `page <n>| <quarter>` (lowercase), e.g. `Call dentist page 3| upper`.
- Review panel shows detected due and priority; rejected due strings retry without due.

## 2026-08-29 — v0.3.0

- Parent task is the note file name (reused so later lassos add subtasks).
- Each lasso is one subtask: OCR text plus page/location at the end.
- Capture remounts on every **-> Todoist** press so a new lasso is processed instead of showing the first review forever.
- Button-press lasso cache is awaited (no race with UI open). Replays of the last captured strokes are rejected.

## 2026-08 — v0.2.0

- Host SDK alignment: permissions, 1-based page index.
