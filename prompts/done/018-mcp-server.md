# Prompt 018: MCP-Server – KI steuert AppIconic

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 005, 009, 012 (sinnvoll nach 015) · Vorbild:
> editlicious 016 (`ed-mcp`, Sidecar + Brücke; Code darf mit Herkunftsvermerk übernommen werden) ·
> **Erst nach Freigabe durch Marc umsetzen.**

## Ziel

Eine KI (Claude Code, Claude Desktop o. ä.) steuert einen **laufenden** AppIconic über das Model Context Protocol:
Dokumente öffnen, lesen, Formen hinzufügen und ändern, Icon-Eigenschaften setzen, exportieren. Die KI benutzt
**dieselben serialisierbaren Commands und Aktionen** wie die UI (Architekturentscheidung vom 26.10.2026: Logik und
Geometrie bleiben im Frontend/SVG-DOM, Rust ist Brücke und Engine für Dateien/Export) – keine simulierten
Mausklicks. Jede KI-Änderung landet im Undo-Stack.

## Umfang

- **Architektur:** Sidecar-Binary `app-iconic-mcp` (Crate `ai-mcp` im Workspace, MCP über stdio, z. B. `rmcp`),
  verbindet sich über eine lokale Brücke (127.0.0.1 + Zufalls-Token in einer nur für den Nutzer lesbaren Datei im
  Config-Ordner, wie editlicious) mit der App; die App leitet Tool-Aufrufe als Ereignis an das Fenster des Ziel-
  dokuments weiter, das Frontend (`McpStore`) führt aus und antwortet mit Ergebnis oder Fehler.
- **Tools** (Namen und JSON-Schemas im Design festlegen):
  - Dokumente: `list_documents`, `new_document`, `open_document(path)`, `save_document(id, path?, format?)`,
    `activate_document(id)`
  - Lesen: `get_document(id)` (icon.json + Asset-Liste + Revision), `get_asset_svg(id, asset, max_chars)`,
    `get_tree(id)` (Hierarchie mit NodeRefs, Typ, Name, Swatches), `get_node(id, node)` (Attribute, Bounding-Box im
    Dokumentraum – vom Browser gemessen), `get_selection(id)`
  - Schreiben: `run_command(id, command)` mit dem serialisierten Command-Format (`{ type, …args }`, Schema aus dem
    Command-Katalog generiert), `run_action(id, actionId, args?)` (nur Aktionen aus dem Katalog, `list_actions`),
    `insert_svg(id, markup, target?)` (wie SVG-Snippet, bereinigt), `select(id, nodes)`
  - Ausgabe: `export_png(id, sizes, dir)`, `export_svg(id, dir)`, `render_preview(id, size)` (PNG als Base64 aus dem
    Export-Weg, damit die KI ihr Ergebnis sieht)
- **Nebenläufigkeit:** schreibende Aufrufe tragen die erwartete Revision; passt sie nicht → `revision_conflict` mit
  aktuellem Zustand. Jeder MCP-Aufruf ist eine Undo-Gruppe (Name z. B. „AI: Add Circle“).
- **Einstellungen (015):** „KI-Steuerung (MCP) erlauben“ – Standard **aus**; Konfig-Zeile zum Kopieren
  (`claude mcp add app-iconic -- <pfad>/app-iconic-mcp`); Statusanzeige „KI verbunden“, Aktion „KI trennen“.
- **Distribution:** Sidecar als `externalBin` (016), signiert wie die App.

## Sicherheit

- Brücke nur lokal, Token je App-Start, nur wenn die Einstellung an ist. Kein Shell-, kein beliebiger
  Dateisystemzugriff: Öffnen/Speichern/Export über dieselben geprüften Wege wie die Dialoge; Speichern an neue Pfade
  und Export optional mit Rückfrage im UI.
- Ausgaben begrenzt (`max_chars`, Anzahl Nodes), Markup aus der KI wird wie jedes fremde SVG bereinigt.

## Tests

- Rust: Protokoll App ↔ Sidecar (Token, Revision, Grenzen), Tool-Schemas als Snapshot.
- Frontend: `McpStore` führt Commands/Aktionen aus, Fehlerfälle, Undo-Gruppe.
- Integration: Sidecar über stdio mit einem Test-Client gegen die App im Browser-Modus/Xvfb.

## Akzeptanz

- Mit `claude mcp add …` kann Claude Code ein neues Icon anlegen, einen Kreis mit Verlauf hinzufügen, den
  Hintergrund setzen, eine Vorschau ansehen und als PNG exportieren; ⌘Z macht jeden KI-Schritt einzeln rückgängig.
- Ist die Einstellung aus, ist keine Brücke offen und das Sidecar meldet einen klaren Fehler.
