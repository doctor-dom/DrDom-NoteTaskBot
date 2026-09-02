# NoteTaskBot Tracker

## Features

| ID | Status | Title | Notes |
|----|--------|-------|-------|
| F-001 | Done | Lasso OCR capture | Button 200, `recognizeLassoElements` |
| F-002 | Done | Parent + subtask Todoist sync | File\|path parent; one subtask per lasso |
| F-003 | Done | Target project via config | `targetProjectId` in notetaskbot-config.json |
| F-004 | Open | Checkbox success marker | Previously planned; not in current capture UI |
| F-005 | Open | Config UI | Token via MyStyle JSON only for now |
| F-006 | Done | Parent = file \| path \| page N | e.g. `RTL \| Note>… \| page 3` |
| F-007 | Done | Lasso vertical quarter | Top / Upper / Lower / Bottom from rect or EMR bounds |
| F-008 | Done | Missing-parent recovery | Recreate parent if deleted before/during subtask create |
| F-009 | Done | Host permissions | FILE:READ, FILE:WRITE, INTERNET via PluginConfig + requestPermission |
| F-010 | Done | 1-based page index | Subtask suffix / getPageSize; prefer getPageDisplaySize |
| F-011 | Done | Subtask location suffix | `<ocr> @ \| <quarter> \|` (page on parent) |
| F-012 | Done | Lasso due + priority | Bracket zones + local typo map; POST due_string + priority |
| F-013 | Done | Bracket markup OCR | Loose aliases inside `[...]` (tommorrow, I1/l1); conservative outside |
| F-014 | Done | Add context (page PNG) | Review + toolbar button; `generateNotePng` → Todoist upload/comment on parent |

## Bugs

| ID | Status | Title | Notes |
|----|--------|-------|-------|
| B-001 | Open | Checkbox PNG is placeholder | Replace assets/checkbox-done.png if markers return |
| B-002 | Open | insertImage position untested | May need on-device verification |
| B-003 | Fixed | Same-day parent reuse blocked new captures | Reuse is now by file name; duplicate skip is exact subtask string only |
| B-004 | Fixed | Stale lasso cache replay | Remount Capture on each button press; wait for press-time cache; reject last fingerprint |
