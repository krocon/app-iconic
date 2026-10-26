# Analyse der Vorlage: AppIconic (SwiftUI/AppKit)

> Fachliche Vorlage für die Neuauflage. Quelle: `~/WebstormProjects/AppIconic/AppIconic` (Stand 7.11.2025,
> ≈ 35 000 Zeilen Swift inkl. lokaler Packages). Prompts verweisen auf Abschnitte als „legacy §N“.
> Analysiert am 26.10.2026. Dateiangaben relativ zu `AppIconic/AppIconic/` (Xcode-Projekt) bzw. `Packages/`.

## 1. Überblick und Aufbau

- macOS-App (SwiftUI + AppKit), Xcode-Projekt mit vier lokalen Packages: `SharedKernel` (Pfad-Typen),
  `AppIconicCore` (Dokumentmodell, Primitive, Serialisierung, Property-Specs), `SVGParser` (eigener SVG/XML/CSS-Parser,
  `.icon`-Reader/-Writer), `EditorFeature` (Teile der UI, Drag & Drop, Services – teils als Shim dupliziert).
- Größte Dateien: `Models/AppModel.swift` (3 208 Zeilen, God-Object: Dokument, Dateien, Add-Befehle, Ausrichten,
  Clip Paths, Export), `PropertiesPanel.swift` (1 548), `DocumentStore.swift` (1 553), `ContentView.swift` (1 326),
  `HandleOverlay.swift` (1 241). Doppelte Module: `Formatters.swift`, `SVGSampleNodes.swift`, `DocumentStoreShim`.
- 39 Test-Dateien in `AppIconicTests` (u. a. `CanvasGeometryTests`, `HandleOverlayGeometryTests`, `BoundsGuardTests`,
  `SnappingServiceAdditionalTests`, `FreeHandPathTests`, `SVGPathOptimizerTests`, `TransformModelTests`,
  `TreeReorderServiceTests`, `UndoControllerIntegrationTests`, `SaveLoadIntegrityTests`, `UserConfigStoreTests`,
  `SVGClipPathTests`) – gute Quelle für Testfälle der Neuauflage.
- Dokumentation in der Vorlage: `AGENTS.md`, `rules.md` (Invarianten der Handle-Transformationskette),
  `CLIPPATH_GAP_ANALYSIS.md`, `CLIPPATH_IMPLEMENTATION_STATUS.md`, `docs/svg-transform-logik-de.md`
  (übernommen nach `docs/legacy/`).

## 2. Dateiformat `icon.json` – wie die Vorlage es liest und schreibt

Quelle: `Packages/AppIconicCore/.../Document/IconFileFormat.swift`, `IconFill.swift`.

- Top-Level: `fill` (optional), `groups`, `supported-platforms` (`circles: [String]?`, `squares: String?`).
- Gruppe: `layers`, `shadow { kind: String, opacity }`, `translucency { enabled, value }`.
- Layer: **nur** `image-name` und `name`. **`opacity` am Layer wird nicht gelesen** – sie geht beim Speichern
  verloren, obwohl sie in echten Dateien steht (`camscanner.icon`: `"opacity": 1`).
- **Unbekannte Schlüssel gehen verloren** (Codable ohne Rest-Container). Apples Icon Composer schreibt weitere Felder
  (u. a. Specializations je Appearance, Blend-Mode, Glass, Hidden, Position/Skalierung, Lighting, Specular,
  Orientierung von Verläufen); keines davon überlebt einen Roundtrip durch die Vorlage.
- `fill` wird gelesen als: String `automatic`/`system-light`/`system-dark` oder Objekt mit genau einem von
  `solid` (Farbe), `automatic-gradient` (Farbe), `linear-gradient` ([Farben]), `radial-gradient` ([Farben]).
  Intern wird daraus ein **eigenes Modell** `IconFill { mode: solid|gradient|auto|system, color, opacity, blendMode,
  gradient { type, angle, stops[] }, auto { palette, strategy: accent|monochrome|complementary|elevated },
  system { light, dark, elevated }, fallbackColor }`.
- **Schreiben:** Die Vorlage schreibt dieses eigene Modell (`{"mode": "system", …}`) zurück nach `icon.json` –
  **nicht Apples Format**. Ein geöffnetes `"fill": "automatic"` kommt als `{"mode":"system","system":{…}}` zurück.
  → In der Neuauflage ist das Apple-Format die Wahrheit; ein Inspector-Modell darf nur eine Sicht darauf sein.
- Farbformat: `extended-srgb:r,g,b,a` (5 Nachkommastellen beim Schreiben); erlaubte Präfixe `extended-srgb`, `srgb`,
  `display-p3`, `gray`. Defaults: Palette `0,0.53333,1,1`, hell `1,1,1,1`, dunkel `0.07843,0.07843,0.07843,1`,
  monochrom `0.78,0.78,0.78,1`.
- Validierung: Opacity 0…1, Winkel 0…360, ≥ 2 Stops, Stops sortiert, Location 0…1, kein `system` in `system`.
- Blend-Modes im Modell: `normal, multiply, screen, overlay, softLight, hardLight` (Apple-Schreibweise prüfen).

## 3. Bundle, ZIP, Assets, Export

Quelle: `Packages/SVGParser/.../Icon/IconFileReader.swift`, `IconFileWriter.swift`, `Services/SVGIconExportService.swift`,
`PNGIconExportService.swift`.

- **Lesen:** Ordner-Bundle (`icon.json` + `Assets/`) oder ZIP; ZIP wird über `/usr/bin/unzip` in ein Temp-Verzeichnis
  entpackt (Prozessaufruf – entfällt, Rust-Crate `zip`).
- **Schreiben:** immer **ZIP** über `/usr/bin/zip`, als Datei an den Zielpfad – auch wenn ein Bundle-Ordner geöffnet
  wurde. Nicht atomar. → Neuauflage: im Format zurückschreiben, in dem gelesen wurde (Bundle als Standard), atomar.
- Assets: SVGs werden in das eigene Knotenmodell geparst und beim Speichern neu serialisiert (Formatierung, unbekannte
  Elemente/Attribute gehen verloren). PNG-Assets werden nur durchgereicht.
- Eindeutige Namen (`AppModel.makeUniqueAssetName`): `name.svg` → `name 2.svg`, `name 3.svg` … (Leerzeichen + Zahl,
  Endung bleibt, Default `svg`); Layer-Namen analog (`layer`, `layer 2` …, leer → `layer`).
- Neues Dokument (`createSimpleIcon`): eine Gruppe mit einem Layer, `shadow {neutral, 0.5}`, `translucency {true, 0.5}`,
  `supported-platforms { circles: [iOS, macOS], squares: shared }` – Achtung: `circles` mit iOS/macOS ist
  fachlich fragwürdig (Apples Beispiel: `circles: [watchOS]`); in der Neuauflage prüfen.
- **Export SVG:** je Appearance eine Datei (`-light`, `-dark`), Hintergrund aus dem Fill (Verläufe als
  `linearGradient`/`radialGradient`, Auto-Verlauf: Basis aufgehellt 16 % → abgedunkelt 14 %), dann alle Gruppen/Layer.
  **Nicht berücksichtigt:** Schatten, Transluzenz, Layer-Opacity, Plattform-Maske (Squircle/Kreis).
- **Export PNG:** rendert die SwiftUI-Ansicht des SVG mit `ImageRenderer` bei Skalierung 1 – nur **eine Größe**
  (Viewport-Größe, meist 1024). Kein Größen-Set. **Share Export** existiert nicht (nur ein `ShareLink` im Symbol-Picker).

## 4. Fenster, Dateien, Menüs, Kürzel

Quelle: `Core/Commands/FileMenuCommands.swift`, `App/AppIconicApp.swift`, `Services/RecentFilesManager.swift`.

| Menüpunkt | Kürzel | Bemerkung |
|---|---|---|
| New Window | ⇧⌘N | |
| New Document… | ⌘N | Dirty-Abfrage Save / Don't Save / Cancel |
| Open… | ⌘O | `.icon` |
| Open Recent › … / Clear Menu | – | Einträge werden beim Anzeigen validiert (fehlende ausgeblendet); „No Recent Items“ |
| Import SVG… | ⇧⌘I | SVG als neue Gruppe/Layer/Asset |
| Export SVG… / Export PNG… | – | s. §3 |
| Save / Save As… | ⌘S / ⇧⌘S | Save nur bei Änderungen aktiv |
| Close | ⌘W | Dirty-Abfrage |
| Undo / Redo | ⌘Z / ⇧⌘Z | Menütitel mit Aktionsnamen (§12) |
| Command Sidebar / Hierarchy / Properties ein/aus | ⌘1 / ⌘2 / ⌘3 | Menü View |
| Add › (alle Add-Befehle) | ⌘I = Image | Menü „Add“ (§8) |

- Fenstertitel = Dateiname; Änderungsmarker. Mehrere Fenster (je Fenster ein Dokument).
- Accessibility-Label in Recent-Menü teils deutsch („Öffne kürzlich genutzte Datei“) – UI sonst englisch.

## 5. Arbeitsfläche (Canvas)

Quelle: `Features/Canvas/**`, `Views/ContentView.swift`.

- Leinwand 1024 × 1024 (Dokumentraum). Zoomstufen **25, 33, 50, 66, 75, 100, 125, 150, 200 %** (Index 0…8, Default 5 =
  100 %), Anzeige der Zoomstufe, „Center Canvas“. Pan per Scroll; Trackpad-Zoom.
- Lineale oben/links (Haupt-/Nebenteilung, mit Zoom skaliert), Mauskoordinaten im Dokumentraum, Fadenkreuz-Cursor.
- **Icon-Guides** (`IconGuides.swift`): Farbe `#0A84FF` (0.0392, 0.5176, 1.0), Linienbreite 2; beide Diagonalen;
  Linien bei 128/256/384/512/640/768/896 horizontal und vertikal; Kreise Ø 820, 512, 204 um (512, 512).
- Hintergrund nach Icon-Fill (`IconFillRenderer.swift`), umschaltbar. Plattform-Vorschau (`PlatformCanvas.swift`).
- **BoundsGuard**: Punkte, Pfade und Translationen werden auf die Workspace-Grenzen geklemmt (`BoundsGuardTests`).
- Y-Achse: SwiftUI-Koordinaten mit eigenen Umrechnungen `modelToView`/`viewToModel` – Fehlerquelle.

## 6. Auswahl, Handles, Snapping

Quelle: `HandleSystem/*`, `CanvasCore/CanvasHitTester.swift`, `SnappingService.swift`, `SnapConfiguration.swift`.

- Selection Modes `none`, `point` (Default), `boxed` (Rahmenauswahl, `BoxSelectionMathTests`). Mehrfachauswahl.
- Hit-Testing über alle Ebenen; Doppelklick auf Gruppe → hinein (`group_double_click_verification.md`).
- Handle-Typen (Farbe / Größe in pt): `position` blau 8, `size` grün 6, `control` orange 5, `anchor` lila 6,
  `midpoint` gelb 7, `pivot` rot 9.
- Handles je Typ: Circle = Mitte (position) + Radius (size); Ellipse = Mitte + rx + ry; Rect = oben links (position)
  + drei Ecken (size) + Eckenradius (control, wenn rx > 0); Line = Start/Ende (position); Text = Position +
  Anker-Handle je `text-anchor` (±20); Path = Anker (position), Kontrollpunkte C/Q (control); Polyline/Polygon =
  Punkte + Segment-Mitten (midpoint → Punkt einfügen); Rotate-Schritt mit Pivot (pivot).
- **Fehlerursache „versetzte Handles“:** jede Node-Art wendet Transform und Position in anderer Reihenfolge an
  (`extractHandles`: Rect „transform, dann Offset“, Circle „transform vor position“, Ellipse umgekehrt …); dazu
  eine selbst gebaute Vorfahren-Kette (`accumulatedAncestorTransform`, `rules.md`). → Neuauflage: CTM des DOM.
- Pfeiltasten verschieben (1 / mit ⇧ 10).
- Snapping: Grid Abstand **10**, Ursprung `worldZero` | `svgCenter`; Magic Snap auf markante Punkte aller Nodes (auch
  andere Zweige), Aktivierung **20 px Bildschirm** (zoomabhängig); bei Gleichstand Magic vor Grid. Defaults:
  Snap to Grid **aus**, Magic Snap **an**.
- Gesten werden zu einer Undo-Gruppe zusammengefasst; Debug-Schalter „Log Undo Grouping“ (Settings).

## 7. Hierarchie und Properties

Quelle: `Views/TreeView.swift`, `Core/Tree/*`, `Models/AppModel/AppModelAndHierarchyMenu.swift`,
`Features/Properties/**`, `Packages/AppIconicCore/Specs/PropertySpec.swift`.

### 7.1 Baum
- Root (Fill) → Icon-Gruppen → Layer (Asset) → SVG-Nodes rekursiv. Zeile: Typ-Icon, Name/Id, Farb-Swatch (Fill und
  Stroke, Weiß mit Rand), Sichtbarkeit (`display`). Drag & Drop vor/nach/hinein, Schutz gegen Nachfahren
  (`TreeReorderServiceTests`), über Asset-Grenzen.
### 7.2 Kontextmenü
- `Delete…` (Bestätigung), `Duplicate`, `Group <g>`, `Bring to Front`, `Send to Back`, `Copy XML`, `Edit SVG…`.
### 7.3 Ausrichten
- Nur bei ≥ 2 Nodes; Bezug ist die **Vereinigung der Welt-Bounding-Boxes** der Auswahl (nicht die Leinwand);
  umgesetzt als zusätzliche Translation im `transform`; eine Undo-Aktion „Change Transform“.
  Aktionen: links, horizontal zentriert, rechts, oben, vertikal zentriert, unten.
### 7.4 Property-Specs (Auszug)
- Präsentation: `fill`, `fill-opacity` 0…1, `stroke`, `stroke-opacity` 0…1, `stroke-width` 0…100, `opacity` 0…1,
  `transform`, `id`, `display`, `visibility`, `vector-effect`.
- Text: `text`, `font-size` 4…512, `font-family`, `font-weight`, `text-decoration`.
- Geometrie: `x`, `y`, `width`/`height` 0…10000, `rx`/`ry` 0…1000, `cx`, `cy`, `r` 0…10000, `x1/y1/x2/y2`,
  `d` (Texteditor), `points` (Texteditor).
- Stil: Clip Path (Picker), `fill-rule` nonzero|evenodd, `filter`, `mask`, `stroke-dasharray`, `stroke-dashoffset`,
  `stroke-linecap` butt|round|square, `stroke-linejoin` miter|round|bevel, `stroke-miterlimit` 1…100 (Default 4).
- Farbeingabe mit Swatch + Hex, `none`/`inherit`, „mixed“ bei Mehrfachauswahl; Stepped Slider; Constrain proportions;
  Reset je Property und „Reset All Properties“; Undo/Redo-Knöpfe im Panel.
### 7.5 Transform-Liste
- Geordnete Schritte `translate`, `scale`, `rotate` (optional Pivot, „Use pivot“), `skewX`, `skewY`, `matrix`;
  hinzufügen über „Add“, Reihenfolge per Drag („top applies first“), entfernen; Rohanzeige des Attributs.
### 7.6 Icon-Inspector
- Hintergrund-Fill mit den Modi aus §2 (eigene Sicht!), Gruppen-Schatten/Transluzenz, Layer-Name, Plattformen,
  „icon.json Preview“.

## 8. Elemente hinzufügen (Command Sidebar, Menü „Add“)

Quelle: `Core/Commands/AddCommand.swift`, `AppModel.add*`.

Einfügeort: in den gewählten Container bzw. hinter die gewählte Node, sonst in das Asset der aktuellen Gruppe;
Zentrum = Mitte des Viewports (`viewportCenter`).

| Befehl | Ergebnis (c = Zentrum) |
|---|---|
| Group (SVG) | **neue Icon-Gruppe** in `icon.json` mit einem Layer und neuem Asset `layer-N.svg` (1024er-Viewport), hinter der aktuellen Gruppe |
| Container `<g>` | leeres `<g>` |
| Circle | r 128, fill schwarz |
| Ellipse | rx 160, ry 120, fill schwarz |
| Rectangle | 256 × 256 zentriert, fill schwarz |
| Path | Dreieck `M c.x,c.y-140 L c.x-140,c.y+140 L c.x+140,c.y+140 Z`, fill schwarz |
| Line | c.x ± 160, stroke schwarz 12, cap round |
| Polyline | (c.x-160, c.y+120), (c.x, c.y-140), (c.x+160, c.y+120), stroke schwarz 10, cap/join round |
| Polygon | (c.x, c.y-160), (c.x-160, c.y+120), (c.x+160, c.y+120), fill schwarz |
| Text | „Text“, SF Pro 160, weight 400, fill schwarz |
| Image (⌘I) | Datei wählen → `<image>` 100 × 100 mit Data-URL |
| Freehand | Werkzeug: Punkte mit `minDistance` 3 (≤ 120 Hz), RDP `epsilon` 2.5, Glättung (Catmull-Rom, `alpha` 0.5) zu Béziers, 1 Nachkommastelle, ≤ 4 096 Segmente, offen/geschlossen; Ergebnis: Stroke schwarz, round |
| Text to Path | Dialog: Text, Schrift (PostScript-Name, CoreText), Vorschau → Glyph-Outlines als `<path>` |
| SVG Snippet | „Paste SVG markup to append“ → parsen, Nodes extrahieren, zentrieren, einfügen |
| SF Symbol | Katalog (Suche, Gewicht, Skalierung) → Pfad (über Vision) – **Lizenz verbietet SF Symbols in App-Icons** |

## 9. Einstellungen

Quelle: `Core/Configuration/UserConfiguration.swift`, `UserConfigStore.swift`, `Core/Settings/SettingsView.swift`.

- `schemaVersion` 1 (Migration: unbekannte Version → Defaults/Anheben).
- Sichtbarkeit: Command Sidebar, Hierarchy, Properties (alle an); Breiten 260 / 260 / 300, Bereich **160…480**.
- Canvas: Rulers, Guides, Background, Cross Cursor, Show Handles (alle an), Snap to Grid **aus**, Magic Snap **an**,
  Selection Mode `point`, Zoom-Index 5.
- Settings-Fenster: Toggle „Log Undo Grouping“ (Debug), „Reset to Default“ mit Bestätigung („All persisted workspace
  settings will revert to their defaults.“).

## 10. SVG-Unterstützung, Quelltext, Optimierer

Quelle: `Packages/SVGParser/**`, `Utilities/SVGCodeGenerator.swift`, `SVGPathOptimizer.swift`, `CGPathSimplify.swift`,
`Views/Sheets/EditSVGSheet.swift`.

- Eigener Parser in ein Knotenmodell: `svg` (Viewport, viewBox, preserveAspectRatio), `g`, `rect`, `circle`, `ellipse`,
  `line`, `polyline`, `polygon`, `path` (alle Befehle MLHVCSQTA, abs/rel), `text`, `image` (URL und Data-URL),
  `clipPath`, `linearGradient`, `radialGradient`; Transforms `translate`, `scale`, `rotate`, `skewX`, `skewY`,
  `matrix`; CSS/`style`-Verarbeitung im Parser. Unbekanntes geht verloren (kein Roundtrip).
- „Edit SVG…“-Sheet je Node/Asset: übernimmt nur fehlerfrei parsendes Markup; Undo „Edit SVG Code“.
- Pfad-Optimierer: Ramer-Douglas-Peucker (Default `epsilon` 1.0) mit Eckenschutz, Zahlen runden, redundante
  Befehle entfernen, Whitespace komprimieren (`SVGPathOptimizerTests`).

## 11. Clip Paths (unfertig)

Quelle: `CLIPPATH_GAP_ANALYSIS.md`, `CLIPPATH_IMPLEMENTATION_STATUS.md`, `SVGClipPath.swift`, `ClipPathEditView.swift`.

- Vorhanden: Datenmodell (Definition, Kinder, `clipPathUnits`), Referenz `clipPathId` an Nodes, Vererbung
  Layer → Node mit Override und Opt-out `none`, „Create Clip Path“ je Layer, Zuweisen/Entfernen, 25 Tests.
- Fehlt: Bearbeitungsmodus auf dem Canvas (in `ContentView` wieder entfernt), sauberes Rendering/Export,
  Ausschluss der Definitionen aus Hit-Testing/Selektion an allen Stellen.

## 12. Undo/Redo

Quelle: `Features/Editor/EditorKit/UndoController.swift`.

- Benannte Aktionen: Change Fill, Change Stroke, Change Stroke Width, Change Opacity, Change Font Size, Change Font
  Family, Change Font Weight, Change Text, Change Transform, Change Attribute, Edit SVG Code, Insert Point, Delete
  Point, Adjust Path, Move Node, Reorder Node, Group <g>, Ungroup, Clone, Delete, Toggle Visibility, Reset All
  Properties. Gruppierung zusammengesetzter Aktionen, Gesten-Coalescing.

## 13. Abweichungen der Neuauflage (Entscheidungen)

1. Browser statt eigenem Parser/Renderer; Geometrie über CTMs (§5, §6, §10).
2. **Apple-`icon.json` ist die Wahrheit**, verlustfrei inkl. unbekannter Felder und Layer-`opacity` (§2).
3. Bundle bleibt Bundle, ZIP bleibt ZIP; atomar speichern, kein `zip`/`unzip`-Prozess (§3).
4. SVG-Assets werden als Text gehalten und nur dort geändert, wo bearbeitet wurde (DOM-Serialisierung ohne
   interne Attribute), statt jedes Mal neu generiert (§3, §10).
5. Export mit Größen-Set und optionaler Plattform-Maske; Schatten/Transluzenz als Vorschau-Annäherung (§3).
6. Freies Icon-Set statt SF Symbols (§8).
7. Clip Paths fertig bauen (§11).
8. Kein God-Object, keine doppelten Module, keine Prozessaufrufe (§1).
