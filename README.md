# NoteTaskBot

Capture handwritten items from Supernote notes and send them to Todoist as subtasks under a parent named for the note’s file and folder path.

This is a standalone Supernote plugin repo. The plugin package identity is **NoteTaskBot** (Android package, `.snplg` name). Offline Supernote SDK docs and extracted TypeScript live under [`sdk-reference/`](sdk-reference/) — reference only, not a runtime dependency.

## Origins

This standalone repo was developed from scratch, using scaffolding and extracted SDK/plugin tools from [apclark31](https://github.com/apclark31).

## Flow

1. Write an item in a note
2. Lasso the handwriting
3. Tap **-> Todoist** in the lasso menu
4. The plugin OCRs your writing and uses **`File Name | Local Relative Path | page N`** as the parent task (one parent per note page), e.g. `RTL | Note>CHP - Professional>Service Weeks>8-24-26 CON | page 3`
5. The lasso text becomes **one subtask**, with location appended (page lives on the parent):
   - Example: `Call dentist @ | upper |`
   - Location is an estimated vertical quarter of the page: `top`, `upper`, `lower`, or `bottom`
6. Optional markup in the lasso is parsed into Todoist fields (stripped from the title). Prefer **brackets**:
   - Write: `Call dentist [tomorrow !!1]`
   - Title becomes: `Call dentist @ | upper |` with due tomorrow and priority p1
   - Due: `tomorrow`, `next Monday`, `Aug 30`, `every week`, …
   - Priority: `!!1`–`!!4` (highest → lowest), `p1`–`p4`, or inside brackets OCR-ish `I1` / `l1`
   - Outside brackets, misspellings like `tommorrow` and `l1` are left in the title (no AI rewrite)
7. Close the plugin, lasso the next item, tap **-> Todoist** again — that adds another subtask under the same note parent
8. If the parent was deleted before subtasks finish syncing, the plugin creates a new parent and places the subtask there
9. On the review screen, tap **Add context** to attach a PNG of the current page as a comment on the parent
10. Or open the plugin tab and tap **add context -> Todoist** to attach the current page without lassoing
11. A review screen shows OCR text, due/priority (or a hint to use `[brackets]`), and any OCR corrections applied

## Requirements

- Supernote with plugin support
- Wi-Fi for Todoist API
- A Todoist project where captured tasks should be created
- Todoist API token

## Token and project setup

NoteTaskBot uses its **own** config file (separate from SuperTask):

`/MyStyle/NoteTaskBot/notetaskbot-config.json`

On first run, the plugin creates a template with `YOUR_TOKEN_HERE`. Edit via USB:

```json
{
  "apiToken": "your_todoist_token_here",
  "targetProjectId": "your_todoist_project_id"
}
```

Set `targetProjectId` to the Todoist project where tasks should be generated. In Todoist, pick the project by its title, then use that project's `project_id` (from the project URL or the Todoist API). Example URL form: `https://app.todoist.com/app/project/<project-name>-<project_id>` — the trailing id segment is what goes in `targetProjectId`.

If SuperTask is already configured on the same device, newer builds can reuse that token automatically (fallback reads `MyStyle/SuperTask/supertask-config.json`). You still need to set `targetProjectId` for NoteTaskBot.

Get your token at [Todoist Developer Settings](https://todoist.com/app/settings/integrations/developer).

## Build (requires native module)

NoteTaskBot uses `react-native-fs` for config storage. Use the **native** build on Windows:

```powershell
npm install
powershell -ExecutionPolicy Bypass -File .\build-native.ps1
```

The output `.snplg` should be ~7 MB (includes `app.npk`). A ~260 KB build is JS-only and **cannot read your config file**.

Copy `build/outputs/NoteTaskBot.snplg` to `MyStyle/` on the device, then install via Settings > Apps > Plugins.

On first capture after this build, the device will prompt for **file read**, **file write** (MyStyle config), and **internet**. Choose **Always allow** if you want capture to work after closing the plugin. "Allow this time only" expires when the plugin UI closes.

Parent page numbers follow the host SDK (1-based). Official plugin docs for this firmware live in [`Plugin-Assets/`](Plugin-Assets/) (see [`SDK-Release-Notes.md`](Plugin-Assets/SDK-Release-Notes.md)).

## Troubleshooting

| Symptom | Likely cause | Fix |
|--------|----------------|-----|
| "No Todoist API token" | Config not edited or JS-only build | Set token in `notetaskbot-config.json`, or rebuild with `build-native.ps1` |
| "Permission required: plugin.permission.…" | User denied host permission, or chose "this time only" then closed the plugin | Re-lasso, tap Retry, and choose Always allow |
| "Could not recognize handwriting" | OCR failed | Lasso again with clearer writing; check Log screen |
| "Todoist 401" | Invalid/expired token | Regenerate token in Todoist developer settings |
| First lasso text still showing / second circle does nothing | Plugin UI stayed mounted, or the same strokes were replayed | Rebuild v0.3.0+: close the review, lasso **new** strokes, tap **-> Todoist**. Each press starts a fresh capture. |
| Success on device but no tasks in Todoist | Wrong project or viewing subtasks | Open the Todoist project you set as `targetProjectId` and look for a parent named like the **note file**. Subtasks are nested under it, each ending with `@ | <quarter> |` |
| Due/priority not applied | OCR missed the phrase, or date misspelled outside brackets | Put markup in `[brackets]`: `[tomorrow !!1]` or `[p1]`. Inside brackets, common OCR typos (`tommorrow`, `I1`) are mapped. Check the review panel |
| Plugin crashes on open | Installed JS-only build without RNFS | Rebuild with `build-native.ps1` and reinstall |

## Debug

```bash
node dev-server.js
```

Add `debugServerUrl` in a local `config.local.js` (gitignored) for log streaming during development. See `config.local.example.js`.

## SDK reference

| Path | Purpose |
|------|---------|
| [`sdk-reference/CLAUDE.md`](sdk-reference/CLAUDE.md) | Development practices, SDK patterns, Todoist notes |
| [`sdk-reference/SDK-REFERENCE.md`](sdk-reference/SDK-REFERENCE.md) | API reference notes |
| [`sdk-reference/official-docs-extracted.md`](sdk-reference/official-docs-extracted.md) | Ratta official docs dump |
| [`sdk-reference/src/`](sdk-reference/src/) | Extracted `sn-plugin-lib` TypeScript source |
| [`Plugin-Assets/`](Plugin-Assets/) | Official Ratta plugin docs dump + SDK release notes |
