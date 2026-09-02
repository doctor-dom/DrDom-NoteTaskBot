# NoteTaskBot

Lasso-to-Todoist capture plugin (`plugins/tasks` in DrDom-Supernote-Plugins).

## Status

**v0.3.4 — page-scoped parents + Add context.** Rebuild with `build-native.ps1`.

## What it does

1. User lassos handwriting in a note
2. Tap **-> Todoist** in the lasso toolbar
3. Device OCR converts strokes to text
4. Parent task is **`File Name | Local Relative Path | page N`** (one parent per note page), e.g.:
   - `RTL | Note>CHP - Professional>Service Weeks>8-24-26 CON | page 3`
5. The lasso text becomes **one subtask**, with location only:
   - `Call dentist @ | upper |`
6. Optional **Add context** (review button or plugin-tab **add context -> Todoist**) attaches a page PNG comment to the parent
7. Prefer due/priority in **brackets** (looser OCR fixes inside):
   - `Call dentist [tomorrow !!1]` or `[tommorrow I1]`
   - Outside brackets: exact phrases / `!!1` / `p1` only (no `l1` / `tommorrow` mapping)
8. Close, lasso the next item, tap **-> Todoist** again to add another subtask under the same parent
9. Review shows OCR, due/priority (or a brackets hint), and any OCR corrections

## Setup

1. Create or choose a Todoist project for captures
2. Connect Supernote via USB
3. On first launch the plugin creates:
   - `/MyStyle/NoteTaskBot/notetaskbot-config.json`
4. Edit that file: set `apiToken` and `targetProjectId`
5. Build and install the `.snplg`

## Build

```powershell
# from home-base root
npm run snplg -- NoteTaskBot
# Output: dist/tasks/NoteTaskBot.snplg
```

Or from `plugins/tasks`:

```powershell
npm install
powershell -ExecutionPolicy Bypass -File .\build-native.ps1
# Output: build/outputs/NoteTaskBot.snplg
```

## Next

- On-device: grant Always allow for FILE:READ / FILE:WRITE / INTERNET, then retest capture
- Confirm parent title shows file name + folder breadcrumb from the note path
- Confirm `[tomorrow !!1]` and `[tommorrow I1]` set due + priority on the Todoist subtask
- Optional: config UI for token entry without USB
