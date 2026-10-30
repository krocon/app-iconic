# AI control (MCP)

AppIconic can be driven by an AI assistant such as Claude Code or Claude Desktop through the
[Model Context Protocol](https://modelcontextprotocol.io) (prompt 018). The AI uses the **same actions and document
commands** as menus, keyboard and command palette – it creates or opens icons, reads the hierarchy, adds shapes, sets
the background, looks at a rendered preview and exports. It never simulates mouse clicks, and **every AI call is one
undo step** (“Undo AI: Add Circle”).

## Turn it on

1. **Settings → AI control → “Allow AI control (MCP)”.** It is off by default; while it is off, AppIconic opens no
   port at all.
2. **Claude Desktop or Cursor – one click (prompt 086):** in the same tab under “Connect an AI app” choose the app
   and press **Set Up…**. AppIconic shows the change of the app's configuration file as a diff and writes it only
   after **Apply** – the other servers and settings in the file stay, the old file is kept as a backup copy next to
   it (`<name>.app-iconic-<time>.bak`), and the file is replaced atomically. **Remove…** takes the entry out the same
   way. Quit and restart Claude Desktop afterwards (Cursor reloads `mcp.json` by itself or after a restart).

   | App            | Configuration file (from the official docs)                                                                    |
   | -------------- | -------------------------------------------------------------------------------------------------------------- |
   | Claude Desktop | macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows `%APPDATA%\Claude\claude_desktop_config.json`, Linux `~/.config/Claude/claude_desktop_config.json` |
   | Cursor         | `~/.cursor/mcp.json` (all systems; the global file, not the one of a project)                                  |

   The entry is

   ```json
   {
     "mcpServers": {
       "app-iconic": {
         "command": "/Applications/AppIconic.app/Contents/MacOS/app-iconic-mcp"
       }
     }
   }
   ```

   (Cursor additionally `"type": "stdio"`). A configuration file with **comments** or a syntax error is not plain
   JSON: AppIconic reports it and does not touch it – fix it by hand or add the entry yourself. The paths are fixed
   in the app; nothing from the window can choose another file.

3. **Claude Code:** copy the line shown there into a terminal, for example:

   ```bash
   # macOS
   claude mcp add app-iconic -- "/Applications/AppIconic.app/Contents/MacOS/app-iconic-mcp"
   # Linux (deb/rpm)
   claude mcp add app-iconic -- "/usr/bin/app-iconic-mcp"
   # Windows
   claude mcp add app-iconic -- "C:\Users\<you>\AppData\Local\AppIconic\app-iconic-mcp.exe"
   ```

   The settings show the exact path of your installation. `claude mcp add --scope user …` makes it available in
   every project. Other MCP clients: start that program as a local (stdio) server.

4. **Test Connection** starts the helper program like an AI app does, runs the MCP handshake (`initialize`,
   `tools/list`) and asks the app for its documents – with a time limit of 5 s per step. It tells you whether the
   helper program is missing, does not answer, or works but AI control is off.

AppIconic must be running. The header shows **AI** while an assistant is connected. Click it (_AI History_) for the
last AI calls of this window – time, tool, what (action id, command type, format – never contents), result or error
code. While the step of a call is the last one in the undo history, **Undo** takes exactly that call back. The
history is kept only in memory (50 calls per window); _Clear AI History_ empties it. _Disconnect AI_ (in that
popover and in the settings) cuts every connection; the badge stays, dimmed, as long as there is a history. A client that calls while AppIconic is closed or the setting is
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
| `find_symbols(id?, query?, set?, limit?)`                                                                   | symbols of `lucide`, `tabler`, `phosphor` and the user's own (`mine`) by name and tags (default 40, at most 200; empty query = recently used) → `{set, id, name}` for `run_action add.symbol {set, id, size?, weight?, stroke?, x?, y?}` (084). Saving the selection (`symbols.save {name, tags?}`) and renaming are allowed; deleting own symbols and folder import/export are not |
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
  `tools.snapshot.json`, `probe` = connection test), `src-tauri/src/mcp.rs` (router over the windows),
  `mcp_commands.rs` (Tauri), `mcp_setup_commands.rs` + `ai-core` `mcp_clients` (setting up Claude Desktop/Cursor),
  `src/app/features/mcp/` (tools in the window, history, setup). Design: `prompts/done/018-mcp-server.design.md`,
  `prompts/done/086-ki-einrichtung-verlauf.design.md`.
- Development: `pnpm mcp:sidecar:dev` builds `src-tauri/target/debug/app-iconic-mcp` next to the debug app (also the
  one `pnpm tauri dev` runs) – setting up and the connection test use exactly that program; without it they say so.
  Releases: `node scripts/mcp-sidecar.mjs [<target triple>]` puts the sidecar into `src-tauri/binaries/`, and
  `tauri build --config src-tauri/tauri.sidecar.conf.json` bundles it (`bundle.externalBin`, prompt 030).
- End to end: `node scripts/mcp-e2e.mjs <sidecar> <out-dir>` drives a running AppIconic (AI control on) through the
  sidecar; `--expect-off` checks the error when it is off.
