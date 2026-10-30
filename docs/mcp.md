# AI control (MCP)

AppIconic can be driven by an AI assistant such as Claude Code or Claude Desktop through the
[Model Context Protocol](https://modelcontextprotocol.io) (prompt 018). The AI uses the **same actions and document
commands** as menus, keyboard and command palette – it creates or opens icons, reads the hierarchy, adds shapes, sets
the background, looks at a rendered preview and exports. It never simulates mouse clicks, and **every AI call is one
undo step** (“Undo AI: Add Circle”).

## Turn it on

1. **Settings → AI control → “Allow AI control (MCP)”.** It is off by default; while it is off, AppIconic opens no
   port at all.
2. Copy the line shown there into a terminal (Claude Code), for example:

   ```bash
   # macOS
   claude mcp add app-iconic -- "/Applications/AppIconic.app/Contents/MacOS/app-iconic-mcp"
   # Linux (deb/rpm)
   claude mcp add app-iconic -- "/usr/bin/app-iconic-mcp"
   # Windows
   claude mcp add app-iconic -- "C:\Users\<you>\AppData\Local\AppIconic\app-iconic-mcp.exe"
   ```

   The settings show the exact path of your installation. `claude mcp add --scope user …` makes it available in
   every project.

3. **Claude Desktop** (and other MCP clients): add the program as a local (stdio) server in
   `claude_desktop_config.json` (Claude Desktop: Settings → Developer → Edit Config):

   ```json
   {
     "mcpServers": {
       "app-iconic": {
         "command": "/Applications/AppIconic.app/Contents/MacOS/app-iconic-mcp"
       }
     }
   }
   ```

   and restart Claude Desktop.

AppIconic must be running. The header shows **AI** while an assistant is connected – click it (or run _Disconnect
AI_, also in the settings) to cut every connection. A client that calls while AppIconic is closed or the setting is
off gets the clear error `not_running: AppIconic is not running, or AI control is off …`.

“Ask before the AI saves to a new place or exports” (on by default) shows a question in the window before the AI
writes a file anywhere but the document's own path. Turn it off for unattended scripts.

## What to ask

> Create a new icon with a dark blue background and an orange sun with a radial gradient in the middle, show me a
> preview and export it as PNG in 1024 and 64 px to ~/Desktop/icon.

The assistant then calls `new_document`, `run_action icon.setFill`, `insert_svg` (or `run_command` +
`run_action add.circle`), `render_preview` and `export_png`. Each of those steps can be undone with ⌘Z / Ctrl+Z.

## Tools

Documents are windows; their `id` is the window label (`"main"`, `"doc-2"`). Without `id` a tool works on the window
that was active last. Coordinates are icon units of the 1024 × 1024 canvas.

| Tool                                                                                                        |                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_documents`, `new_document`, `open_document(path)`, `activate_document(id)`                            | windows and documents; `new_document` reuses an untouched window; `open_document` may ask the user                                                          |
| `save_document(id?, path?, format?)`                                                                        | own file, or a new absolute path (`bundle` / `zip`, may ask the user)                                                                                       |
| `get_document(id?, icon_json?)`                                                                             | name, path, revision, undo step, selection, assets, groups/layers, `icon.json`                                                                              |
| `get_tree(id?, max_nodes?)`                                                                                 | the hierarchy with node refs `{asset, id}` (default 500 rows, at most 5 000); front-most first like the panel, `z` = paint order among siblings (0 = back)  |
| `get_node(id?, node)`                                                                                       | tag, attributes, text, children and the bounding box in icon units, measured by the browser                                                                 |
| `get_asset_svg(id?, asset, max_chars?, node_ids?)`                                                          | SVG source (default 20 000 characters, at most 200 000)                                                                                                     |
| `get_selection(id?)`, `select(id?, nodes)`                                                                  | selection                                                                                                                                                   |
| `list_actions(id?)`, `run_action(id?, action, args?, expected_revision?)`                                   | the actions of the app with their argument schemas, e.g. `add.circle {cx, cy, r, fill}`, `icon.setFill {fill}`, `properties.set {name, value}`, `edit.undo` |
| `run_command(id?, command, expected_revision?)`                                                             | one document command as JSON (`setAttributes`, `insertNode`, `setIconJsonValue`, `insertDefinition` …)                                                      |
| `insert_svg(id?, markup, parent?, index?, expected_revision?)`                                              | SVG markup like _Add › SVG Snippet_ – cleaned, centred                                                                                                      |
| `render_preview(id?, size?, appearance?, tint?, mask?)`                                                     | the icon as a PNG image (same renderer as the export)                                                                                                       |
| `export_png(id?, dir, sizes?, appearances?, mask?, effects?, tint?, overwrite?)`, `export_svg(id?, dir, …)` | exports into a folder (may ask the user)                                                                                                                    |
| `export_package(id?, dir, format, platforms?, appearances?, mask?, effects?, overwrite?, monochrome?, background_groups?)` | `appiconset` (Xcode `AppIcon.appiconset`), `icns`, `ico` (078), `android` (folder `android/`: adaptive icon, legacy, Play Store), `web` (folder `web/`: favicons, touch icon, PWA icons, manifest, snippet; 079) into a folder (may ask the user) |

`expected_revision` (from `get_document` or the answer of the last write) protects against changing a document that
was edited in between: the call fails with `revision_conflict` and the current state.

## Security

- `app-iconic-mcp` is a small program next to the app. It speaks MCP over stdio and forwards the calls to the running
  app over **127.0.0.1** with a random 256-bit key that changes at every start; port and key are in `mcp.json` in the
  app's config folder, readable only by your user. With the setting off there is neither a port nor that file.
- No shell and no file access of its own: opening, saving and exporting go through the same checked paths as the
  dialogs (absolute paths only). The app's file commands only take paths from trusted sources (dialogs, Open Recent,
  the system, drops – prompt 033); a path the AI names in `open_document`, `save_document` or `export_*` becomes one
  after the bridge checked it. Quitting, the system clipboard, dialogs of the window and changing AI control itself
  are not available to the AI.
- Everything the AI inserts is cleaned like any foreign SVG (no scripts, event handlers or external references).
  Answers are bounded (characters, rows, 8 MiB per answer). Document contents are never logged.

## For developers

- Code: crate `ai-mcp` (`src-tauri/mcp`: stdio server, bridge, tool schemas with the snapshot
  `tools.snapshot.json`), `src-tauri/src/mcp.rs` (router over the windows), `mcp_commands.rs` (Tauri),
  `src/app/features/mcp/` (tools in the window). Design: `prompts/done/018-mcp-server.design.md`.
- Development: `pnpm mcp:sidecar:dev` builds `src-tauri/target/debug/app-iconic-mcp` next to the debug app.
  Releases: `node scripts/mcp-sidecar.mjs [<target triple>]` puts the sidecar into `src-tauri/binaries/`, and
  `tauri build --config src-tauri/tauri.sidecar.conf.json` bundles it (`bundle.externalBin`, prompt 030).
- End to end: `node scripts/mcp-e2e.mjs <sidecar> <out-dir>` drives a running AppIconic (AI control on) through the
  sidecar; `--expect-off` checks the error when it is off.
