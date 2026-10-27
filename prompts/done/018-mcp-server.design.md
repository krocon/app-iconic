# Design 018: MCP-Server – KI steuert AppIconic

Status: umgesetzt · Datum: 27.10.2026 · Freigabe: Marc, 27.10.2026 („mache bitte auch noch Prompt 018“)

Vorbild: editlicious 016 (`ed-mcp`: Sidecar, Brücke, eigene JSON-RPC-Schicht; `src-tauri/src/mcp.rs`,
`features/mcp/mcp.store.ts`, `scripts/mcp-sidecar.mjs`, `docs/mcp.md`). Übernommen mit Herkunftsvermerk und auf
AppIconic zugeschnitten. **Der große Unterschied:** in editlicious liegen die Dokumente in Rust, hier im Frontend
(001 E8). Die App leitet deshalb jeden Dokument-Aufruf an das Fenster des Dokuments weiter und wartet auf dessen
Antwort.

## Ausgangslage

- Serialisierbare Commands (`CommandJson`, Registry `commandFromJson`, `DocumentStore.runCommand`, 005 E15),
  Aktionen mit Argument-Schemas (`ActionService.run(id, args)`, `describe()`, 005 E3; Argumente aus 006–015).
- Ein Dokument je Fenster, Labels `main` / `doc-<n>` (003 E8, `windows.rs`), Fenster zeigt Pfad (`DocWindows`).
- Export-SVG im Frontend, PNG in Rust mit resvg (012), Einstellungen in Rust mit Patches (015).

## Entscheidungen

| Nr. | Entscheidung | Begründung |
|---|---|---|
| E1 | **Sidecar + Brücke wie editlicious:** Binary `app-iconic-mcp` (Crate `ai-mcp`, `src-tauri/mcp`, nur `serde`/`serde_json`) spricht MCP über **stdio** und leitet Tool-Aufrufe über TCP **127.0.0.1** an die laufende App. Endpunkt-Datei `<Config>/mcp.json` (`{port, token, pid}`, Unix 0600, neu angelegt, beim Beenden gelöscht), **256-Bit-Token je Start**, erste Zeile = Token | gleiche, erprobte Architektur; Brücke ohne Abhängigkeit auf allen drei Systemen |
| E2 | **Eigene JSON-RPC-Schicht statt `rmcp`** (initialize, ping, tools/list, tools/call; Versionen 2025-06-18, 2025-03-26, 2024-11-05; Notifications ohne Antwort; Batches) | wie editlicious 016 E2: kein Tokio/Makro-Baum im Sidecar, vollständig getestet. Abweichung vom Prompt („z. B. `rmcp`“) |
| E3 | **Brückenserver in `ai-mcp::host`** (generisch über `Handler`), Aufbau/Abbau aus der App (`mcp_commands.rs`). Die App startet ihn **in Rust**, sobald die Einstellung `mcp.enabled` an ist (beim Start nach dem Laden der Einstellungen und nach jedem `save_settings`/`reset_settings`) und stoppt ihn beim Ausschalten (Port zu, Datei weg, Verbindungen getrennt) | „Ist die Einstellung aus, ist keine Brücke offen“ hängt nicht an einem Fenster; mehrere Fenster schalten nichts doppelt |
| E4 | **Router in Rust, Ausführung im Fenster:** `mcp.rs` (rein, über das Trait `WindowHost`, Tests mit Fake) prüft und begrenzt die Argumente, bestimmt das Zielfenster (`id` = Fenster-Label; ohne `id` das zuletzt fokussierte Dokumentfenster) und schickt den Aufruf als Ereignis `mcp-call { callId, tool, args }` **nur an dieses Fenster**; dessen `McpStore` führt aus und antwortet mit `mcp_reply(callId, result \| error)`. Der Brücken-Thread wartet mit Zeitlimit (Standard 30 s; Speichern/Export 300 s, weil sie im UI nachfragen können) → `timeout`. Ein geschlossenes Fenster beendet seine offenen Aufrufe mit `unknown_document` | die Logik bleibt im Frontend (001 E8, KI-Regel); Rust ist Brücke, Fenster- und Dateiverwaltung |
| E5 | **Bereit-Meldung:** jedes Fenster meldet nach dem Start seines Dokuments `mcp_ready`; neue Fenster (`new_document`, `open_document`) werden erst nach dieser Meldung angesprochen (höchstens 20 s) | sonst ginge der erste Aufruf an eine WebView ohne Zuhörer verloren |
| E6 | **Dokument-Id = Fenster-Label** (`"main"`, `"doc-3"`) | ein Dokument je Fenster (003 E8); Ids bleiben gültig, solange das Fenster lebt, und sind die, die Rust ohnehin kennt |
| E7 | **Tools** (Namen, Schemas: `ai-mcp/src/tools.rs`, Schnappschuss `src-tauri/mcp/tools.snapshot.json`): Dokumente `list_documents`, `new_document`, `open_document(path)`, `save_document(id?, path?, format?)`, `activate_document(id)`; Lesen `get_document(id?, icon_json?)`, `get_asset_svg(id?, asset, max_chars?)`, `get_tree(id?, max_nodes?)`, `get_node(id?, node)`, `get_selection(id?)`; Schreiben `run_command(id?, command, expected_revision?)`, `list_actions(id?)`, `run_action(id?, action, args?, expected_revision?)`, `insert_svg(id?, markup, parent?, index?, expected_revision?)`, `select(id?, nodes)`; Ausgabe `export_png(id?, dir, sizes?, appearances?, mask?, effects?, overwrite?)`, `export_svg(id?, dir, …)`, `render_preview(id?, size?, appearance?, mask?)` | Prompt; Argumentnamen in snake_case wie MCP-üblich, Inhalte (Commands, NodeRefs, Aktionsargumente) in der App-Form |
| E8 | **`render_preview`**: das Fenster baut das Export-SVG (012, Appearance `light`/`dark`, Maske Standard `squircle`, Effekte aus), **Rust rendert** es mit resvg (`ai_core::export::png::png_base64`, 16…1024 px, Standard 512) und gibt es als MCP-**Bildinhalt** (`{"type":"image","mimeType":"image/png","data":…}`) plus Text zurück | gleicher Export-Weg wie „Export PNG“; das PNG geht nur einmal über eine Grenze (Rust → Sidecar) |
| E9 | **Nebenläufigkeit:** schreibende Tools (`run_command`, `run_action`, `insert_svg`) nehmen `expected_revision` (aus `get_document`/jeder Schreibantwort); passt sie nicht → `revision_conflict`, die Meldung enthält den aktuellen Zustand (Revision, Name, Auswahl). Jede Schreibantwort nennt die neue `revision`, die Auswahl und den Undo-Namen | Prompt; die KI sieht, was passiert ist |
| E10 | **Undo-Gruppe je Aufruf:** `McpStore` merkt sich den Undo-Stand vor dem Aufruf (`DocumentStore.undoMark()`) und fasst danach alle neuen Schritte zu **einem** zusammen (`groupSince(mark)` → `AiCommand` um den Schritt bzw. ein `composite` mit dem Namen des ersten Schritts). Menü/Knopf zeigen „Undo AI: Add Circle“ (deutsch „Widerrufen: KI: Kreis hinzufügen“). Ein Save-Punkt mitten in der Gruppe wird unerreichbar (dirty bleibt richtig) | Prompt („AI: Add Circle“); ⌘Z macht jeden KI-Schritt einzeln rückgängig, egal wie viele Commands eine Aktion intern braucht |
| E11 | **Asynchrone Aktionen:** `ActionHandler.run` darf ein Promise liefern; `ActionService.runAsync(id, args)` wartet darauf. Die Handler, die Arbeit anstoßen (Datei, Add, Clip, Edit, Properties, Export …), geben ihr Promise zurück statt es mit `void` zu verwerfen | die Undo-Gruppe und die Antwort kommen erst nach dem Ende der Aktion (z. B. `add.textToPath` fragt Rust) |
| E12 | **`run_action` mit Sperrliste:** Beenden, Fenster/Datei-Dialoge und Speichern/Export (`app.quit`, `app.focusMenu`, `app.palette`, `file.*` außer `file.importSvg`… → alle `file.*`), Zwischenablage (`edit.cut/copy/paste/copyXml`, `icon.copyJson` – liest/schreibt die System-Zwischenablage), `settings.reset`, `settings.set` mit Schlüssel `mcp.*`, Halte-/Tastatur-Aktionen (`canvas.panHold`, `hierarchy.*`), `mcp.*`. Datei und Export laufen nur über die eigenen Tools (mit Pfadprüfung und Rückfrage). `list_actions` zeigt nur Erlaubtes, mit `enabled` und Argument-Schema | kein Shell-/Dateisystem-Zugriff am geprüften Weg vorbei; die KI kann sich die Erlaubnis nicht selbst geben |
| E13 | **Dateien:** `open_document`/`save_document`/`export_*` nehmen nur **absolute** Pfade (Rust prüft wie `file_path`), laufen über dieselben Commands wie die Dialoge (`open_icon`, `save_icon`, `export_png` …). Einstellung `mcp.confirmFiles` (Standard **an**): Speichern an einen **neuen** Pfad und jeder Export fragen im Fenster („Allow the AI to save …?“); Nein → `denied`. Speichern an den eigenen Pfad fragt nicht | Prompt („optional mit Rückfrage im UI“); sicherer Standard, für Skripte abschaltbar |
| E14 | **`open_document`:** schon offen → Fenster nach vorn; sonst ein unberührtes neues Dokument (wie „Open“, 003 E8) bzw. ein neues Fenster, das die Datei lädt; Fehler kommen als `FsError`-Code zurück (ohne Fehlerdialog), ein dafür geöffnetes Fenster schließt wieder. **`new_document`:** ein unberührtes Fenster wird wiederverwendet, sonst neues Fenster | wie die Menüs; keine leeren Zusatzfenster |
| E15 | **Grenzen:** `get_asset_svg.max_chars` 1…200 000 (Standard 20 000), `get_tree.max_nodes` 1…5 000 (Standard 500), Attribute in `get_node` je Wert ≤ 2 000 Zeichen, `insert_svg.markup` ≤ 1 MiB, `command` ≤ 4 MiB (Rust prüft vor dem Weiterleiten), Antwort eines Fensters ≤ 8 MiB, Brückenzeile ≤ 16 MiB. Markup der KI wird wie jedes fremde SVG bereinigt (Registry + Snippet-Weg, 003 E4/008 E9) | Prompt; ein großes Asset geht nie ganz über die Brücke |
| E16 | **Einstellungen:** `mcp: { enabled: false, confirmFiles: true }` in `settings.json` (Rust + TS + `settings-cases.json`); Abschnitt „AI control (MCP)“ im Settings-Dialog: Schalter, Rückfrage-Schalter, Konfig-Zeile `claude mcp add app-iconic -- "<Pfad>"` mit „Copy“, Status („Not connected“ / „AI connected (n)“), Knopf „Disconnect AI“ (Aktion `mcp.disconnect`). Kopfzeile des Fensters zeigt „AI“ solange verbunden. `settings.set` darf `mcp.*` nicht über die KI ändern (E12) | Prompt; Status wie editlicious E9 |
| E17 | **Sidecar-Pfad:** neben dem App-Programm (`current_exe().parent()/app-iconic-mcp[.exe]`); fehlt er (Dev-Build ohne `pnpm mcp:sidecar --dev`), zeigt der Dialog „sidecar missing“ ohne Zeile | Distribution über `bundle.externalBin` legt ihn genau dorthin |
| E18 | **Distribution vorbereitet:** `scripts/mcp-sidecar.mjs` (aus editlicious: Release-Build je Target-Triple nach `src-tauri/binaries/app-iconic-mcp-<triple>[.exe]`, universal macOS per `lipo`, `--dev` baut neben die Debug-App) + `src-tauri/tauri.sidecar.conf.json` (`bundle.externalBin`). Der Alltag (`tauri dev`, CI) bleibt ohne Sidecar-Konfiguration; die Release-Pipeline (016) nimmt sie mit `--config` dazu | Prompt: Pipeline selbst ist 016 |
| E19 | **Browser-Modus/Tests:** `FakeMcpApi`; der Test-Hook `window.__appIconic.mcp(tool, args)` ruft dieselbe Ausführung wie ein Brückenaufruf (Playwright prüft `get_node`-BBox, Undo-Gruppe, Revision im echten DOM). Ende-zu-Ende: `scripts/mcp-e2e.mjs` startet das Sidecar über stdio gegen die echte App unter Xvfb | Geometrie braucht Layout (004 E16); der echte Weg einmal komplett |

## Verträge

### Sidecar ↔ App (Brücke, `ai-mcp::bridge`)

```text
→ {"token":"<64 hex>"}                       ← {"ok":true|false}   (falsch → Verbindung zu)
→ {"id":7,"tool":"get_tree","args":{…}}       ← {"id":7,"result":…} | {"id":7,"error":{"code","message"}}
```

### App → Fenster

```text
Ereignis mcp-call (nur an das Ziel-Label) { callId: u64, tool: string, args: object }
Command  mcp_reply(callId, result?, error?: { code, message })
Command  mcp_ready()                    Fenster hat sein Dokument und hört zu
Command  mcp_info() → McpInfo { enabled, connections, sidecar: string | null }
Command  mcp_disconnect()               alle Verbindungen trennen (Port bleibt)
Ereignis mcp-status (an alle) McpInfo
```

Fenster-interne Tools (nicht in `tools/list`): `describe` → `DocSummary`, `open { path }`, `discard`,
`preview_svg { appearance, mask }` → `{ svg }`.

### DTOs (JSON)

```ts
DocSummary { id, name, path: string|null, format, dirty, pristine, revision, undo: string|null, active? }
NodeRef { asset: string, id: string }            // id = data-ai-id
TreeEntry { kind: 'root'|'group'|'layer'|'defs'|'node', label, depth, ref?, item?, tag?, fill?, stroke?,
            hidden, clip? }
WriteResult { revision, undo: string|null, selection: NodeRef[] }
```

### Fehlercodes (neu, Rust `error.rs` + `fs-error.ts` + `describeFsError`)

`revision_conflict`, `unknown_document`, `invalid_request`, `timeout`, `denied`, `unavailable` (Aktion nicht
erlaubt/aktiviert, Argumente falsch). Nur im Sidecar: `not_running` (App aus oder Steuerung aus).

### Frontend

```ts
abstract class McpApi { info(); ready(); reply(callId, result | error); disconnect();
                        onCall(fn); onStatus(fn) }
class McpStore (Root) { info: Signal<McpInfo>; connected: Signal<boolean>; start(destroyRef);
                        execute(tool, args): Promise<unknown>  // wirft {code, message}
                        command(): string; disconnect() }
DocumentStore.undoMark(): number; DocumentStore.groupSince(mark): boolean
ActionService.runAsync(id, args?): Promise<boolean>
```

## Tests

- `ai-mcp`: Token/Endpunkt-Datei (Rechte 0600), JSON-RPC-Sitzung wie Claude Code (initialize mit
  Versionswahl, Notification, tools/list, tools/call ok/Fehler/Bild, unbekanntes Tool/Methode, ping, Parse-Fehler),
  Tool-Schemas als Schnappschuss, Client gegen Testserver (falsches Token, App fehlt → `not_running`), Host:
  Token, Zeilen über der Grenze, Status-Zähler.
- App (`mcp.rs` mit Fake-`WindowHost`): Weiterleitung an das richtige Fenster, Standardfenster, unbekannte Id,
  Grenzen (`max_chars`, `max_nodes`, `markup`, `size`), absolute Pfade, `open_document` (offen → nach vorn,
  unberührt → dort, sonst neues Fenster, Fehler schließt es), `new_document` (Wiederverwendung), `render_preview`
  (PNG-Signatur), Zeitlimit, Sidecar-Client gegen den echten Brückenserver.
- Frontend (`McpStore`, Vitest + Fakes): `run_command` als ein Undo-Schritt mit „AI:“, mehrere Commands in einer
  Aktion = ein Schritt, `revision_conflict`, `run_action` (Sperrliste, deaktiviert, Argumente), `insert_svg`
  bereinigt, `get_tree`/`get_asset_svg` begrenzt, `select` mit unbekannter Node, Rückfrage bei Speichern/Export,
  Antwort an die Brücke; `UndoService.groupSince` (Save-Punkt).
- Playwright: über den Test-Hook Kreis mit Verlauf + Hintergrund, `get_node`-BBox im Dokumentraum, Undo je Schritt.
- Ende-zu-Ende (Xvfb): `scripts/mcp-e2e.mjs`.

## Fragen an Marc

1. **Rückfrage bei Datei-Zugriffen (E13) standardmäßig an** – für Skripte abschaltbar. Passt das, oder lieber aus?
2. **Dokument-Id = Fenster-Label** (`main`, `doc-2`) statt Zahlen wie in editlicious – ok?
3. **macOS:** `claude mcp add app-iconic -- "/Applications/AppIconic.app/Contents/MacOS/app-iconic-mcp"` einmal mit
   Claude Code/Claude Desktop prüfen (im Container nur Linux); Signierung des Sidecars kommt mit 016.
4. Sperrliste (E12): Zwischenablage für die KI gesperrt – gewünscht?

## Fortschritt

- [x] Design
- [x] Rust: `ai-mcp` (Brücke, Server mit Bildinhalt, Tools + Schnappschuss, Client, Host), Router `mcp.rs`,
      `mcp_commands.rs`, Einstellung `mcp`, Fehlercodes, `preview_base64`
- [x] Frontend: McpApi + Fake, McpStore, McpTools, mcp-read, mcp-policy, `UndoService.groupSince` + `AiCommand`,
      `ActionService.runAsync`, `FilesService.openQuietly/saveQuietly`, Abschnitt „AI control“, KI-Badge, Test-Hook
- [x] Playwright `e2e/mcp.spec.ts`, Ende-zu-Ende unter Xvfb (`scripts/mcp-e2e.mjs`)
- [x] Doku (`docs/mcp.md`, architecture, FEATURES, CLAUDE.md, README)

## Ende-zu-Ende (27.10.2026, Container, Debug-App unter Xvfb, Sidecar über stdio)

`scripts/mcp-e2e.mjs` gegen die laufende App (Einstellung an, Rückfrage aus): initialize, `tools/list` (18),
`list_documents`, `new_document` (unberührtes `main` wiederverwendet), `icon.setFill` („Undo AI: Change
Background“), Kreis mit Radialverlauf über `insert_svg` („Undo AI: Add SVG Snippet“), `get_tree`, `get_node` (BBox
640 × 640 vom Browser gemessen), veraltete Revision → `revision_conflict`, `render_preview` (PNG als Bildinhalt),
`export_png` 1024 + 64 px, zweimal `edit.undo` → je ein KI-Schritt zurück, nichts übrig; Redo, `save_document` als
ZIP. Danach: Einstellungsdialog zeigt „AI connected“, Konfig-Zeile, Badge „AI“; Schalter aus → `mcp.json` weg,
Sidecar meldet `not_running: AppIconic is not running, or AI control is off …`. Wieder an: `new_document` bei
geändertem Dokument öffnet `doc-1` und wartet auf dessen Bereitschaft; `open_document` einer offenen Datei holt das
Fenster nach vorn, eine fehlende Datei → `not_found`, das dafür geöffnete Fenster schließt wieder.

## Abweichungen und Hinweise

- Eigene JSON-RPC-Schicht statt `rmcp` (E2) – wie editlicious, keine neue Abhängigkeit.
- `get_asset_svg` hat zusätzlich `node_ids` (die internen Ids, die `get_tree` verwendet).
- Die Tools tragen `expected_revision` statt eines Pflichtfelds; ohne Angabe wird nicht geprüft (wie editlicious).
- Die Release-Pipeline (Sidecar bauen, signieren, `--config src-tauri/tauri.sidecar.conf.json`) ist Prompt 016;
  hier vorbereitet und getestet sind Skript und Konfiguration.
- Die Claude-Code-Dokumentation (`docs.anthropic.com/en/docs/claude-code/mcp`) war in der Sitzung nicht abrufbar;
  `docs/mcp.md` nutzt die übliche Form `claude mcp add <name> -- <Programm>` und `mcpServers` in
  `claude_desktop_config.json` – bitte einmal mit der aktuellen Doku abgleichen.
