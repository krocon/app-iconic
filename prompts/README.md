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
Danach 010–014 (untereinander weitgehend unabhängig; 014 braucht 009), 015 jederzeit nach 005, 030 nach 012,
031 schließt ab (die Nummern dazwischen bleiben für weitere Prompts frei); 032 und 033 sind Folgen aus 031.
040–048: Zeichnen wie VectorCraft (Marc, 29.10.2026) – zuerst 040 und 041, dann 042 → 043 → 046 → 047; 044, 045, 048
unabhängig. 050–059: Konstruieren wie Fusion (Marc, 29.10.2026) – Reihenfolge 050 → 051 → 052 → 053 → 054 → 055,
dann 056, 057, 058, 032 (Verlaufseditor), zuletzt 059.
061–086: Umsetzung der [Analyse vom 30.10.2026](2026.10.30%20-%20analyse.md) (Abdeckung siehe unten). Reihenfolge nach
Priorität: **P0** 061 → 062 → 063 → 064 → 065 → 066; **P1** 067 → 068, dann 069–076 (073 nach 062/067, 074 nach 064);
**P2** 077 → 078 → 079, 080; **P3** 081–086 (untereinander unabhängig). Die Befunde der Analyse vor der Umsetzung im
Code bestätigen (roter Test) – sie stammen aus einer Fremdanalyse und können teils überholt oder ungenau sein.

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
| 012 | [012-export.md](done/012-export.md) | Export SVG je Appearance, PNG in Rust (resvg) mit Größen-Set, optionale Plattform-Maske, Fortschritt | 004, 010 | M | ✅ 27.10.2026 |
| 013 | [013-werkzeuge.md](done/013-werkzeuge.md) | Freehand (RDP + Glättung), Text → Pfad (fontdb + harfrust/skrifa), Symbol-Picker mit freiem Icon-Set (Lucide, Plugin-Schnittstelle) | 008 | L | ✅ 27.10.2026 |
| 014 | [014-clip-paths.md](done/014-clip-paths.md) | Clip Paths fertig: Picker, Anlegen je Layer, Bearbeitungsmodus, Vererbung Layer → Node, `clipPathUnits`, nicht selektierbar | 009 | M | ✅ 27.10.2026 |
| 015 | [015-einstellungen-layout-i18n.md](done/015-einstellungen-layout-i18n.md) | `settings.json` (Schema, Migration, Reset), Seitenleisten ein-/ausblendbar und in der Breite ziehbar, View-Options persistent, Settings-Dialog, Deutsch/Englisch zur Laufzeit, Hell/Dunkel | 005 | M | ✅ 27.10.2026 |
| 018 | [018-mcp-server.md](done/018-mcp-server.md) | MCP-Server: KI steuert den laufenden AppIconic über serialisierbare Commands und Aktionen (Sidecar + lokale Brücke wie editlicious), Lesen, Ändern, Vorschau, Export; Standard aus | 005, 009, 012 | M–L | ✅ 27.10.2026 (freigegeben von Marc) |
| 019 | [019-zeichenwerkzeuge.md](done/019-zeichenwerkzeuge.md) | Zeichenwerkzeuge wie Fusion: Line/Midpoint Line, Rectangle ▸ (2-Point, 3-Point, Center), Circle ▸ (Center Diameter, 2-/3-Point, 2-/3-Tangent), Arc ▸ (3-Point, Center Point, Tangent), Maßeingabe beim Zeichnen, Stil-Gedächtnis je Formtyp | 007, 008, 009, 013, 015 | L | ✅ 27.10.2026 |
| 030 | [030-release-distribution.md](done/030-release-distribution.md) | Version aus einer Quelle, Lizenzhinweise, Pakete je OS, Dateizuordnung `.icon`, Release-Workflow (Probelauf), Signierung/Notarisierung vorbereitet, „Im Ordner zeigen“ statt Share (E6) | 012 | M | ✅ 27.10.2026 |
| 031 | [031-haertung-paritaet.md](done/031-haertung-paritaet.md) | Parität gegen `docs/FEATURES.md`, Review durch separaten Agenten, feindliche Dateien, Performance großer SVGs, Barrierefreiheit, Doku | 002–030 | M | ✅ 27.10.2026 |
| 032 | [032-verlaufseditor.md](done/032-verlaufseditor.md) | Verlaufseditor: Panel-Abschnitt Gradient (Art, Units, Spread, Transform, Stop-Leiste), Griffe auf der Fläche, geteilte Verläufe, `gradient.*` | 009, 011 | M | ✅ 29.10.2026 |
| 033 | [033-haertung-folgen.md](033-haertung-folgen.md) | Folgen aus dem Review von 031: Pfade nur aus vertrauten Quellen, Transform-Rechnung über den Browser, Dateien teilen, Leistung auf dem Mac messen | 031 | M | offen |
| 040 | [040-snap-ziele.md](done/040-snap-ziele.md) | Smart Guides wie VectorCraft: Schnittpunkte („intersect“), Kontur („path“), Labels, Konstruktionswinkel, Tangente/Senkrecht, Verlängerung | 007, 019 | M–L | ✅ 29.10.2026 |
| 041 | [041-formen-aufziehen.md](done/041-formen-aufziehen.md) | Formen per Klicken und Ziehen (Shift/Alt/Leertaste/↑↓), Klick → Größendialog | 019, 040 | M | ✅ 29.10.2026 (Stern mit 044) |
| 042 | [042-pen.md](done/042-pen.md) | Zeichenstift: Ecken/glatte Punkte, Griffe, schließen, fortsetzen, Auto Add/Delete | 040 | L | ✅ 29.10.2026 (Auto Add/Delete mit 046) |
| 043 | [043-curvature.md](done/043-curvature.md) | Curvature-Werkzeug: glatte Kurve durch Klicks, vorhandene Pfade krümmen | 042 | M | ✅ 29.10.2026 |
| 044 | [044-weitere-formen.md](done/044-weitere-formen.md) | Rounded Rectangle, Stern, Spirale, Rechteck-/Polarraster, Bogen | 041 | M | ✅ 29.10.2026 |
| 045 | [045-live-corners.md](done/045-live-corners.md) | Live Corners: Ecken runden/fasen per Griff | 007 | M | ✅ 29.10.2026 |
| 046 | [046-pfade-bearbeiten.md](done/046-pfade-bearbeiten.md) | Punkte hinzufügen/löschen/umwandeln, Schere, Messer, Cuts, Join, Smooth | 042 | L | ✅ 29.10.2026 (Messer/Cuts mit 047) |
| 047 | [047-shape-builder-pathfinder.md](done/047-shape-builder-pathfinder.md) | Pathfinder (boolesche Operationen) und Shape Builder | 046 | L | ✅ 29.10.2026 |
| 048 | [048-bemassung-messen.md](done/048-bemassung-messen.md) | Messen und Bemaßung | 040 | M | ✅ 29.10.2026 |
| 049 | [049-muster-konstruktion.md](done/049-muster-konstruktion.md) | Konstruktionslinien, kreisförmiges/rechteckiges Muster, Spiegeln, Klonen | 040 | M | ✅ 29.10.2026 |
| 050 | [050-trimmen-verlaengern.md](done/050-trimmen-verlaengern.md) | Trimmen und Verlängern an Schnittpunkten | 040, 046 | M | ✅ 29.10.2026 |
| 051 | [051-verrunden-fasen.md](done/051-verrunden-fasen.md) | Verrunden und Fasen zwischen Elementen | 050 | M | ✅ 29.10.2026 |
| 052 | [052-versatz-kontur.md](done/052-versatz-kontur.md) | Versatz (Offset) und Kontur in Fläche | 047 | L | ✅ 29.10.2026 |
| 053 | [053-transformieren.md](done/053-transformieren.md) | Transformieren mit Bezugspunkt und Zahlen | 007 | M | ✅ 29.10.2026 |
| 054 | [054-verteilen-ausrichten.md](done/054-verteilen-ausrichten.md) | Verteilen; Ausrichten an Leinwand/Schlüsselobjekt | 007 | S | ✅ 29.10.2026 |
| 055 | [055-sperren-isolieren.md](done/055-sperren-isolieren.md) | Sperren, Isolieren, Konstruktion ausblenden | 006, 007 | M | ✅ 29.10.2026 |
| 056 | [056-hilfslinien-raster.md](done/056-hilfslinien-raster.md) | Hilfslinien aus dem Lineal, Icon-Raster-Vorlagen | 004 | M | ✅ 29.10.2026 |
| 057 | [057-kleine-groessen.md](done/057-kleine-groessen.md) | Vorschau in kleinen Größen, Pixelraster | 012 | M | ✅ 29.10.2026 |
| 058 | [058-als-konstruktion-zeichnen.md](done/058-als-konstruktion-zeichnen.md) | Direkt als Konstruktion zeichnen | 049 | S | ✅ 29.10.2026 |
| 059 | [059-abhaengigkeiten.md](done/059-abhaengigkeiten.md) | Abhängigkeiten und treibende Maße (parametrisch) | 048, 050, 051 | XL | ✅ 29.10.2026 |
| 060 | [060-flaechen-fuellen.md](done/060-flaechen-fuellen.md) | Flächen füllen (live): durch Überlagerung entstehende Flächen einfärben | 047, 050 | L | ✅ 29.10.2026 |
| 061 | [061-auswahlwerkzeug.md](done/061-auswahlwerkzeug.md) | Auswahl `V` / Direktauswahl `A`, ein ToolStore, aktives Werkzeug sichtbar (`aria-pressed`, auch eingeklappt) | 005, 007, 008 | S | ✅ 30.10.2026 |
| 062 | [062-bbox-inspektor.md](done/062-bbox-inspektor.md) | Transform-Kopf im Properties-Panel: X, Y, B, H, Drehung, Spiegeln, Bezugspunkt – für Pfade, Gruppen, Mehrfachauswahl | 007, 009, 053 | M | ✅ 30.10.2026 |
| 063 | [063-z-reihenfolge-baum.md](done/063-z-reihenfolge-baum.md) | SVG-Kinder im Baum „oben = vorn“ wie Gruppen/Layer (Frage 006/1) | 006 | S–M | ✅ 30.10.2026 |
| 064 | [064-fehlerbehebungen.md](done/064-fehlerbehebungen.md) | Gesperrte Objekte vor Trim & Co. schützen, Display-P3 ↔ sRGB, Pattern-Grenze, Blend-Modes im PNG-Export prüfen | 010, 012, 049–051, 055 | S–M | ✅ 30.10.2026 |
| 065 | [065-abhaengigkeiten-robust.md](done/065-abhaengigkeiten-robust.md) | Constraints: Verletzung anzeigen, optional live lösen, Maße löschbar, Overlay über CTM, Liste im Panel, keine Waisen | 059, 060 | M | ✅ 30.10.2026 |
| 066 | [066-hilfslinien-fuellungen-alltag.md](done/066-hilfslinien-fuellungen-alltag.md) | Hilfslinien vor ⌘A geschützt, Kennzeichnung im Baum, Live-Fill im Panel, eingefrorene Füllungen melden | 048, 055, 056, 060 | M | ✅ 30.10.2026 |
| 067 | [067-kontextleiste.md](done/067-kontextleiste.md) | Einheitliche Kontextleiste je Werkzeug (Name, Optionen, Tipp, Fertig) statt Pillen/Banner/Statuszeile | 061 | M | ✅ 30.10.2026 |
| 068 | [068-werkzeugleiste-ordnen.md](done/068-werkzeugleiste-ordnen.md) | Werkzeuge vs. Einfügen vs. Ändern trennen, Sektion Konstruktion, Rotate/Scale/Reflect in der Leiste, Kürzelkonflikte | 061, 067 | M | ✅ 30.10.2026 |
| 069 | [069-toolbar-direktzugriffe.md](done/069-toolbar-direktzugriffe.md) | Appearance und Maske als Segmented Controls, Speichern/Export… in der Toolbar, Undo/Redo nur einmal | 004, 012, 015 | S | ✅ 30.10.2026 |
| 070 | [070-kontextmenues.md](done/070-kontextmenues.md) | Rechtsklick-Menü auf dem Canvas, dasselbe Modell im Baum, Shift+F10 | 005, 006, 061 | M | ✅ 30.10.2026 |
| 071 | [071-dateien-ziehen-bilder-einfuegen.md](done/071-dateien-ziehen-bilder-einfuegen.md) | `.icon`/`.svg`/Bilder ins Fenster ziehen, Bilder aus der Zwischenablage einfügen | 003, 008, 030 | M | ✅ 30.10.2026 |
| 072 | [072-ebenenbaum-komfort.md](done/072-ebenenbaum-komfort.md) | Inline-Umbenennen (id + Verweise), Suche/Filter, alle zu-/aufklappen, + Gruppe/Layer, Schloss an Gruppen/Layern | 055, 063, 066 | M | ✅ 30.10.2026 |
| 073 | [073-properties-kompakt-popovers.md](073-properties-kompakt-popovers.md) | Paare zweispaltig, Icon-Toggles, nicht-modale Popovers, Live-Vorschau auch für Corners/Optimize Path | 062, 067 | M | offen |
| 074 | [074-farb-workflow.md](074-farb-workflow.md) | Farb-Popover (Alpha, HSL/HSB/OKLCH), Pipette, Dokumentfarben, Farbe ersetzen, Paletten | 009, 015, 064, 067 | M–L | offen |
| 075 | [075-live-typografie.md](075-live-typografie.md) | Schriftwahl für `<text>`, Text-Werkzeug, Bearbeiten auf dem Canvas, mehrzeilig, Text → Pfad | 009, 013, 067 | M–L | offen |
| 076 | [076-effekte-masken.md](076-effekte-masken.md) | Effekte je Element (Schatten, Unschärfe, Blend) und Masken wie Clip Paths | 009, 012, 014, 032, 064 | L | offen |
| 077 | [077-icon-format-vollstaendig.md](077-icon-format-vollstaendig.md) | Layer-Fill, Tinted-Vorschau/-Export, `plus-darker`, Radialverlauf anlegen, Glas/Licht angenähert | 004, 010, 012, 069 | M–L | offen |
| 078 | [078-export-apple-windows.md](078-export-apple-windows.md) | `AppIcon.appiconset`, `.icns`, `.ico`, PNG in die Zwischenablage, Schnell-Export | 012, 077 | M–L | offen |
| 079 | [079-export-android-web.md](079-export-android-web.md) | Android Adaptive Icons, Web/PWA-Satz mit Manifest und Favicon-SVG | 078 | M | offen |
| 080 | [080-png-layer.md](080-png-layer.md) | Bild als Layer importieren/ersetzen, Layer-Handles auf dem Canvas (`position`) | 002, 007, 010 | M | offen |
| 081 | [081-mockups.md](081-mockups.md) | Icon im Kontext: Dock, Home Screen, Spotlight, Taskleiste (eigene neutrale Grafik) | 057, 077 | M | offen |
| 082 | [082-startbildschirm-vorlagen.md](082-startbildschirm-vorlagen.md) | Startbildschirm mit Vorschaubildern, Vorlagen (iOS-Keylines, macOS, watchOS, Light/Dark) | 003, 015, 056 | M | offen |
| 083 | [083-autosave-wiederherstellung.md](083-autosave-wiederherstellung.md) | Wiederherstellungs-Schnappschüsse, Angebot nach Absturz | 002, 003, 015 | M | offen |
| 084 | [084-symbol-bibliotheken.md](084-symbol-bibliotheken.md) | Tabler, Phosphor, eigene Symbol-Bibliothek | 013, 030 | M | offen |
| 085 | [085-kuerzel-editor.md](085-kuerzel-editor.md) | Kürzel im Dialog aufnehmen, Konflikte, Zurücksetzen, `keymap.json` schreiben | 005, 015, 068 | M | offen |
| 086 | [086-ki-einrichtung-verlauf.md](086-ki-einrichtung-verlauf.md) | MCP-Eintrag für Claude Desktop/Cursor per Klick, Verbindungstest, KI-Verlauf am AI-Badge | 018 | M | offen |

## Folge-Ideen (noch ohne Prompt)

- Werbe-Webseite `/site` wie bei den Schwesterprojekten.

## Abdeckung der Analyse vom 30.10.2026

| Abschnitt der Analyse | Prompt |
|---|---|
| §1.1 Tinted/Clear, Layer-Fill, Liquid Glass, `plus-darker`, Radialverlauf (§1.3) | 077 |
| §1.1 Exporte: appiconset, `.icns`, `.ico`, Copy PNG, Schnell-Export | 078 |
| §1.1 Exporte: Android Adaptive, Web/PWA | 079 |
| §1.1 Kontext-Mockups | 081 |
| §1.1 PNG-Layer-Import und -Transformation | 080 |
| §1.2 Pipette, Swatches, Paletten, Alpha, Farbräume | 074 |
| §1.2 Effekte und Masken je Element | 076 |
| §1.2 Live-Typografie | 075 |
| §1.3 Drag & Drop von Dateien, Bild-Zwischenablage | 071 |
| §1.3 Autosave/Crash-Recovery | 083 |
| §1.3 Startbildschirm/Vorlagen · Symbol-Sets/eigene Bibliothek | 082 · 084 |
| §2.1 Bounding-Box-Inspektor | 062 |
| §2.2 Z-Reihenfolge im Baum | 063 |
| §2.3 Constraints | 065 |
| §2.4 Hilfslinien, Bemaßungen, Live-Fill | 066 |
| §2.5 Bugs (Lock, P3, Pattern, Blend-Export) · Live-Vorschau in Dialogen · Drag-Leistung | 064 · 073 · 033 |
| §3.1 Auswahlwerkzeug, Aktiv-Status | 061 |
| §3.2 Werkzeuge vs. Einmal-Aktionen | 068 |
| §3.3 Kontextleiste | 067 |
| §3.4 Canvas-Kontextmenü · Toolbar-Direktzugriffe, doppeltes Undo | 070 · 069 |
| §3.5 Baum · Properties-Panel | 072 · 073 |
| §3.6 Kürzel-Editor · MCP-Einrichtung/KI-Verlauf | 085 · 086 |
