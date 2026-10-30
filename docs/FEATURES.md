# Feature-Checkliste (Parität mit der Vorlage = Definition of Done)

> Aus `prompts/000-init.md`, korrigiert nach `docs/legacy-analysis.md`. In Klammern: Prompt, der das Feature liefert.
> Abhaken, sobald es Ende-zu-Ende funktioniert und getestet ist. Neu gegenüber der Vorlage: _(neu)_.

## 1. Dokument & Dateien

- [x] New Window ⇧⌘N, New Document ⌘N mit Dirty-Abfrage Save / Don't Save / Cancel (003, Menü und Kürzel 005)
- [x] Open… ⌘O für `.icon` (Bundle und ZIP) (002, 003)
- [x] Open Recent mit Validierung und „Clear Menu“ (003, Menü 005; natives macOS-Menü auf dem Mac prüfen)
- [x] Import SVG… ⇧⌘I als neue Gruppe/Layer/Asset (003)
- [x] Bild als Ebene importieren (PNG verlustfrei, JPEG/WebP → PNG, SVG bereinigt) in die aktive Gruppe, Bild einer
      PNG-Ebene ersetzen (Position bleibt); neue PNG-Assets byte-gleich in Bundle und ZIP _(neu)_ (080)
- [x] Dateien ins Fenster ziehen: `.icon` öffnen, SVG am Ablagepunkt (über dem Baum als neue Ebene), PNG/JPEG/WebP als Bild; Hinweis am Zeiger; Bilder/Screenshots mit ⌘V einfügen _(neu)_ (071)
- [x] Save ⌘S (nur wenn dirty), Save As… ⇧⌘S (Format Bundle/ZIP), Close ⌘W mit Dirty-Abfrage (003)
- [x] Dateizugriff nur auf Pfade aus vertrauten Quellen (Dialoge, Open Recent, System, Ablegen, KI-Brücke), sonst Fehler `not_allowed` _(neu)_ (033)
- [x] Speichern im gelesenen Format (Bundle bleibt Bundle, ZIP bleibt ZIP), atomar _(neu)_ (002, 003)
- [x] Verlustfreier Roundtrip von `icon.json` inkl. unbekannter Felder und Layer-`opacity` _(neu)_ (002, 003)
- [x] Dirty-Tracking, Fenstertitel = Dateiname + Marker (003; macOS-Punkt im Schließknopf auf dem Mac prüfen)
- [x] Mehrere Fenster/Dokumente (003; macOS: App bleibt ohne Fenster offen – auf dem Mac prüfen)
- [x] `.icon` als Dateizuordnung / Öffnen per Doppelklick _(neu)_ (030; macOS „Öffnen mit“ als Package-Dokument mit Rang Alternate, Windows Zuordnung, Linux Mime-Typ; Zweitstart/Finder öffnen in der laufenden App – Mac-Test durch Marc offen)

## 2. Layout & Einstellungen

- [x] Drei ein-/ausblendbare Seitenleisten ⌘1/⌘2/⌘3 (005), Breite 160–480 px per Splitter (Maus und Tastatur),
      Defaults 260/260/300, Doppelklick = Standardbreite; Fenstergröße/-position über `tauri-plugin-window-state` (015)
- [x] View Options: Command Sidebar, Hierarchy, Properties, Rulers, Guides, Background, Cross Cursor, Show Handles,
      Snap to Grid, Magic Snap (005 Menü View + „View Options“ im Canvas, Snap wirkt seit 007; persistent seit 015,
      dazu Grid-Abstand/-Ursprung, Selection Mode, Start-Zoom, Appearance-Vorschau, Maske, Export- und Freehand-Vorgaben)
- [x] Menüs File/Edit/View/Add/Arrange/Help aus einem Modell: natives macOS-Menü, HTML-Menüleiste Windows/Linux (005; macOS auf dem Mac prüfen)
- [x] Befehlspalette ⇧⌘P, Übersicht „Keyboard Shortcuts“, eigene Kürzel in `keymap.json` _(neu)_ (005)
- [x] Quit ⌘Q fragt alle Fenster mit ungespeicherten Änderungen nacheinander (005; auf dem Mac prüfen)
- [x] `settings.json` mit Schema-Version und Migration (je Feld nachsichtig, kaputt → `.bad`); „Reset to Default“ mit
      Bestätigung; Änderungen wirken in allen offenen Fenstern (015)
- [x] Settings-Dialog (⌘,) mit General, Canvas, Snapping, Export, AI control (018), Advanced inkl. Debug „Log Undo Grouping“ (015)
- [x] Deutsch/Englisch zur Laufzeit, natives Menü folgt _(neu)_ (015; macOS-Menü auf dem Mac prüfen)
- [x] Hell/Dunkel/System (`data-theme`, Fensterrahmen), Kontraste beider Schemata geprüft _(neu)_ (015)

## 3. Canvas

- [x] Hell/Dunkel und Maske als Umschalter in der Canvas-Toolbar; Speichern und Export… in der App-Toolbar; Undo/Redo nur dort _(neu)_ (069)
- [x] Kontextmenü auf der Zeichenfläche (Rechtsklick wählt, leere Fläche, Werkzeug), dasselbe Modell im Baum, Untermenüs Anordnen/Pathfinder, `Shift+F10` _(neu)_ (070)
- [x] Ebenenbaum: Umbenennen inline (Doppelklick/F2; Elemente über ihre `id`, Verweise folgen), Filter nach Name/id/Tag mit Hervorhebung, Alle auf-/zuklappen, `+ Gruppe`/`+ Ebene` im Kopf, Schloss an Gruppen und Ebenen _(neu)_ (072)
- [x] Properties kompakt: X/Y, B/H, RX/RY … nebeneinander, Line Cap/Join, Fill Rule, Text Anchor als Icon-Umschalter; Corners, Offset, Fillet, Transform, Pattern, Optimize Path als Popover mit Live-Vorschau (Optimize: vorher/nachher auf der Zeichenfläche) _(neu)_ (073)
- [x] Farb-Popover (Fläche, Farbton, Alpha, Hex/RGB/HSL/HSB/OKLCH, Dokument-/Zuletzt-/Paletten-Farben, System-Picker), Pipette ⇧I (auch Bilder/Verläufe über resvg), Dokumentfarben im Panel mit „im ganzen Icon ersetzen“ _(neu)_ (074)
- [x] Live-Typografie: Text-Werkzeug ⇧T, Bearbeiten per Doppelklick auf der Zeichenfläche (mehrzeilig als `tspan`s), Schrift-Combobox, Stil, Zeichenabstand, „Text in Pfad umwandeln“ für vorhandene Texte _(neu)_ (075)
- [x] Effekte je Element im Panel (Schlagschatten, innerer Schatten, Unschärfe – live, ein Filter je Element, fremde Filter bleiben), Masken erstellen/lösen, Luminanz/Alpha; Copy/Duplicate nehmen Masken und Effekte mit _(neu)_ (076)
- [x] Zoom 25/33/50/66/75/100/125/150/200 %, Anzeige, Pinch, ⌘+/⌘−/⌘0, Center Canvas (004, dazu „Fit“; Kürzel als Aktionen 005)
- [x] Pan (Scroll / Space+Drag / mittlere Maustaste) (004)
- [x] Lineale mit Haupt-/Nebenteilung, zoomabhängig (004)
- [x] Mauskoordinaten im Dokumentraum (004)
- [x] Cross Cursor (004)
- [x] Icon-Guides (Diagonalen, Raster 128…896, Kreise Ø 820/512/204, #0A84FF) (004)
- [x] Hintergrund nach Icon-Fill, Light/Dark umschaltbar (004 Vorschau; Bearbeiten 010)
- [x] Plattform-Vorschau Squircle / Kreis als Maske (004)
- [x] Assets lebendig im DOM, Reihenfolge wie Icon Composer (erste Gruppe oben), Layer-/Gruppen-Opacity, hidden, eindeutige IDs je Layer _(neu)_ (004)
- [x] Gruppen-Schatten und Transluzenz als Vorschau-Annäherung _(neu)_ (010: „Effects Preview“, Schatten je Layer)
- [x] Große SVGs ziehen: Schatten komponiert (pixelgleich), Menüs/Add-Leiste/Dokumentfarben ruhen während einer Geste, Snap-Kandidaten ohne Suche je Element _(neu)_ (033; Messung in `docs/architecture.md` „Performance“, Mac offen)
- [x] BoundsGuard (Punkte, Pfade, Translationen klemmen) (007)

## 4. Auswahl & Manipulation

- [x] Selection Modes none / point / boxed, Mehrfachauswahl ⇧/⌘, Rahmenauswahl (007)
- [x] Auswahlwerkzeug V (Rahmen) und Direktauswahl A (Punkte) _(neu)_ (061): beenden jedes Werkzeug; aktives
      Werkzeug in der Command Sidebar markiert (auch eingeklappt, Gruppen zeigen die aktive Variante) und in der
      Statuszeile genannt
- [x] Hit-Testing, Klick ins Leere hebt Auswahl auf, Doppelklick in Gruppe, Esc heraus (007)
- [x] Handles position/size/control/anchor/midpoint/pivot mit Farben/Größen der Vorlage, Box-Handles (007)
- [x] Punktbearbeitung Polyline/Polygon/Pfad (alle Befehle, relativ bleibt relativ), Punkt einfügen über Mitte, löschen mit ⌥-Klick/Entf (007)
- [x] Pfeiltasten 1 px / ⇧ 10 px, eine Undo-Aktion je Folge (007)
- [x] Snapping Grid (10, worldZero/svgCenter) und Magic Snap (20 Bildschirm-px, Magic vor Grid), Snap-Hinweis (007)
- [x] Raster-Hinweis _(neu)_: bei aktivem Snap to Grid Rasterpunkte um den Zeiger (Radius ≥ 72 Bildschirm-px,
      ausblendend, nächster Kreuzungspunkt größer; keiner bei Zellen < 6 Bildschirm-px)
- [x] Gesten = eine Undo-Gruppe (ein Command `setAttributes`), Esc bricht ab (007)
- [x] Layer-Handles _(neu)_ (080): gewählte Ebene (SVG oder PNG) im Rahmen ziehen = `position` verschieben, Eckgriffe
      skalieren gleichmäßig um die Mitte; Snap wie 007, ein Undo-Schritt, je Erscheinungsbild
- [x] Handles korrekt bei verschachtelten, transformierten Gruppen und Zoom 50/100/150 % (007, Playwright ± 0,5 px)
- [x] Gesperrte Elemente sind für Trim/Extend/Fillet/Chamfer, Pfad-Werkzeuge, Pathfinder, Offset, Corners und Transform nur Begrenzung, nie Ziel _(neu)_ (064)
- [x] Hilfslinien gesperrt (Standard), „Hilfslinien sperren“/„Alle Hilfslinien entfernen“; Alles auswählen ohne gesperrte Elemente _(neu)_ (066)

## 5. Elemente hinzufügen

- [x] Sidebar geordnet nach Werkzeugen, Konstruktion (einklappbar, gemerkt), Einfügen; Menü „Ändern“ für Befehle und Dialoge; Rotate/Scale/Reflect in der Sidebar _(neu)_ (068)
- [x] Kontextleiste für jedes aktive Werkzeug _(neu)_ (067): Name, Optionen (Farbe/Kontur/Stärke beim Zeichnen, Ecken/Zacken, Fillet-Radius vor dem Klick, Glättung, Beziehungen, Füllfarbe), Tipp, Fertig; F6 hinein, Esc zurück; `tool.option` für die KI
- [x] Group (Icon-Gruppe + Layer + Asset) und Container `<g>` (008; Command Sidebar mit Suche, Menü „Add“, Aktionen mit Argumenten; Sidebar und Menü nach Formen mit Untermenüs wie Fusion, `add-layout.ts`)
- [x] Circle, Ellipse, Rectangle, Line, Polyline, Polygon, Path, Text mit der Geometrie der Vorlage, Stil dünne Linie ohne Fill bzw. der gemerkte je Formtyp (008, 019 E13; zentriert im sichtbaren Ausschnitt, auch in transformierten Gruppen; „… at Center“ seit 019)
- [x] Zeichenwerkzeuge wie Fusion _(neu)_ (019): Line, Midpoint Line; Rectangle ▸ 2-Point / 3-Point / Center; Circle ▸
      Center Diameter / 2-Point / 3-Point / 2-Tangent / 3-Tangent; Arc ▸ 3-Point / Center Point / Tangent; Polygon ▸
      Circumscribed / Inscribed / Edge (Ecken 3–64, Default 6, die letzte Zahl bleibt) – Klicks mit Grid-/Magic-Snap,
      Maßfelder (Ecken, Länge, Winkel, Breite, Höhe, Durchmesser, Radius, Start-/Bogenwinkel; Tab, Enter,
      Esc), Tangenten an Kanten und Kreisen, Kürzel `l`/`r`/`c`, `sketch.* { points, values }` für die KI; nach jeder
      Form wieder Auswahl, ausgewählte Formen auch innerhalb des Rahmens ziehbar
- [x] Formen aufziehen wie VectorCraft _(neu)_ (041): Rectangle / Ellipse / Polygon / Line Segment Tool – Ziehen,
      Shift (Quadrat/Kreis/45°/aufrecht), Alt (von der Mitte), Leertaste (verschieben), ↑/↓ (Ecken), Klick → Größendialog;
      Snap-Ziele: Magic-Punkte, „align“ und Schnittpunkte („intersect“, 040)
- [x] Smart Guides wie VectorCraft _(neu)_ (040): Schnittpunkte auch mit Kurven, Labels (anchor, center, path,
      intersect, tangent, perpendicular, align), Kontur, Tangente/Senkrecht, Konstruktionswinkel 45°, Verlängerung;
      Schalter „Smart Guides“
- [x] Zeichenstift wie VectorCraft _(neu)_ (042): Ecken und glatte Punkte, Alt/Shift/Leertaste, schließen,
      fortsetzen, Enter/Esc, Kürzel `p`
- [x] Kurvenzeichner (Curvature) wie VectorCraft _(neu)_ (043): glatte Kurve durch Klicks, Ecken, ausgewählten Pfad
      bearbeiten (ziehen, einfügen, umschalten, entfernen)
- [x] Weitere Formen wie VectorCraft _(neu)_ (044): abgerundetes Rechteck, Stern, Spirale, Rechteck- und Polarraster,
      Bogen – Ziehen mit ↑/↓, Shift, Alt; Größendialog
- [x] Live Corners wie VectorCraft _(neu)_ (045): Ecken-Widgets an Rechteck/Polygon/geradem Pfad, rund/invers/Fase,
      Dialog „Ecken…“
- [x] Pfade bearbeiten wie VectorCraft _(neu)_ (046): Ankerpunkt hinzufügen/löschen/umwandeln, Schere, Glätten,
      Pfad-Radiergummi, Join (⌘J), Convert to Path, Auto Add/Delete des Zeichenstifts; Messer/Cuts mit 047.
- [x] Pathfinder und Shape Builder _(neu)_ (047): Vereinigen, Vorderes abziehen, Schnittmenge, Ausschließen,
      Unterteilen, Formerstellung (Ziehen vereinigt, Alt löscht), Messer, Linien- und Rechteckschnitt (paper.js).
- [x] Messen und Bemaßen _(neu)_ (048): Messwerkzeug (Abstand, Winkel, Δx/Δy), Bemaßung von Kante, Ecke (Winkel),
      Kreis (Radius/Durchmesser) oder zwei Punkten; beim Export wählbar weggelassen.
- [x] Konstruktionslinien, Muster, Spiegeln, Klonen wie Fusion 360 _(neu)_ (049): Konstruktion (X, im SVG
      transparent, im Canvas gestrichelt blau), kreisförmiges und rechteckiges Muster mit Live-Vorschau, Spiegeln an
      zwei Punkten, verknüpfter Klon (`<use>`).
- [x] Trimmen und Verlängern wie Fusion 360 _(neu)_ (050): Stück zwischen Schnittpunkten wegschneiden (Klick oder
      Ziehen), offenes Ende bis zur nächsten Kontur verlängern.
- [x] Verrunden und Fasen zwischen Elementen _(neu)_ (051): Linie/Linie, Linie/Bogen, Kurven, Ecke eines Pfads; Radius
      im Dialog mit Live-Vorschau.
- [x] Versatz und Kontur in Fläche _(neu)_ (052): Pfad verschieben (außen/innen, Ecken, Vorschau live), Konturlinie
      (Strich wird Fläche).
- [x] Transformieren mit Bezugspunkt _(neu)_ (053): Dreh-, Skalier-, Spiegelwerkzeug (Bezugspunkt per Klick, ⌥ Kopie),
      Dialog Transformieren… mit Zahlen, 9er-Bezugspunkt, einzeln, Kopie.
- [x] Verteilen und Ausrichten an Leinwand/Basisobjekt _(neu)_ (054): Mitten/Abstände verteilen, fester Abstand,
      Ausrichten an Auswahl, Leinwand oder Basisobjekt; Abschnitt „Ausrichten“ im Properties-Panel.
- [x] Sperren und Isolieren _(neu)_ (055): Sperren (⌘L, Schloss im Baum, bleibt fangbar), Alle entsperren, Gruppe
      isolieren (Rest gedimmt), Konstruktionslinien ausblenden.
- [x] Hilfslinien aus dem Lineal und Icon-Raster _(neu)_ (056): Hilfslinien ziehen (gespeichert, fangbar, nicht im
      Export), Raster Apple / Material-Keylines / gleichmäßig.
- [x] Vorschau in kleinen Größen und Pixelraster _(neu)_ (057): 16/32/64/128 px live im Canvas, Pixelraster mit
      Fangen, Am Pixelraster ausrichten.
- [x] Direkt als Konstruktion zeichnen _(neu)_ (058): Schalter Konstruktion (⇧X) in der Canvas-Werkzeugleiste.
- [x] Abhängigkeiten und treibende Maße wie Fusion 360 (059): deckungsgleich, horizontal, vertikal, parallel,
      senkrecht, tangential, gleich, konzentrisch, Mittelpunkt, symmetrisch, fixiert; Abstand, Länge, Radius, Durchmesser,
      Winkel als treibende Maße (Wert ändern → Geometrie folgt); Punkte ziehen hält alle Beziehungen; Werkzeug K
- [x] Abhängigkeiten im Alltag _(neu)_ (065): verletzte rot + „Jetzt lösen“, optional automatisch nachlösen (Einstellung), Maße per Entf löschbar, Liste im Properties-Panel, keine Reste nach Löschen/Ersetzen, Kopien behalten ihre Beziehungen
- [x] Flächen füllen wie „Interaktiv malen“ (060): Werkzeug F füllt jede von Linien, Bögen und Kreisen umschlossene
      Fläche (auch aus offenen Linien); die Füllung folgt live, wenn sich die Umrisse ändern (im selben Undo-Schritt)
- [x] Stil-Gedächtnis je Formtyp _(neu)_ (019): neue Formen übernehmen Fill/Stroke/Breite/Deckkraft … der zuletzt
      gezeichneten oder geänderten Form ihres Typs (`settings.json` `drawing.styles`); Default dünne Linie ohne Fill
- [x] Image ⌘I als Data-URL (008; PNG/JPEG/WebP/SVG ≤ 20 MiB, natürliche Größe ≤ 512)
- [x] SVG Snippet (008; bereinigt, `defs`, IDs eindeutig, auf die Bounds zentriert)
- [x] Freehand mit RDP + Glättung, offen/geschlossen, Live-Vorschau, Esc (013; Werkzeug-Modus, Optionen Glättung/Strichbreite, `C`, Auto-Schließen, `add.freehand { points }` für die KI)
- [x] Text to Path mit Systemschriften (Rust, fontdb) (013; harfrust-Shaping + skrifa-Umrisse, Dialog mit Vorschau, fehlende Glyphen → Fehler)
- [x] Symbol-Picker mit freiem Icon-Set, Suche, Gewicht/Größe, Plugin-Schnittstelle (013; Lucide ISC, Daten lazy, Lizenz in THIRD-PARTY-NOTICES.txt und About)

## 6. Hierarchie

- [x] Hilfslinien, Bemaßungen, Konstruktionslinien und Live-Füllungen mit eigenem Namen und Icon _(neu)_ (066); offene Live-Füllung mit Warnung
- [x] Einheitliche Reihenfolge „oben = vorn“ auch für SVG-Knoten _(neu)_ (063): Ziehen, Move Up/Down/Into/Out, Bring to Front folgen der Anzeige; das DOM bleibt unverändert
- [x] Baum Root → Gruppen → Layer → Nodes, Typ-Icon, Name, Swatches, Sichtbarkeit (006; „Definitions“-Knoten, ab 500 Zeilen virtualisiert)
- [x] Auswahl synchron mit Canvas, Mehrfachauswahl (006; APG-Tree-Tastatur, Auswahlrahmen im Canvas; Auswahl per Klick im Canvas: 007)
- [x] Drag & Drop mit Einfügelinie vor/nach/hinein, Nachfahren-Schutz, über Assets (006; Command „Reorder Node“, Move Up/Down/Into/Out per Tastatur)
- [x] Kontextmenü Duplicate, Group <g>, Bring to Front, Send to Back, Edit SVG…, Copy XML, Delete… (006; „Edit SVG…“ aktiv ab 011)
- [x] Folge-Auswahl nach dem Löschen (006)
- [x] Ausrichten (≥ 2 Nodes, Vereinigungs-Box, inkl. Transforms) (006)
- [x] Copy/Paste als SVG-XML, auch zwischen Dokumenten (006)

## 7. Properties

- [x] Leerzustand „Nothing selected – Select an element in the hierarchy…“ (009; Root/Gruppe/Layer: Hinweis auf 010)
- [x] Kopf „Position & Größe“ _(neu)_ (062): X/Y des Bezugspunkts, B/H mit Schloss, Drehung, Spiegeln, 9-Punkte-Bezug –
      für jede Auswahl (Pfad, Gruppe, Text, Bild, gemischte Mehrfachauswahl) im Dokumentraum; ein Element im eigenen
      gedrehten Rahmen (Größe entlang seiner Achsen), mehrere: Box um alle, Drehung relativ; `properties.box` für die KI
- [x] Editoren aus Property-Specs (Typ, Einheit, Min/Max, Schritt) für alle Attribute aus legacy §7.4 (009; Abschnitte Geometry/Appearance/Stroke/Text/Transform/Advanced, Mehrfachauswahl „mixed“, getippte Werte = ein Undo-Schritt)
- [x] Farbeingabe Swatch + Hex (#RRGGBB/#RRGGBBAA – CSS-Reihenfolge, Frage an Marc), none/inherit/currentColor/mixed, nativer Farbwähler, Verlaufs-Swatch (009)
- [x] Stepped Slider (↑/↓, ⇧ × 10, Ziehen am Label), Constrain proportions (width/height, rx/ry, scale) (009)
- [x] Transform-Liste (Schritte, Pivot, Reihenfolge per Drag/Alt+↑↓, Rohanzeige mit Validierung) (009)
- [x] Reset je Property, Reset All Properties (mit Bestätigung), Undo/Redo-Knöpfe (009)
- [x] Clip Path: Picker, Create, Edit-Modus, Vererbung, `clipPathUnits` (014; Layer-Clip = Clip-Gruppe, Opt-out/Override über Teilen statt `clip-path="none"`, Treffer durch Clips, Referenzpflege bei Löschen/Duplicate/Copy/Paste)

## 8. Icon-Eigenschaften

- [x] Hintergrund-Fill: automatic, system-light/-dark, none, solid, automatic-gradient, linear-gradient mit Orientierung (Apple-Format); radial-gradient nur lesen – nicht belegt (010)
- [x] Specializations je Appearance (Default/Dark/Tinted) für alle belegten Felder _(neu)_; `idiom`-Varianten bleiben erhalten (010)
- [x] Gruppe: Name, Hidden, Opacity, Blend-Mode, Lighting, Specular, Blur, Shadow (neutral/chromatic/off, opacity), Translucency (enabled, value), Position (010)
- [x] Layer: Name (eindeutig), Opacity, Asset-Zuordnung und Umbenennen der Datei, Hidden, Blend-Mode, Glass, Fill, Position (010)
- [x] Supported Platforms (squares, circles) und Farbraum für SVG-Farben ohne Profil (010)
- [x] icon.json Preview (read-only, kopierbar, letzte Änderung markiert); „Other properties (read-only)“ (010)
- [x] Canvas-Vorschau: Fill je Appearance, Schatten/Transluzenz/Blend-Modes als Annäherung (Ansichtsoption) (010)
- [x] Layer-Fill färbt den Layer in Vorschau und Export (Inhalt als Alpha-Maske; automatic/none = eigene Farben) (077)
- [x] Tinted-Vorschau und -Export als Annäherung (Luminanz × Tönung, Tönung in der Canvas-Toolbar, nicht im Dokument;
      tinted-Specializations wirken) (077)
- [x] `plus-darker`: nativ, wo die WebView es kann, sonst und im Export `multiply` (077)
- [x] Liquid Glass angenähert: Glanzkante (specular), Milchglas-Aufhellung (blur-material), combined/individual (077)
- [ ] radial-gradient anlegen – im Modell fertig, im Fill-Editor erst mit Beleg aus Icon Composer (077 E5, Frage an Marc)

## 9. SVG-Quelltext

- [x] Edit SVG… mit CodeMirror, Fehleranzeige, Übernahme nur bei gültigem Markup, Undo (011: Node oder Asset, Lint-Marker mit Zeile/Spalte, ⌘Enter/Esc, Auswahl bleibt)
- [x] Code-Formatierung (Zahlen runden, Einrückung) (011: Knopf „Format“ im Dialog, „Copy XML“)
- [x] Pfad-Optimierer (RDP mit Eckenschutz, epsilon einstellbar) (011: Aktion „Optimize Path…“ mit Vorschau, kürzeste Form)

## 10. SVG-Unterstützung

- [x] Elemente aus legacy §10 + `use`, `defs`, Verläufe rendern und bearbeiten (004 rendern, 009 Attribute von
      `use`/`stop`/`image` bearbeitbar, Verläufe über Stops und „Edit SVG…“)
- [x] Eigener Verlaufseditor (Richtung, Einheiten, Spread, Stops auf der Fläche) _(neu)_ (032): Abschnitt
      „Gradient“ im Properties-Panel (Art, Einheiten, Spread, Transform, Stop-Leiste mit Ziehen/Klick/Tasten, geerbte
      Stops), Griffe auf der Zeichenfläche (Start/Ende, Mitte/Radius/Fokus), geteilte Verläufe „nur hier“, Anlegen
      für Fill/Stroke, Aktionen `gradient.*`
- [x] Inline-`<style>`/Klassen beim Import in Attribute auflösen, Einheiten (003)
- [x] Unbekannte Attribute/Elemente bleiben erhalten (002 unveränderte Assets byte-genau; 003 bearbeitete SVGs über DOM-Serialisierung)
- [x] Fremdes SVG wird bereinigt (Skripte, Event-Handler, externe Referenzen) _(neu)_ (003)

## 11. Export

- [x] Export SVG je Appearance (Light/Dark, Tinted als Annäherung mit Tönung – 077) inkl. Hintergrund, Gruppen, Layer, Layer-Opacity, Layer-Fill (012, 077)
- [x] Export PNG mit resvg, Größen-Set 1024/512/256/128/64/32/16 _(neu: Größen)_ (012; Fortschritt, Abbruch, Apple-Hinweis zur Transparenz)
- [x] Optional mit Plattform-Maske _(neu)_ (012; dazu Schatten/Effekte als Annäherung, Schalter)
- [x] Share Export → „Im Ordner zeigen“ nach dem Export (030 E6; Share-Sheet bewusst nicht)
- [x] Xcode `AppIcon.appiconset` (Contents.json; iOS 1024 als App-Store-Icon ohne Alpha + Dark/Tinted über
      `appearances`/`luminosity`, macOS 16–512 @1x/@2x mit Maske, Rand und Schatten, optional watchOS) _(neu)_ (078)
- [x] macOS `.icns` und Windows `.ico` (16–256, PNG-kodiert), eigene kleine Writer _(neu)_ (078)
- [x] Als PNG kopieren (⇧⌘C / Strg+Umschalt+C, Rust rendert, System-Zwischenablage) und „Erneut exportieren“ je Dokument _(neu)_ (078)
- [x] Android: Adaptive Icon (Vordergrund/Hintergrund/Monochrom, 108 dp, `mipmap-mdpi` … `xxxhdpi`,
      `mipmap-anydpi-v26/ic_launcher.xml` + `_round`), Legacy-Icons 48 dp, Play-Store 512; Gruppen je Ebene wählbar,
      Monochrom aus der Tinted-Rechnung _(neu)_ (079)
- [x] Web/PWA: `favicon.ico` (16/32/48), `favicon.svg` hell/dunkel über `prefers-color-scheme`,
      `apple-touch-icon.png` (180, deckend), `icon-192/512`, `icon-maskable-512` (sichere Zone), Manifest-Ausschnitt
      und `<link>`-Snippet zum Kopieren _(neu)_ (079)

## 11a. KI-Steuerung (MCP) _(neu)_

- [x] Sidecar `app-iconic-mcp` (stdio) + lokale Brücke (127.0.0.1, Token je Start), Einstellung „KI-Steuerung (MCP) erlauben“ (Standard aus), Konfig-Zeile für Claude Code, Status „KI verbunden“, „KI trennen“ (018)
- [x] Tools: Dokumente, Lesen (icon.json, Baum, Node mit BBox, Asset-SVG, Auswahl), Schreiben (Commands, Aktionen, SVG, Auswahl), Vorschau als PNG, Export, Speichern (018); `export_package` (appiconset/icns/ico, 078; android/web, 079)
- [x] Jeder KI-Aufruf ein Undo-Schritt („Undo AI: …“), erwartete Revision, Rückfrage vor Speichern an neuem Ort/Export, Sperrliste (018)
- [x] Sidecar in den Paketen, signiert wie die App (030: Release-Workflow baut ihn und bündelt ihn über `tauri.sidecar.conf.json`)

## 12. Undo/Redo

- [x] Benannte Aktionen im Menü („Undo Move“ …), ⌘Z / ⇧⌘Z (003 Namen, 005 Menü und Kürzel)
- [x] Gesten-Coalescing und zusammengesetzte Aktionen (003 UndoService; Gesten im UI und Pfeiltasten-Folgen 007)
- [x] Undo-Stack je Dokument, Dirty am Save-Punkt (003)
