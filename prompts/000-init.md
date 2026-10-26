# Prompt: AppIconic neu bauen – Tauri 2 + Angular 22 + Rust

> Diesen Prompt einem Coding-Agent (z. B. Claude Code) im leeren Repo geben.
> Ziel: Projekt aufsetzen und schrittweise Feature-Parität mit der alten SwiftUI-App erreichen.

---

## Rolle & Ziel

Du bist Senior-Entwickler für Desktop-Apps mit Tauri 2, Angular und Rust. Baue **AppIconic** neu: einen Desktop-Editor für App-Icons im Apple-`.icon`-Format (Icon Composer) mit SVG-Ebenen. Die alte App (SwiftUI/AppKit, ~29.000 Zeilen Swift) ist unfertig und wird **nicht 1:1 portiert**. Die Neuentwicklung basiert auf dem **SVG-DOM im WebView**: Der Browser übernimmt Rendering, Parsing (`DOMParser`) und Geometrie (`getBBox`, `getCTM`, `getScreenCTM`, `DOMMatrix`). Rust übernimmt Dateisystem, ZIP, Rasterisierung und Fonts.

Plattformen: zuerst macOS (Apple Silicon), Windows und Linux sollen ohne Mehraufwand mitlaufen.

## Tech-Stack (Versionen vor dem Setup verifizieren, jeweils aktuelle stabile nehmen)

- **Tauri 2** (`create-tauri-app` bzw. `@tauri-apps/cli`), Plugins: `dialog`, `fs`, `store`, `window-state`, `clipboard-manager`, `shell` (nur falls nötig)
- **Angular 22**: Standalone Components, **Signals** für den gesamten State, zoneless Change Detection, neue Control-Flow-Syntax (`@if`, `@for`), `OnPush` überall, strict TypeScript
- **Rust**: `serde`/`serde_json`, `zip`, `resvg`/`usvg`/`tiny-skia` (PNG-Export), `fontdb` + `ttf-parser` (Text→Pfad, Systemschriften), `thiserror`, `anyhow`
- Code-Editor: **CodeMirror 6** (XML/SVG-Modus)
- Tests: Vitest (oder der Angular-22-Default) für TS, `cargo test` für Rust, Playwright für E2E gegen den Angular-Dev-Server
- Lint/Format: ESLint + Prettier, `cargo fmt` + `clippy`
- Paketmanager: pnpm (falls nicht anders vorhanden)

### Folgende Projekte sind technische Vorbilder:

- /Users/marckronberg/WebstormProjects/editlicious
- /Users/marckronberg/WebstormProjects/files-and-folders-tauri
- /Users/marckronberg/WebstormProjects/comic-commander-tauri/Users/marckronberg/WebstormProjects/AppIconic/AppIconic

### Folgendes Projekt ist fachliche Vorlage:

- /Users/marckronberg/WebstormProjects/AppIconic/AppIconic

## Architektur-Vorgaben

```
/src-tauri          Rust: commands/ (icon_file, export, fonts), model/ (icon.json serde), tests/
/src/app
  core/             DocumentStore (Signals), UndoService (Command-Pattern), Settings, Shortcuts, RecentFiles
  model/            TS-Typen für icon.json, IconFill, Node-Wrapper über SVG-DOM
  features/
    canvas/         Workspace, Zoom/Pan, Lineale, Guides, Hit-Testing, Selection, Handles, Snapping
    hierarchy/      Ebenenbaum mit Drag & Drop
    properties/     Properties-Panel inkl. Transform-Liste, IconFill-Inspector
    commands/       Command-Sidebar („Add“-Befehle)
    tools/          Freihand, Text→Pfad, SVG-Snippet, Bild, Symbol-Picker
    editor/         SVG-Quelltext-Editor (CodeMirror)
    export/         SVG/PNG-Export-UI
  shared/           UI-Bausteine, Formatter, Geometrie-Utils (rein funktional, gut testbar)
```

Regeln:
- **Kein God-Object.** Die alte App hatte ein `AppModel` mit 3.200 Zeilen – genau das vermeiden. Services mit klarer Verantwortung, max. ~400 Zeilen pro Datei.
- **Single Source of Truth**: Das Dokument ist ein Modell (icon.json + pro Asset ein SVG-Dokument). Das Canvas rendert daraus; Mutationen laufen ausschließlich über Commands im `DocumentStore`, damit Undo/Redo immer funktioniert.
- **Transforms**: Immer über `DOMMatrix` und die echten CTMs des DOM rechnen, keine eigene Transform-Kette nachbauen. Das war die größte Fehlerquelle der alten App (versetzte Handles bei verschachtelten Gruppen). Für verschachtelte, transformierte Gruppen gibt es explizite Tests.
- Rust-Commands sind klein, typisiert (`serde`) und liefern strukturierte Fehler ans Frontend.
- Jede Node bekommt intern eine stabile ID (`data-ai-id`), die beim Export entfernt wird.
- UI-Sprache Englisch, i18n-fähig vorbereiten. Code und Kommentare auf Englisch.

## Dateiformat `.icon` (Apple Icon Composer)

Ein `.icon` ist ein **Ordner-Bundle** (unter macOS ein Package) bzw. beim Austausch ein ZIP mit:
```
icon.json
Assets/<name>.svg  (auch PNG möglich)
```
Beispiel `icon.json`:
```json
{
  "fill": "automatic",
  "groups": [
    {
      "layers": [ { "image-name": "logo 3.svg", "name": "logo 3", "opacity": 1 } ],
      "shadow": { "kind": "neutral", "opacity": 0.5 },
      "translucency": { "enabled": true, "value": 0.5 }
    }
  ],
  "supported-platforms": { "circles": ["watchOS"], "squares": "shared" }
}
```
- `fill`: `"automatic"`, `"system-light"`, `"system-dark"` oder Objekt mit `solid`, `automatic-gradient`, `linear-gradient`, `radial-gradient` (siehe IconFill unten). Unbekannte Felder **beim Speichern verlustfrei durchreichen** (Roundtrip-Garantie).
- Lesen und Schreiben sowohl als Bundle-Ordner als auch als ZIP. Asset-Namen eindeutig halten (`makeUniqueAssetName`), Layer-Namen ebenfalls.
- Leinwand: 1024 × 1024.

## Feature-Liste der alten App (Parität = Definition of Done)

### 1. Dokument & Dateien
- [ ] New Window (⇧⌘N), New Document (⌘N) mit „Speichern?“-Dialog bei ungespeicherten Änderungen (Save / Don't Save / Cancel)
- [ ] Open… (⌘O) für `.icon`
- [ ] Open Recent mit Validierung (nicht mehr existierende Dateien ausblenden) und „Clear Menu“
- [ ] Import SVG… (⇧⌘I): SVG als neue Ebene/Asset ins Dokument
- [ ] Export SVG…: pro Variante (Light/Dark) ein komplettes SVG inkl. Hintergrund-Fill, Gruppen und Ebenen
- [ ] Export PNG…: aus den exportierten SVGs rasterisiert (in Rust mit resvg; zusätzlich Größen-Set 1024/512/256/128/64/32/16 anbieten)
- [ ] Share Export (macOS-Share-Sheet, optional / später)
- [ ] Save (⌘S, nur aktiv wenn dirty), Save As… (⇧⌘S), Close Document (⌘W, mit Dirty-Abfrage)
- [ ] Dirty-Tracking, Fenstertitel = Dateiname (+ Änderungsmarker)
- [ ] Mehrere Fenster bzw. Dokumente

### 2. Layout & Workspace
- [ ] Drei ein-/ausblendbare Seitenleisten: **Command Sidebar** (links), **Hierarchy Panel**, **Properties Sidebar** (rechts); Breite per Drag 160–480 px, Defaults 260/260/300
- [ ] „View Options“-Menü mit Toggles: Command Sidebar, Hierarchy Panel, Properties Sidebar, Rulers, Guides (Icon Shape), Background, Cross Cursor, Show Handles, Snap to Grid, Magic Snap
- [ ] Persistente Benutzer-Einstellungen mit Schema-Version und Migration (tauri-plugin-store); „Reset to Default“ in Settings mit Bestätigung
- [ ] Settings-Fenster (u. a. Debug-Toggle „Log Undo Grouping“)

### 3. Canvas
- [ ] Zoom-Stufen 25 / 33 / 50 / 66 / 75 / 100 / 125 / 150 / 200 %, Zoom-Anzeige, Pinch-/Trackpad-Zoom und ⌘+/⌘−/⌘0, „Center Canvas“
- [ ] Pan (Scroll / Space+Drag)
- [ ] Lineale oben/links mit Haupt- und Nebenskala, die mit dem Zoom skalieren
- [ ] Mauskoordinaten-Anzeige (x/y im Dokumentraum)
- [ ] Cross Cursor (Fadenkreuz über die ganze Leinwand)
- [ ] **Icon-Guides** (Apple-Raster): beide Diagonalen, Linien bei 128/256/…/896 horizontal und vertikal, Kreise mit Ø 820, 512 und 204 um (512, 512); Farbe #0A84FF
- [ ] Hintergrund-Darstellung gemäß Icon-Fill, umschaltbar
- [ ] Zielplattform-Vorschau (Squares/Circles: iOS/macOS-Squircle vs. watchOS-Kreis als Maske)
- [ ] Inhalte auf Workspace-Grenzen beschränken (BoundsGuard: Punkte, Pfade, Translationen clampen)

### 4. Auswahl & Manipulation
- [ ] Selection Modes: `none`, `point` (Klick), `boxed` (Rahmen-/Lasso-Auswahl); Mehrfachauswahl mit ⇧/⌘
- [ ] Hit-Testing über alle Ebenen, Klick auf leere Fläche hebt die Auswahl auf, Doppelklick auf Gruppe → in Gruppe hinein selektieren
- [ ] Auswahlrahmen-Overlay mit Handles. Handle-Typen (Farbe/Größe wie alt):
    - `position` (blau, 8): verschieben
    - `size` (grün, 6): Breite/Höhe bzw. Radius
    - `control` (orange, 5): Bézier-Kontrollpunkte
    - `anchor` (lila, 6): Pfad-Ankerpunkte, Text-Anker
    - `midpoint` (gelb, 7): Segment-Mitten (Punkt einfügen)
    - `pivot` (rot, 9): Drehpunkt eines Rotate-Transforms
- [ ] Punktbearbeitung für Polyline- und Polygon-Vertices und Pfad-Anker/-Segmente (line & cubic)
- [ ] Verschieben per Pfeiltasten (1 px, mit ⇧ 10 px)
- [ ] **Snapping**: Grid (Abstand 10, Ursprung `worldZero` oder `svgCenter`) und **Magic Snap** auf markante Punkte aller Nodes, auch über Gruppen-/Zweiggrenzen hinweg; Aktivierungsdistanz 20 px **in Bildschirmpixeln**, also zoomabhängig; bei Gleichstand Magic vor Grid
- [ ] Gesten werden als **eine** Undo-Gruppe zusammengefasst (coalesce während Drag, commit am Ende, cancel bei Esc)

### 5. Elemente hinzufügen (Command Sidebar)
Alle Befehle fügen ins aktuell gewählte Layer/Container ein (oder ins erste passende) und zentrieren im Viewport:
- [ ] Group (neue Icon-Gruppe im icon.json) und Container `<g>` (SVG-Gruppe)
- [ ] Circle, Ellipse, Rectangle, Line, Polyline, Polygon, Path, Text
- [ ] **Freehand**: Werkzeug-Modus, Strich aufzeichnen, Downsampling, Glättung zu Bézier-Pfad (Path-Fitting), Pfad offen/geschlossen umschaltbar, Live-Vorschau, Esc bricht ab
- [ ] **Text to Path**: Dialog mit Texteingabe, Schriftauswahl (Systemschriften, in Rust via fontdb aufgelistet), Vorschau; erzeugt Glyph-Outlines als `<path>`
- [ ] **SVG Snippet**: Dialog „Paste SVG markup to append“; parsen, Nodes extrahieren, auf die Bounds zentrieren, einfügen
- [ ] **Image** (⌘I): Bilddatei wählen, als `<image>` mit Data-URL einbetten
- [ ] **Symbol**: Symbol-Katalog mit Suche, Gewicht und Skalierung, als Pfad einfügen. **Abweichung zur alten App:** Statt SF Symbols (Lizenz verbietet die Nutzung in App-Icons, außerdem nur auf macOS) ein freies Icon-Set einbinden (z. B. Lucide, Tabler oder Material Symbols; Lizenz prüfen und im About-Dialog nennen). Den Picker als Plugin-Schnittstelle bauen, damit später weitere Sets möglich sind.

### 6. Hierarchie (Ebenenbaum)
- [ ] Baum: Root (Fill) → Icon-Gruppen → Layer (Assets) → SVG-Nodes (rekursiv)
- [ ] Pro Zeile: Typ-Icon, Name/ID, **Farb-Swatch** (Fill und Stroke, weiß erkennbar dargestellt), Sichtbarkeit (`display`-Toggle, auch rekursiv)
- [ ] Auswahl synchron mit dem Canvas (beidseitig), Mehrfachauswahl
- [ ] **Drag & Drop** mit Einfügelinie: vor, nach, hinein; Gruppen und Nodes; Schutz gegen Einfügen in eigene Nachfahren; Verschieben über Asset-Grenzen hinweg
- [ ] Kontextmenü: Duplicate, Group `<g>` (Surround with Group), Bring to Front, Send to Back, Edit SVG…, Copy XML, Delete… (mit Bestätigung „removes the node and its children“)
- [ ] Nach dem Löschen sinnvolle Folge-Auswahl (nächster/vorheriger Sibling)
- [ ] Ausrichten der Auswahl: links, horizontal zentriert, rechts, oben, vertikal zentriert, unten (Bounding-Box inkl. Transforms)
- [ ] Copy/Paste von Nodes über die Zwischenablage als SVG-XML (auch zwischen Dokumenten)

### 7. Properties-Panel
- [ ] Leerzustand „Nothing selected – Select an element in the hierarchy…“
- [ ] Generische Attribut-Editoren je Node-Typ, gesteuert über eine **Property-Spec** (Typ, Einheit, Min/Max, Schrittweite): x, y, width, height, r, rx, ry, cx, cy, x1/y1/x2/y2, points, d, opacity, fill, stroke, stroke-width, Linecap/-join, Dasharray, fill-rule, font-family/size/weight, Text-Dekorationen (mit „Clear Text Decorations“), preserveAspectRatio u. a.
- [ ] Farbeingabe mit Swatch und Hex-Feld (`#RRGGBB` / `#AARRGGBB`), Werte `none`, `inherit`, `mixed` (bei Mehrfachauswahl)
- [ ] Stepped Slider (Slider mit Rasterung + Zahlenfeld)
- [ ] „Constrain proportions“ beim Ändern der Größe
- [ ] **Transform-Liste**: geordnete Schritte `translate`, `scale`, `rotate` (optional mit Pivot, „Use pivot“), `skewX`, `skewY`, `matrix`; hinzufügen über „Add“-Menü, Reihenfolge per Drag („top applies first“), einzeln entfernen; Roh-Anzeige des `transform`-Attributs
- [ ] Reset (pro Property) und „Reset All Properties“
- [ ] Undo/Redo-Buttons im Panel
- [ ] **Clip Path** (in der alten App unfertig, hier fertig bauen): Picker „None / Inherit from Layer / <vorhandene clipPaths>“, „Create Clip Path“ (pro Layer, in `<defs>`), „Edit Clip Path“ (eigener Bearbeitungsmodus auf dem Canvas, Formen darin bearbeiten), Zuweisen/Entfernen pro Node, Vererbung Layer → Node mit Override und Opt-out `none`; `clipPathUnits`; ClipPath-Definitionen sind nicht hit-testbar und nicht selektierbar

### 8. Icon-spezifische Eigenschaften (icon.json)
- [ ] **Icon Background Fill** (Root): Modi `solid`, `gradient` (linear/radial mit Stops), `auto` (automatic-gradient; Varianten light/dark, accent, monochrome, complementary), `system` (system-light / system-dark), plus Fallback-Farbe, Opacity, Blend-Modes (normal, multiply, screen, overlay, softLight, hardLight …)
- [ ] Pro Gruppe: Shadow (`kind`: neutral/chromatic/none, `opacity`), Translucency (`enabled`, `value`)
- [ ] Pro Layer: Name, Opacity, Asset-Zuordnung
- [ ] Supported Platforms (`squares`, `circles`)
- [ ] „icon.json Preview“: Live-Ansicht des generierten JSON (read-only, kopierbar)
- [ ] Export berücksichtigt Light- und Dark-Variante (Hintergrund je Appearance)

### 9. SVG-Quelltext
- [ ] „Edit SVG…“-Sheet pro Node oder Asset: CodeMirror, Monospace, Syntax-Highlighting; Änderungen werden erst übernommen, wenn das Markup fehlerfrei parst (Fehleranzeige), mit Undo
- [ ] SVG-Code-Generator mit sauber formatierter Ausgabe (Zahlen gerundet, sinnvolle Präzision)
- [ ] **Pfad-Optimierer**: Ramer-Douglas-Peucker mit Eckenschutz, Zahlen runden, redundante `L` entfernen, Whitespace komprimieren (Epsilon einstellbar)

### 10. SVG-Unterstützung (Import/Render/Export)
- [ ] Elemente: `svg` (Viewport, viewBox, preserveAspectRatio), `g`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `path`, `text`, `image` (URL und Data-URL), `clipPath`, `defs`, `linearGradient`, `radialGradient`, `use` (auflösen)
- [ ] Inline-`<style>`/CSS-Klassen beim Import auflösen (in Attribute übernehmen), Längeneinheiten (px, %, em …) korrekt
- [ ] Verlustfreier Roundtrip: unbekannte Attribute und Elemente bleiben erhalten

### 11. Undo/Redo
- [ ] Command-Pattern mit benannten Aktionen (Menü zeigt „Undo Move“, „Undo Change Attribute“ …), ⌘Z / ⇧⌘Z
- [ ] Gesten-Coalescing (siehe 4), Gruppierung zusammengesetzter Aktionen (z. B. Gruppe löschen inkl. Kinder, Surround with Group, Duplicate)
- [ ] Undo-Stack pro Dokument, Dirty-Flag am Save-Punkt

## Bewusst NICHT übernehmen
- Eigener XML-/SVG-/CSS-Parser und eigener Renderer → Browser nutzen
- SwiftData-Template-Reste (`Item`), iOS-Zweige
- Doppelte Module (EditorFeature-Shim, doppelte Formatter)
- SF-Symbol-Rasterisierung über Vision (siehe 5)

## Vorgehen (Meilensteine, nach jedem Meilenstein lauffähig + Tests grün + Commit)

1. **Setup**: Tauri-2-App mit Angular 22 (zoneless, Signals, strict), Lint/Format, Vitest, Playwright, `cargo test`, GitHub Actions (Build macOS/Windows/Linux, Tests). README mit Dev-Befehlen. Ein `AGENTS.md`/`CLAUDE.md` mit Architekturregeln anlegen.
2. **Datei-Kern (Rust)**: `open_icon`, `save_icon` (Bundle + ZIP), `import_svg`, Roundtrip-Tests mit den Fixtures; Recent Files; Dirty-Tracking.
3. **DocumentStore + Undo** im Frontend, Hierarchie read-only, Canvas-Rendering mit Zoom/Pan/Linealen/Guides.
4. **Selektion, Handles, Snapping**, Gesten-Undo. Ausführliche Geometrie-Unit-Tests (Model↔View-Koordinaten bei Zoom 50/100/150 %, verschachtelte transformierte Gruppen).
5. **Add-Befehle** (Grundformen, Text, Image, Snippet), Hierarchie mit Drag & Drop und Kontextmenü, Ausrichten.
6. **Properties-Panel** inkl. Transform-Liste und IconFill/Gruppen-Inspector, icon.json-Preview.
7. **Export** SVG (Light/Dark) und PNG (resvg, Größen-Set).
8. **Freehand, Text→Pfad, Symbol-Picker, Pfad-Optimierer, Clip Paths.**
9. **Feinschliff**: Settings, Fensterzustand, Tastaturkürzel, Menüleiste (Tauri-Menü), Signierung/Notarisierung für macOS vorbereiten (Platzhalter für Secrets), App-Icon.

## Test-Fixtures
Aus dem alten Repo `AppIconic/docs/svg/*.svg` und `AppIconic/docs/camscanner.icon/` nach `tests/fixtures/` kopieren (ich lege sie bereit; falls sie fehlen, nachfragen). Jedes Fixture muss importierbar sein, korrekt rendern (Snapshot) und verlustarm zurückgeschrieben werden.

## Arbeitsweise
- Vor dem ersten Code: kurzen Architekturplan und die Liste der Rust-Commands mit Signaturen vorschlagen und auf mein OK warten.
- Danach Meilenstein für Meilenstein; am Ende jedes Meilensteins: was fertig ist, was offen ist, abgehakte Checkboxen dieser Liste in `docs/FEATURES.md` pflegen.
- Bei Unklarheiten zum `.icon`-Format: konservativ sein, unbekannte Daten erhalten, nachfragen statt raten.
