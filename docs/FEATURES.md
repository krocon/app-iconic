# Feature-Checkliste (Parität mit der Vorlage = Definition of Done)

> Aus `prompts/000-init.md`, korrigiert nach `docs/legacy-analysis.md`. In Klammern: Prompt, der das Feature liefert.
> Abhaken, sobald es Ende-zu-Ende funktioniert und getestet ist. Neu gegenüber der Vorlage: *(neu)*.

## 1. Dokument & Dateien
- [x] New Window ⇧⌘N, New Document ⌘N mit Dirty-Abfrage Save / Don't Save / Cancel (003 – Toolbar + provisorische Kürzel; Menü 005)
- [x] Open… ⌘O für `.icon` (Bundle und ZIP) (002, 003)
- [x] Open Recent mit Validierung und „Clear Menu“ (003 – Toolbar-Menü; natives Menü 005)
- [x] Import SVG… ⇧⌘I als neue Gruppe/Layer/Asset (003)
- [x] Save ⌘S (nur wenn dirty), Save As… ⇧⌘S (Format Bundle/ZIP), Close ⌘W mit Dirty-Abfrage (003)
- [x] Speichern im gelesenen Format (Bundle bleibt Bundle, ZIP bleibt ZIP), atomar *(neu)* (002, 003)
- [x] Verlustfreier Roundtrip von `icon.json` inkl. unbekannter Felder und Layer-`opacity` *(neu)* (002, 003)
- [x] Dirty-Tracking, Fenstertitel = Dateiname + Marker (003; macOS-Punkt im Schließknopf auf dem Mac prüfen)
- [x] Mehrere Fenster/Dokumente (003; macOS: App bleibt ohne Fenster offen – auf dem Mac prüfen)
- [ ] `.icon` als Dateizuordnung / Öffnen per Doppelklick *(neu)* (016)

## 2. Layout & Einstellungen
- [ ] Drei ein-/ausblendbare Seitenleisten ⌘1/⌘2/⌘3, Breite 160–480 px, Defaults 260/260/300 (015)
- [ ] View Options: Command Sidebar, Hierarchy, Properties, Rulers, Guides, Background, Cross Cursor, Show Handles,
      Snap to Grid, Magic Snap (005, 015)
- [ ] `settings.json` mit Schema-Version und Migration; „Reset to Default“ mit Bestätigung (015)
- [ ] Settings-Dialog inkl. Debug „Log Undo Grouping“ (015)
- [ ] Deutsch/Englisch zur Laufzeit *(neu)* (015)

## 3. Canvas
- [ ] Zoom 25/33/50/66/75/100/125/150/200 %, Anzeige, Pinch, ⌘+/⌘−/⌘0, Center Canvas (004)
- [ ] Pan (Scroll / Space+Drag) (004)
- [ ] Lineale mit Haupt-/Nebenteilung, zoomabhängig (004)
- [ ] Mauskoordinaten im Dokumentraum (004)
- [ ] Cross Cursor (004)
- [ ] Icon-Guides (Diagonalen, Raster 128…896, Kreise Ø 820/512/204, #0A84FF) (004)
- [ ] Hintergrund nach Icon-Fill, Light/Dark umschaltbar (004, 010)
- [ ] Plattform-Vorschau Squircle / Kreis als Maske (004)
- [ ] Gruppen-Schatten und Transluzenz als Vorschau-Annäherung *(neu)* (010)
- [ ] BoundsGuard (Punkte, Pfade, Translationen klemmen) (007)

## 4. Auswahl & Manipulation
- [ ] Selection Modes none / point / boxed, Mehrfachauswahl ⇧/⌘ (007)
- [ ] Hit-Testing, Klick ins Leere hebt Auswahl auf, Doppelklick in Gruppe (007)
- [ ] Handles position/size/control/anchor/midpoint/pivot mit Farben/Größen der Vorlage (007)
- [ ] Punktbearbeitung Polyline/Polygon/Pfad (line & cubic), Punkt einfügen über Mitte (007)
- [ ] Pfeiltasten 1 px / ⇧ 10 px (007)
- [ ] Snapping Grid (10, worldZero/svgCenter) und Magic Snap (20 Bildschirm-px, Magic vor Grid) (007)
- [ ] Gesten = eine Undo-Gruppe, Esc bricht ab (007)
- [ ] Handles korrekt bei verschachtelten, transformierten Gruppen und Zoom 50/100/150 % (007)

## 5. Elemente hinzufügen
- [ ] Group (Icon-Gruppe + Layer + Asset) und Container `<g>` (008)
- [ ] Circle, Ellipse, Rectangle, Line, Polyline, Polygon, Path, Text mit Defaults der Vorlage (008)
- [ ] Image ⌘I als Data-URL (008)
- [ ] SVG Snippet (008)
- [ ] Freehand mit RDP + Glättung, offen/geschlossen, Live-Vorschau, Esc (013)
- [ ] Text to Path mit Systemschriften (Rust, fontdb) (013)
- [ ] Symbol-Picker mit freiem Icon-Set, Suche, Gewicht/Größe, Plugin-Schnittstelle (013)

## 6. Hierarchie
- [ ] Baum Root → Gruppen → Layer → Nodes, Typ-Icon, Name, Swatches, Sichtbarkeit (006)
- [ ] Auswahl synchron mit Canvas, Mehrfachauswahl (006)
- [ ] Drag & Drop mit Einfügelinie vor/nach/hinein, Nachfahren-Schutz, über Assets (006)
- [ ] Kontextmenü Duplicate, Group <g>, Bring to Front, Send to Back, Edit SVG…, Copy XML, Delete… (006)
- [ ] Folge-Auswahl nach dem Löschen (006)
- [ ] Ausrichten (≥ 2 Nodes, Vereinigungs-Box, inkl. Transforms) (006)
- [ ] Copy/Paste als SVG-XML, auch zwischen Dokumenten (006)

## 7. Properties
- [ ] Leerzustand „Nothing selected – Select an element in the hierarchy…“ (009)
- [ ] Editoren aus Property-Specs (Typ, Einheit, Min/Max, Schritt) für alle Attribute aus legacy §7.4 (009)
- [ ] Farbeingabe Swatch + Hex (#RRGGBB/#AARRGGBB), none/inherit/mixed (009)
- [ ] Stepped Slider, Constrain proportions (009)
- [ ] Transform-Liste (Schritte, Pivot, Reihenfolge per Drag, Rohanzeige) (009)
- [ ] Reset je Property, Reset All Properties, Undo/Redo-Knöpfe (009)
- [ ] Clip Path: Picker, Create, Edit-Modus, Vererbung, `clipPathUnits` (014)

## 8. Icon-Eigenschaften
- [ ] Hintergrund-Fill: automatic, system-light/-dark, solid, automatic-gradient, linear-/radial-gradient (Apple-Format) (010)
- [ ] Specializations je Appearance (light/dark/tinted) soweit im Format vorhanden *(neu)* (010)
- [ ] Gruppe: Shadow (neutral/chromatic/none, opacity), Translucency (enabled, value) (010)
- [ ] Layer: Name, Opacity, Asset-Zuordnung (010)
- [ ] Supported Platforms (squares, circles) (010)
- [ ] icon.json Preview (read-only, kopierbar) (010)

## 9. SVG-Quelltext
- [ ] Edit SVG… mit CodeMirror, Fehleranzeige, Übernahme nur bei gültigem Markup, Undo (011)
- [ ] Code-Formatierung (Zahlen runden, Einrückung) (011)
- [ ] Pfad-Optimierer (RDP mit Eckenschutz, epsilon einstellbar) (011)

## 10. SVG-Unterstützung
- [ ] Elemente aus legacy §10 + `use`, `defs`, Verläufe rendern und bearbeiten (004, 009)
- [x] Inline-`<style>`/Klassen beim Import in Attribute auflösen, Einheiten (003)
- [x] Unbekannte Attribute/Elemente bleiben erhalten (002 unveränderte Assets byte-genau; 003 bearbeitete SVGs über DOM-Serialisierung)
- [x] Fremdes SVG wird bereinigt (Skripte, Event-Handler, externe Referenzen) *(neu)* (003)

## 11. Export
- [ ] Export SVG je Appearance (Light/Dark) inkl. Hintergrund, Gruppen, Layer, Layer-Opacity (012)
- [ ] Export PNG mit resvg, Größen-Set 1024/512/256/128/64/32/16 *(neu: Größen)* (012)
- [ ] Optional mit Plattform-Maske *(neu)* (012)
- [ ] Share Export (macOS, optional) (016)

## 12. Undo/Redo
- [ ] Benannte Aktionen im Menü („Undo Move“ …), ⌘Z / ⇧⌘Z (003 ✓ Namen, Toolbar, provisorische Kürzel; Menü 005)
- [ ] Gesten-Coalescing und zusammengesetzte Aktionen (003 ✓ UndoService; Gesten im UI 007)
- [x] Undo-Stack je Dokument, Dirty am Save-Punkt (003)
