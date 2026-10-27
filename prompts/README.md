# Feature-Prompts – AppIconic (Tauri)

Arbeitsaufträge für den Aufbau von **AppIconic**, einem Desktop-Editor für Apple-`.icon`-App-Icons mit SVG-Ebenen.
Auftrag und Rahmen: [000-init.md](000-init.md). Gemeinsame Regeln: [000-arbeitsweise.md](000-arbeitsweise.md).
Feature-Checkliste: [../docs/FEATURES.md](../docs/FEATURES.md). Fachliche Vorlage: `docs/legacy-analysis.md`
(„legacy §N“).

**Architektur-Grundsatz:** Das Dokument ist SVG-DOM in der WebView – der Browser rendert, parst und misst
(CTM/`DOMMatrix`). Rust (`ai-core`) liest und schreibt `.icon`-Bundles/ZIP verlustfrei, exportiert PNG und liefert
Schriften. Mutationen nur über benannte Commands im `DocumentStore` (Undo/Redo).

**KI-fähig (Marc, 26.10.2026):** Logik und Geometrie bleiben im Frontend, aber jeder Dokument-Command ist
serialisierbar (`{ type, …args }`) und jede Funktion eine Aktion mit Id – damit eine KI über MCP (Prompt 018)
dieselben Wege nutzt wie Menü und Tastatur.

**Arbeitsweise:** Prompts nacheinander abarbeiten, je Prompt Design-Dokument, Tests, `pnpm check` + `pnpm e2e`
grün, Commit + Push auf `main`, Prompt samt Design nach [`done/`](done/).

## Reihenfolge

Kritischer Pfad zum ersten nutzbaren Editor: **001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009**.
Danach 010–014 (untereinander weitgehend unabhängig; 014 braucht 009), 015 jederzeit nach 005, 016 nach 012,
017 schließt ab.

| Nr. | Prompt | Inhalt | Braucht | Umfang | Status |
|---|---|---|---|---|---|
| 000 | [000-arbeitsweise.md](000-arbeitsweise.md) | gemeinsamer Ablauf, Phasen, Regeln | – | – | – |
| 001 | [001-grundgeruest.md](done/001-grundgeruest.md) | Walking Skeleton: Tauri 2 + Angular 22 zoneless + Rust-Workspace (`ai-core`), Fensterhülle, About, Icon, Fixtures, Checks, CI, Doku, Legacy-Analyse | – | M | ✅ 26.10.2026 |
| 002 | [002-icon-dateiformat.md](done/002-icon-dateiformat.md) | `ai-core/icon`: `icon.json` verlustfrei (unbekannte Felder), Bundle + ZIP lesen/schreiben (atomar, Grenzen), Assets, eindeutige Namen, Commands `open_icon`/`save_icon`/`read_svg_file`, Roundtrip-Tests mit Fixtures | 001 | M | ✅ 26.10.2026 |
| 003 | [003-dokument-undo-dateien.md](done/003-dokument-undo-dateien.md) | Frontend-Dokumentmodell: `DocumentStore` (icon.json + SVG-DOM je Asset, `data-ai-id`), `UndoService` (benannte Commands, Coalescing), SVG-Bereinigung beim Import, Neu/Öffnen/Speichern/Schließen/Zuletzt benutzt, Dirty, Titel, mehrere Fenster, Browser-Modus | 002 | L | ✅ 27.10.2026 |
| 004 | [004-canvas.md](done/004-canvas.md) | Canvas: Assets im DOM rendern (Gruppen, Layer, Opacity), Hintergrund-Fill (Light/Dark), Plattform-Maske, Zoom/Pan, Lineale, Koordinaten, Cross Cursor, Guides; Geometrie-Basis (`ViewTransform`, CTM-Helfer) mit Playwright-Tests | 003 | L | ✅ 27.10.2026 |
| 005 | [005-aktionen-menue-tastatur.md](done/005-aktionen-menue-tastatur.md) | Aktionskatalog, Keymaps je OS, natives macOS-Menü / HTML-Menüleiste aus einem Modell, Befehlspalette, View-Options-Menü, Undo-Titel im Menü | 003 | M | ✅ 27.10.2026 |
| 006 | [006-hierarchie.md](done/006-hierarchie.md) | Ebenenbaum (Gruppen, Layer, Nodes), Swatches, Sichtbarkeit, Auswahl-Sync, Drag & Drop, Kontextmenü, Löschen mit Folge-Auswahl, Copy/Paste als SVG-XML, Ausrichten | 004, 005 | L | ✅ 27.10.2026 |
| 007 | [007-auswahl-handles-snapping.md](done/007-auswahl-handles-snapping.md) | Hit-Testing, Selection Modes, Rahmenauswahl, Handles aller Typen über CTM, Punktbearbeitung, Pfeiltasten, Grid-/Magic-Snap, BoundsGuard, Gesten-Undo; Geometrie-Tests bei Zoom 50/100/150 % und verschachtelten Gruppen | 004, 005 | L | ✅ 27.10.2026 |
| 008 | [008-elemente-hinzufuegen.md](done/008-elemente-hinzufuegen.md) | Command Sidebar + Menü „Add“: Icon-Gruppe, Container, Grundformen mit Legacy-Defaults, Text, Bild (⌘I), SVG-Snippet | 006 | M | ✅ 27.10.2026 |
| 009 | [009-properties-panel.md](done/009-properties-panel.md) | Properties aus Property-Specs, Farbeingabe, Stepped Slider, Mehrfachauswahl (mixed), Constrain, Transform-Liste mit Pivot, Reset | 006, 007 | L | ✅ 27.10.2026 |
| 010 | [010-icon-eigenschaften.md](done/010-icon-eigenschaften.md) | Icon-Inspector im Apple-Format: Fill (alle Arten), Specializations, Gruppen (Shadow, Translucency …), Layer (Name, Opacity), Plattformen, icon.json-Vorschau; Vorschau-Annäherung von Schatten/Transluzenz | 004, 009 | M | ✅ 27.10.2026 |
| 011 | [011-svg-quelltext.md](done/011-svg-quelltext.md) | „Edit SVG…“ mit CodeMirror 6 (Validierung, Undo), Formatierer, Pfad-Optimierer (RDP mit Eckenschutz) | 006 | M | ✅ 27.10.2026 |
| 012 | [012-export.md](012-export.md) | Export SVG je Appearance, PNG in Rust (resvg) mit Größen-Set, optionale Plattform-Maske, Fortschritt | 004, 010 | M | offen |
| 013 | [013-werkzeuge.md](013-werkzeuge.md) | Freehand (RDP + Glättung), Text → Pfad (fontdb + ttf-parser), Symbol-Picker mit freiem Icon-Set (Plugin-Schnittstelle) | 008 | L | offen |
| 014 | [014-clip-paths.md](014-clip-paths.md) | Clip Paths fertig: Picker, Anlegen je Layer, Bearbeitungsmodus, Vererbung Layer → Node, `clipPathUnits`, nicht selektierbar | 009 | M | offen |
| 015 | [015-einstellungen-layout-i18n.md](015-einstellungen-layout-i18n.md) | `settings.json` (Schema, Migration, Reset), Seitenleisten ein-/ausblendbar und in der Breite ziehbar, View-Options persistent, Settings-Dialog, Deutsch/Englisch zur Laufzeit, Hell/Dunkel | 005 | M | offen |
| 016 | [016-release-distribution.md](016-release-distribution.md) | Version aus einer Quelle, Lizenzhinweise, Pakete je OS, Dateizuordnung `.icon`, Release-Workflow (Probelauf), Signierung/Notarisierung vorbereitet, Share (macOS) | 012 | M | offen |
| 018 | [018-mcp-server.md](018-mcp-server.md) | MCP-Server: KI steuert den laufenden AppIconic über serialisierbare Commands und Aktionen (Sidecar + lokale Brücke wie editlicious), Lesen, Ändern, Vorschau, Export; Standard aus | 005, 009, 012 | M–L | erst nach Freigabe |
| 017 | [017-haertung-paritaet.md](017-haertung-paritaet.md) | Parität gegen `docs/FEATURES.md`, Review durch separaten Agenten, feindliche Dateien, Performance großer SVGs, Barrierefreiheit, Doku | 002–016 | M | offen |

## Folge-Ideen (noch ohne Prompt)

- Werbe-Webseite `/site` wie bei den Schwesterprojekten.
- Weitere Icon-Sets im Symbol-Picker; eigene Bibliothek wiederverwendbarer Formen.
- Boolesche Pfad-Operationen (Vereinigen, Schneiden), Konturen in Pfade umwandeln.
- Import von Icon-Composer-Projekten mit PNG-Assets bearbeiten (heute nur durchreichen).
