# Prompt 003: Dokumentmodell, Undo und Dateien im Frontend

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 002 · Meilenstein 2/3 aus `000-init.md` ·
> legacy §1, §3, §4, §12

## Ziel

Ein geöffnetes `.icon` lebt im Frontend als **ein** Dokument: `icon.json` (als `Value` + typisierte Zugriffe) und je
SVG-Asset ein eigenes `SVGSVGElement` (per `DOMParser` geparst). Alle Änderungen laufen über benannte Commands mit
Undo/Redo. Dazu die Datei-Abläufe: Neu, Öffnen, Zuletzt benutzt, SVG importieren, Speichern, Speichern unter,
Schließen – mit Dirty-Tracking, Fenstertitel und mehreren Fenstern. Kein God-Object: kleine Services.

## Umfang

### Dokument (`app/features/document/`)
- `IconDocument` (rein, testbar): `iconJson`, `assets: Map<name, AssetState { kind, svg?: SVGSVGElement, png?, dirty }>`,
  Pfad, Format, `revision`. Zugriffe auf Gruppen/Layer über kleine Helfer in `model/icon-json.ts`, die unbekannte
  Felder nie anfassen.
- **Node-IDs:** beim Laden bekommt jedes Element eines Assets `data-ai-id` (stabil, eindeutig je Dokument); beim
  Serialisieren (`serializeAsset`) werden alle `data-ai-*` entfernt. Ein `NodeRef { asset, id }` adressiert Nodes;
  nie DOM-Referenzen in Stores halten, die ein Undo überleben müssen.
- **SVG-Bereinigung** beim Laden/Import/Einfügen (`sanitize-svg.ts`): `<script>`, `on*`-Attribute, `<foreignObject>`,
  externe `href` (nur `#…` und `data:image/…` erlaubt) entfernen und als Warnung melden. Fixture-Tests.
- Inline-`<style>` und Klassen beim **Import** in Attribute auflösen (über `getComputedStyle` eines unsichtbaren
  Hosts oder eine schmale Regel-Auflösung – Design entscheidet), Einheiten (px, %, em) normalisieren. Beim **Öffnen**
  eines `.icon` nichts umschreiben (Roundtrip).
- `DocumentStore` (je Dokument, nicht root): Signals `document`, `selection: NodeRef[]`, `dirty`, `canUndo/Redo`,
  `undoLabel/redoLabel`; `execute(command)`.
- `UndoService`: Command-Pattern `{ label, do(doc), undo(doc) }`, zusammengesetzte Commands (Gruppe), **Coalescing**
  (`begin(label)` … `update()` … `commit()`/`cancel()` für Gesten, 007), Save-Punkt für Dirty. Aktionsnamen wie
  legacy §12 („Undo Move Node“, „Undo Change Attribute“ …) über einen Textkatalog.
- Basis-Commands: `SetAttribute`, `RemoveAttribute`, `InsertNode`, `RemoveNode`, `MoveNode`, `ReplaceAssetMarkup`,
  `SetIconJsonValue(path, value)`, `AddGroup`/`RemoveGroup`/`MoveGroup`, `AddLayer`/`RemoveLayer`. Jeder Command
  mit Test „do → undo → identisch serialisiert“.

### Dateien (`app/features/files/`)
- `FilesService`: New (⌘N), Open (⌘O), Open Recent (validiert, „Clear Menu“, max. 10, in Rust `recent.json` über
  `config_file`), Import SVG (⇧⌘I: neue Gruppe + Layer + Asset mit eindeutigen Namen), Save (⌘S, nur wenn dirty),
  Save As (⇧⌘S, Format wählbar Bundle/ZIP), Close (⌘W). Dirty-Abfrage **Save / Don't Save / Cancel** als
  `AskService` (Promise-Dialog wie editlicious `shared/ask`).
- Fenstertitel `<Name>` + Marker (macOS: `set_document_edited`, sonst `• ` vor dem Namen) über einen Command
  `set_window_title`.
- **Mehrere Fenster:** New Window (⇧⌘N) öffnet ein Fenster `doc-<n>` (Rust `open_document_window`); jedes Fenster
  hat genau ein Dokument. Beim Schließen des letzten Fensters: macOS bleibt die App offen (Menü), sonst Ende.
  Schließen mit ungespeicherten Änderungen fragt (Tauri `CloseRequested` → Frontend).
- Browser-Modus (`pnpm start`): `FakeIconFileApi` mit In-Memory-Dateien und Fixture `camscanner.icon`, damit
  Playwright Öffnen/Bearbeiten/Speichern testen kann.

### Rust
- `recent_files` (Liste laden/speichern/validieren), `set_window_title`, `open_document_window`, Close-Requested-
  Ereignis. Alles `async`.

## Tests

- Vitest: `IconDocument`, alle Commands (do/undo/redo, Coalescing, Gruppen), Dirty am Save-Punkt, `sanitize-svg`
  mit bösartigen Beispielen, ID-Vergabe/-Entfernung (Roundtrip aller Fixtures bleibt bytegleich, wenn nichts
  geändert wurde – nur die betroffenen Assets werden neu serialisiert).
- Playwright: Öffnen (Fake), Attribut über einen Test-Hook ändern, Undo/Redo, Dirty-Marker, Schließen-Frage.
- Rust: `recent_files` (fehlende Dateien, Grenze, kaputte Datei).

## Akzeptanz

- Öffnen von `camscanner.icon`, Speichern ohne Änderung → identische Dateien. Import SVG fügt Gruppe/Layer/Asset
  hinzu, Undo entfernt alles wieder. Titel und Dirty stimmen. `pnpm check` + `pnpm e2e` grün.
