# Design 019: Zeichenwerkzeuge (Sketch) und Stil-Gedächtnis

Status: umgesetzt · Datum: 27.10.2026

## Ausgangslage

008 fügt Formen mit Legacy-Defaults in der Mitte des sichtbaren Ausschnitts ein (`AddService.insertBuilt`, ein
`composite` aus `insertNode`, Einfügeort 008 E2, `local` = Dokument → Benutzerraum des Elternelements). 013 hat mit
Freehand den ersten Werkzeug-Modus (Root-Store, Overlay in Viewport-Pixeln, Esc über `canvas.escape`). 007 liefert
Snapping (`snapPoint`, Magic-Punkte `magicPoints`, Snap-Hinweis), `paintedRoots` und `readGeometry`, 011 den
Pfad-Tokenizer. 015 hat `settings.json` mit feldweise nachsichtigem Lesen in Rust und TS.

Marcs Antworten (27.10.2026): Stil **je Formtyp**; Tangenten an **Kanten und Kreisen**; **Line und Midpoint Line**
werden ebenfalls Werkzeuge.

## Entscheidungen

### Werkzeuge

- **E1 Aktionen** (Gruppe `add`): `sketch.line`, `sketch.midpointLine`, `sketch.rect2p`, `sketch.rect3p`,
  `sketch.rectCenter`, `sketch.circleCenter`, `sketch.circle2p`, `sketch.circle3p`, `sketch.circle2t`,
  `sketch.circle3t`, `sketch.arc3p`, `sketch.arcCenter`, `sketch.arcTangent`. Ohne Argumente schalten sie das
  Werkzeug ein (gleiche Aktion noch einmal = aus); mit Argumenten zeichnen sie direkt (E14). Kürzel wie Fusion
  global `l` (Line), `r` (2-Point Rectangle), `c` (Center Diameter Circle) – `c` im Kontext `canvas` bleibt zuerst
  `freehand.toggleClosed`, das nur bei aktivem Freihand-Werkzeug aktiv ist und die Taste sonst durchlässt.
- **E2 Menü wie Fusion**: Add › Line, Midpoint Line, Rectangle ▸ (2-Point, 3-Point, Center), Circle ▸ (Center
  Diameter, 2-Point, 3-Point, 2-Tangent, 3-Tangent), Arc ▸ (3-Point, Center Point, Tangent); danach Ellipse, Path,
  Polyline, Polygon, Text. Die Sofort-Aktionen `add.line`, `add.rect`, `add.circle` (Einfügen in der Mitte, 008)
  bleiben für Palette, Sidebar und KI, heißen jetzt „Line (Default)“ usw. Die Command Sidebar bekommt einen
  Abschnitt **Sketch** mit allen Werkzeugen und eigenen Icons.
- **E3 Werkzeug-Modus** (`SketchStore`, Root wie `FreehandStore`): genau ein Werkzeug aktiv; Freehand und Sketch
  schließen sich aus. Ein Klick (linke Taste) setzt den Punkt des aktuellen Schritts; Ziehen vom ersten Punkt und
  Loslassen ≥ 4 Bildschirm-px daneben setzt den zweiten (wie Fusion). Auswahl, Handles und Rahmenauswahl ruhen;
  Leertaste/Mitteltaste pannen weiter. Nach dem letzten Schritt wird die Form eingefügt (ein Undo-Schritt, Auswahl
  = neue Form). Danach geht das Werkzeug aus (Marc, 27.10.2026: „nach dem Zeichnen verschieben“ – Abweichung von
  Fusion, das aktiv bleibt); die nächste Form startet wieder mit `l`/`r`/`c` oder dem Menü. Eine ausgewählte Form
  lässt sich auch innerhalb ihres Auswahlrahmens ziehen, nicht nur an der Linie (ungefüllte Formen haben kein
  Inneres zum Treffen). Esc (`canvas.escape`): laufende Form verwerfen,
  sonst Werkzeug beenden. Cursor `crosshair`, Hinweis je Schritt in der Statuszeile.
- **E4 Punkte im Dokumentraum**, jeder Punkt durch `snapPoint` (Grid + Magic wie 007 E13, ⌥ = aus, Magic-Punkte
  einmal je Werkzeugstart bzw. nach jedem Einfügen gesammelt); bereits gesetzte Punkte des laufenden Werkzeugs
  sind Magic-Kandidaten. Der Snap-Hinweis aus 007 zeigt, wohin gerastet wird. Getippte Maße haben Vorrang vor dem
  Snap.
- **E5 Schritte und Maße** (rein, `shared/geometry/sketch/sketch-tools.ts`). Längen in Dokument-Einheiten,
  Winkel in Grad **gegen den Uhrzeigersinn, 0° = rechts** (wie Fusion, trotz y nach unten), angezeigt 0…360.

  | Werkzeug | Schritte (Felder) |
  |---|---|
  | Line | Start · Ende (Länge, Winkel) |
  | Midpoint Line | Mitte · Ende (Länge = ganze Linie, Winkel) |
  | 2-Point Rectangle | Ecke · Gegenecke (Breite, Höhe) |
  | 3-Point Rectangle | Ecke · zweite Ecke (Länge, Winkel) · Seite (Höhe) |
  | Center Rectangle | Mitte · Ecke (Breite, Höhe) |
  | Center Diameter Circle | Mitte · Punkt auf dem Kreis (Durchmesser) |
  | 2-Point Circle | Punkt · gegenüberliegender Punkt (Durchmesser, Winkel) |
  | 3-Point Circle | Punkt · Punkt · Punkt |
  | 2-Tangent Circle | Bezug · Bezug · Punkt (Durchmesser) |
  | 3-Tangent Circle | Bezug · Bezug · Bezug · Wahl |
  | 3-Point Arc | Start · Ende · Punkt auf dem Bogen (Radius) |
  | Center Point Arc | Mitte · Start (Radius, Startwinkel) · Ende (Bogenwinkel) |
  | Tangent Arc | Endpunkt einer Linie/eines Bogens · Ende (Radius, Bogenwinkel) |

  Ein festes Maß ersetzt die Größe aus dem Zeiger, die Richtung/Seite kommt weiter aus dem Zeiger (Breite 200 bei
  Zeiger links der Ecke = 200 nach links). Höhe beim 3-Point Rectangle: Seite der Kante, auf der der Zeiger ist.
  Center Point Arc: der Bogenwinkel folgt der Zeigerbewegung (abgewickelt, −359,9…359,9°), getippt mit Vorzeichen
  (+ = gegen den Uhrzeigersinn).
- **E6 Maßfelder wie Fusion** (`SketchOverlay`): kleine Eingabefelder neben dem Zeiger, das erste bekommt beim
  Schritt den Fokus, sie zeigen live den Wert aus dem Zeiger. Die erste getippte Taste ersetzt den Live-Wert, Tippen
  setzt den Wert fest (Feld markiert),
  leeren löst ihn wieder. Tab/⇧Tab wechselt das Feld, **Enter** setzt den Punkt mit den festen Werten (fehlende aus
  dem Zeiger), **Esc** im Feld verwirft die Form. Komma oder Punkt als Dezimaltrenner; einfache Rechnungen nicht.
  Diese Tasten sind lokale Bedienung eines Eingabefelds (wie Palette und Sidebar, 008 E10) und keine
  App-Funktionen. Ein Klick in die Zeichenfläche nimmt die festen Werte ebenso. Verlässt der Zeiger die
  Zeichenfläche, gilt seine letzte Position weiter (Enter setzt trotzdem). Hat der letzte Schritt keine Form (kein
  Tangentenkreis, Punkte auf einer Geraden), bleibt er offen. Die Felder springen auf die andere Seite des Zeigers,
  wenn sie rechts oder unten aus der Zeichenfläche ragen würden. Formen ohne Größe (Doppelklick, 0 getippt) werden
  nicht eingefügt; was keine Zahl bzw. bei Längen nicht > 0 ist, löst das Feld und markiert es als ungültig.
- **E7 Vorschau** im Overlay (Viewport-Pixel, nie im Dokument-DOM): die Form in Akzentfarbe, Hilfslinien
  gestrichelt (Basiskante, Radius, Bogen-Sehne), gesetzte Punkte als Kreuze, unter dem Zeiger liegender Bezug
  (Tangente/Endpunkt) hervorgehoben, gewählte Bezüge markiert.

### Geometrie (rein, `shared/geometry/sketch/`)

- **E8 Formen**: `line {a, b}`, `rect {c, w, h, angle}` (Mitte, Größe, Drehung in Rad im Dokumentraum), `circle
  {c, r}`, `arc {c, r, start, sweep}` (Winkel im Dokumentraum, y nach unten; `sweep` mit Vorzeichen, |sweep| <
  2π). 3-Point Circle/Arc über den Umkreis (kollinear → keine Form). Tangent Arc: Mittelpunkt = S + n·r mit r =
  |E−S|² / (2 n·(E−S)), n = Normale der Tangente.
- **E9 Tangentenkreise algebraisch** (`apollonius.ts`): Unbekannte (x, y, r). Gerade Kante (Einheitsnormale n,
  Punkt p, Seite s = ±1): n·(c−p) = s·r (linear). Kreis (c_j, r_j, σ = ±1 außen/innen): |c−c_j|² = (r_j + σ r)²;
  Punkt = Kreis mit r_j = 0; fester Radius R ersetzt r. Die quadratischen Gleichungen haben alle die Form
  `x² + y² − r² + lineare Terme = 0`; Differenzen sind linear → bleibt eine Gerade im Lösungsraum, eingesetzt in eine
  quadratische Gleichung → höchstens zwei Lösungen je Vorzeichenkombination (bis 8 Kombinationen). Lösungen mit
  r ≤ 0 oder Rest > 1e-6 fallen weg, doppelte werden zusammengefasst.
  Auswahl: **2-Tangent** ohne Durchmesser = Kreis durch den Zeiger, Kanten nur mit der Seite des Zeigers, kleinster
  Radius; mit Durchmesser = Mittelpunkt nächst am Zeiger. **3-Tangent**: die Lösung, die den Zeiger enthält
  (kleinste), sonst die mit dem Rand nächst am Zeiger – der vierte Klick bestätigt (Abweichung von Fusion, das
  beim dritten Bezug fertig ist: so lässt sich zwischen bis zu acht Lösungen wählen).
- **E10 Bezüge aus dem DOM** (`features/sketch/sketch-targets.ts`): je gemalter Blatt-Node (`paintedRoots`,
  sichtbar) die Geometrie (`readGeometry`) über `nodeToDocument` in den Dokumentraum: Linien, Polylinien/Polygon-
  Kanten, Rechteck-Kanten, Pfad-`L/H/V/Z` = Kanten (als unendliche Geraden); Kreise, Ellipsen mit rx = ry,
  Pfad-`A` mit rx = ry = Kreise – Kreise nur bei ähnlicher Abbildung (gleiche Skalierung in x und y). Gewählt wird
  der nächste Bezug höchstens 8 Bildschirm-px vom Zeiger; derselbe Bezug nicht zweimal. **Endpunkte** für den
  Tangent Arc: Enden offener Linien/Polylinien/Pfad-Teilpfade (nicht geschlossen) mit der Richtung, in der die
  Form dort endet (L: Segmentrichtung, C: p − c2, Q: p − c1, A: Tangente des Bogens), höchstens 8 px entfernt.

### Einfügen

- **E11 SVG-Elemente** im Benutzerraum des Elternelements (008 E2/E3): Line → `<line>`, Rect → `<rect>` (gedreht:
  `transform="rotate(a cx cy)"`, x/y/width/height der ungedrehten Form), Circle → `<circle>`, Arc → `<path d="M … A
  r r 0 large sweep …">`. Ist die Abbildung Dokument → Elternelement eine Ähnlichkeit ohne Spiegelung, werden die
  Zahlen umgerechnet (Längen / Skalierung, Winkel − Drehung); sonst (Scherung, ungleiche Skalierung, Spiegelung)
  bleibt die Geometrie im Dokumentraum und das Element bekommt `transform="matrix(…)"` der Umkehrabbildung – exakt
  in jedem Fall. Zahlen über `fmt` (≤ 4 Nachkommastellen). Undo-Labels `addLine`, `addRect`, `addCircle`, neu
  `addArc` („Add Arc“ / „Bogen hinzufügen“).

### Stil-Gedächtnis

- **E12 Typen**: `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `path`, `arc` (ein `<path>`, dessen `d`
  genau ein `M` und ein `A` hat). Text, Bild, Gruppen und Freehand (eigene Vorgaben, 013) sind ausgenommen.
  Gemerkt werden `fill`, `fill-opacity`, `stroke`, `stroke-width`, `stroke-opacity`, `stroke-linecap`,
  `stroke-linejoin`, `stroke-dasharray`, `opacity` – als Text, wie sie an der Form stehen (eigener `style` vor
  Attribut, „“ = nicht gesetzt).
- **E13 Default und Merken**: Default für alle Typen `fill="none" stroke="#000000" stroke-width="1"` (Marc: „dünne
  Linie, Stroke 1 oder 2“; 27.10.2026: „lieber 1“); gilt auch für die Sofort-Aktionen von 008. Gemerkt wird (a) nach jeder Änderung im
  Properties-Panel für jede betroffene Form ihres Typs und (b) beim Einfügen (eine Form mit Stil der KI zählt
  ebenso). Dauerhaft in `settings.json` unter `drawing.styles.<typ>` (Rust `DrawingSettings` + TS-Spiegel,
  gemeinsame Fälle in `testdata/settings-cases.json`): jeder Wert ein Text ≤ 128 Zeichen ohne `<>"'`;{}\` und
  Steuerzeichen und ohne `url(` (Verweise in fremde Assets) – sonst der Default des Felds. Argumente einer Aktion
  (`fill`, `stroke` …) gehen vor.

### KI

- **E14 Argumente** (`core/actions/sketch-action-args.ts`): `points: [[x, y], …]` = die Klicks im
  **Dokumentraum** in Reihenfolge der Schritte (Bezüge: ein Punkt auf dem Bezug), `values: { length, angle, width,
  height, diameter, radius, start, sweep }` = feste Maße, dazu Farbe/Breite (`fill`, `stroke`, `strokeWidth` …)
  und `parent`/`index` wie 008. Die Aktion spielt die Schritte mit derselben reinen Logik ab; zu wenige Punkte,
  kein Bezug am Punkt oder keine Lösung → Hinweis, nichts eingefügt. Abweichung von 008 E3 (Benutzerraum): die
  Werkzeuge arbeiten wie die Maus im Dokumentraum.

## Verträge

```ts
// shared/geometry/sketch/sketch-shapes.ts (rein)
type SketchShape = { kind: 'line'; a: Point; b: Point } | { kind: 'rect'; c: Point; w: number; h: number; angle: number }
  | { kind: 'circle'; c: Point; r: number } | { kind: 'arc'; c: Point; r: number; start: number; sweep: number };
rectCorners(r), arcEnds(a), circumcircle(a, b, c), degFromVector(v), vectorFromDeg(deg)
// shared/geometry/sketch/apollonius.ts (rein)
type Tangent = { kind: 'line'; p: Point; d: Point } | { kind: 'circle'; c: Point; r: number };
tangentCircles(targets: Tangent[], extra: { point?: Point; radius?: number }): Circle[]
pickTangentCircle(solutions, pointer, mode: 'through' | 'nearest' | 'contains'): Circle | null
// shared/geometry/sketch/sketch-tools.ts (rein)
type SketchToolId = 'line' | 'midpointLine' | 'rect2p' | 'rect3p' | 'rectCenter' | 'circleCenter' | 'circle2p'
  | 'circle3p' | 'circle2t' | 'circle3t' | 'arc3p' | 'arcCenter' | 'arcTangent';
type FieldKey = 'length' | 'angle' | 'width' | 'height' | 'diameter' | 'radius' | 'start' | 'sweep';
SKETCH_TOOLS: Record<SketchToolId, { steps: { pick: 'point' | 'tangent' | 'anchor'; fields: FieldKey[] }[] }>
resolvePoint(tool, placed, pointer, locks, ctx): Point     // E5: feste Maße angewandt
measure(tool, placed, point, ctx): Partial<Record<FieldKey, number>>
shapeOf(tool, placed, point | null, ctx): SketchShape | null  // Vorschau / Ergebnis
// features/sketch: SketchStore (Root), SketchService (insert, fromArgs), sketch-targets, sketch-elements
//   (shapeSpec(shape, toLocal: Matrix | null, paint)), SketchOverlay, sketch-actions, StyleMemory
```

Rust `ai-core::settings`: `DrawingSettings { styles: DrawingStyles { rect, circle, ellipse, line, polyline, polygon,
path, arc: DrawStyle } }`, `DrawStyle { fill, fill_opacity, stroke, stroke_width, stroke_opacity, stroke_linecap,
stroke_linejoin, stroke_dasharray, opacity: String }` (camelCase), `sanitize` prüft jeden Wert (E13). Keine neuen
Commands, keine neue Abhängigkeit.

## Tests

- Rust: Defaults = gemeinsame Tabelle, Fälle `drawing.styles` (ungültige Zeichen, `url(`, zu lang, falsche Art →
  Default des Felds; gültige bleiben), Patch ändert nur einen Typ.
- Vitest: Formen (Ecken, Bogen-Enden, Umkreis, kollinear), Apollonius (3 Geraden = In-/Ankreise, Gerade+Kreis,
  drei Kreise, Kreis durch Punkt, fester Radius, Parallelen, Rest < 1e-6 je Lösung), jedes Werkzeug: Punkte und
  feste Maße → Form (Tabelle), Maße aus dem Zeiger, Abwicklung des Bogenwinkels, `shapeSpec` (Ähnlichkeit vs.
  Matrix, Rotation, Arc-Flags), Stil-Typ eines Elements, Stil lesen/anwenden, Settings-Regeln (gemeinsame Fälle),
  SketchStore (Schritte, Esc, Tab-Reihenfolge, Enter), Aktionen mit Argumenten (KI) inkl. JSON-Roundtrip.
- Playwright (`e2e/sketch.spec.ts`): 2-Point Rectangle per Maus, ⌘Z; 3-Point Rectangle mit getippten Maßen
  (200, 30°, 100) bei Zoom 50/100/150 % → Ecken im Dokumentraum ± 0,01; Center Diameter Circle in einer rotierten
  Gruppe; 3-Tangent Circle in einem Dreieck = Inkreis; 2-Tangent an Linie und Kreis berührt beide; Tangent Arc am
  Ende einer Linie (Tangente stetig); Stil: Stroke einer Form ändern → nächste Form desselben Typs übernimmt ihn,
  ein anderer Typ nicht.

## Fragen an Marc (beantwortet 27.10.2026: Kürzel überall, vierter Klick ok, Breite 1)

1. Kürzel `l`, `r`, `c` global (wie Fusion) – ok, oder nur bei Fokus auf der Zeichenfläche? Die Sofort-Aktionen
   heißen jetzt „Circle at Center“, „Rectangle at Center“, „Line at Center“ – passt das?
2. 3-Tangent Circle braucht einen vierten Klick zur Wahl der Lösung (bis zu acht Kreise). Ok?
3. Stil-Default Breite 2 – oder 1?

## Fortschritt

- [x] Design
- [x] Rust `ai-core::settings`: `DrawingSettings`/`DrawStyle`, `style_value_ok`, Fälle in `testdata/settings-cases.json`
- [x] Geometrie rein (`shared/geometry/sketch/`): Formen, Werkzeug-Schritte und Maße, Apollonius (8 Lösungen bei
      drei Kreisen), SVG-Bogen-Mittelpunkt
- [x] Stil-Gedächtnis (`StyleMemory`, `draw-style`), Defaults der Sofort-Aktionen auf dünne Linie, Merken im
      Properties-Panel und beim Einfügen
- [x] `SketchStore`, `SketchService` (Einfügen, KI-Replay), `sketch-targets`, `sketch-elements`, Overlay mit
      Maßfeldern, Canvas-Anbindung (Zeiger, Esc, Statuszeile, Fokus), Aktionen, Menü mit Untermenüs, Sidebar-Abschnitt
      „Sketch“ mit Icons, Kürzel `l`/`r`/`c`, Texte EN/DE
- [x] Playwright `e2e/sketch.spec.ts` (9 Fälle): Maus, Undo, Esc; 3-Point Rectangle getippt bei 50/100/150 %; Kreis in
      gedrehter, skalierter Gruppe; Inkreis per 3-Tangent; 2-Tangent an Linie + Kreis; Tangent Arc; Stil-Gedächtnis
