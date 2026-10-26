# Design 007: Auswahl, Handles, Snapping

Status: umgesetzt · Datum: 27.10.2026

## Ausgangslage

004 liefert lebende Assets je Layer (Shadow Root mit eigenem Host-SVG, Layer-`position` angewandt) und die
Geometrie-Basis `clientToDocument`/`nodeToDocument`/`nodeBoundsInDocument` (Screen-CTMs von Host und Element, weil
`getCTM()` am Asset-`<svg>` endet). 005 bringt Aktionen/Keymaps (Snap-Toggles als Zustand, Esc = Deselect,
Delete, Select All), 006 die Auswahl `DocumentStore.selection` mit Baum-Abgleich und einen achsparallelen
Auswahlrahmen. Gesten `begin/update/commit/cancel` (003 E6) sind fertig, aber im UI unbenutzt. 007 macht den Canvas
bedienbar: Treffer, Auswahl, Handles, Ziehen, Pfeiltasten, Snapping, BoundsGuard.

## Entscheidungen

- **E1 Geometrie nur über Browser-Matrizen.** Jede Position eines Handles ist ein Punkt im **Benutzerraum des
  Elements** (die Attributwerte: `x`/`y`, `cx`, Pfadpunkte …), abgebildet mit `nodeToDocument(host, el)` (inkl. des
  eigenen `transform`, aller Gruppen, Platzierungs-SVG und Layer-`position`). Änderungen gehen umgekehrt: Dokumentpunkt
  → `nodeToDocument(…)⁻¹` (zu Beginn der Geste gemessen) → lokaler Punkt → neue Attributwerte. Verschiebungen ganzer
  Nodes: `l = A⁻¹·d` mit `A` = linearer Teil der Eltern-Matrix (wie 006 E13). Keine eigene Transform-Kette.
- **E2 Treffer (`hit-test.ts`, DOM):** die Layer-Hosts haben `pointer-events: none` (004) – getroffen wird darum
  nicht über Ereignisziele, sondern je gerendertem Layer von oben nach unten und je Element in umgekehrter
  Dokumentreihenfolge mit `isPointInFill` / `isPointInStroke` (lokaler Punkt über `getScreenCTM()⁻¹`) bzw. der BBox
  (Text, `image`, `use`). **Toleranz 4 Bildschirm-px** für Konturen: zusätzlich je acht Punkte auf Ringen mit
  1 … 4 px (in Bildschirmpixeln versetzt, dann lokal) – dünne Linien sind treffbar, unabhängig vom Zoom.
  Nie treffbar: Inhalte von `defs`, `clipPath`, `mask`, `pattern`, `marker`, `symbol`, Verläufen, `display:none`,
  `visibility:hidden`, ausgeblendete Layer/Gruppen (nicht gerendert). Kopien eines Assets (004 E5) werden über
  `data-ai-id` auf die lebende Node abgebildet.
- **E3 Gruppen-Kontext** (`CanvasEditStore.context`): ein Klick wählt das **Kind des Kontexts**, das das getroffene
  Element enthält (Standard-Kontext = Asset-Wurzel: also das oberste Element im Layer, wie Figma/Illustrator).
  Doppelklick auf einen Container (`g`, `a`, `switch`, inneres `svg`) macht ihn zum Kontext und wählt darin das Kind
  unter dem Zeiger; Esc verlässt den Kontext (wählt den Container). Ein Treffer außerhalb des Kontexts setzt ihn
  zurück. Wählt der Baum etwas außerhalb des Kontexts, gilt er ebenfalls nicht mehr.
- **E4 Selection Modes** `none` | `point` | `boxed` (Default `point`, `CanvasOptions.selectionMode`, Aktionen
  `canvas.selectionMode.*` als Radio im View-Menü und im View-Options-Menü). Bedeutung wie in der Vorlage
  (`CanvasSelectionOverlay`): **point** = Punkt-Handles der Node (E6), **boxed** = Bounding-Box mit acht
  Skalier-Handles (E7) für jede Auswahl, **none** = keine Handles und keine Auswahl per Klick im Canvas (nur
  ansehen, Pan/Zoom; der Baum wählt weiter, Rahmen bleiben sichtbar). In `point` und `boxed`: **Rahmenauswahl**
  durch Ziehen auf leerer Fläche – gewählt werden die Kinder des Kontexts (bzw. die Elemente der Layer-Wurzeln), deren
  Bounds im Dokumentraum das Rechteck **schneiden**; ⇧ = hinzufügen, ⌘/Ctrl = umschalten (beides auch beim Klick).
  Klick ins Leere ohne Modifier hebt die Auswahl auf (und den Kontext).
- **E5 Overlay in Bildschirmpixeln** (`selection-overlay.ts`): ein eigenes `<svg>` über dem Viewport (nie im
  Dokument-DOM), Koordinaten = Viewport-Pixel aus `viewportRect⁻¹ · host.getScreenCTM() · nodeToDocument`, d. h.
  dieselben Browser-Matrizen. Handles damit **in Bildschirmgröße** unabhängig vom Zoom. Inhalt: Auswahlrahmen je Node
  als **Polygon der lokalen BBox-Ecken** (gedreht/geschert wie die Node), Handles, Linien Kontrollpunkt → Anker,
  Rahmen der Rahmenauswahl, Snap-Hinweis (Ring + Kreuz am Snap-Punkt, Farbe je Art). Größen/Farben der Vorlage:
  position blau 8, size grün 6, control orange 5, anchor lila 6, midpoint gelb 7, pivot rot 9 (Farben
  `--ai-handle-*`, Größen in `handle-types.ts`, weil sie auch Geometrie sind). Handles sind die einzigen Elemente des
  Overlays mit `pointer-events` – ihr Ereignisziel sagt, welches gezogen wird. Aus mit „Show Handles“ (Rahmen
  bleiben).
- **E6 Punkt-Handles je Node** (rein: `node-geometry.ts` liest nur, `node-handles.ts` erzeugt, `handle-edit.ts`
  rechnet die neuen Attribute aus einem **Schnappschuss** zu Gestenbeginn – damit sind alle Fälle in Vitest
  testbar): Circle Mitte (position) + Radius (size, bei `cx + r`); Ellipse Mitte + `rx` + `ry`; Rect oben links
  (position = verschieben) + drei Ecken (size, Gegenecke fest) + Eckenradius (control bei `x + rx`, nur wenn
  `rx`/`ry` > 0; ohne `ry` folgt `ry` von selbst); Line Start/Ende (position); Text Position (erster `x`/`y`-Wert;
  weitere Werte ziehen mit) + Anker-Handle je `text-anchor` (±20 wie die Vorlage; Klick schaltet
  start → middle → end um) + Box-Handles; Polyline/Polygon Punkte (anchor) + Segment-Mitten (midpoint: Klick oder
  Ziehen fügt einen Punkt ein); Path Anker (anchor) + Kontrollpunkte (control) für C/S/Q, Mitten jedes Segments
  (Einfügen). Punkt löschen: **Alt-Klick** auf einen Anker oder Entf/⌫ (Aktion `canvas.deletePoint`, Kontext
  `canvas`, aktiv nur mit gewähltem Punkt – sonst fällt die Taste zu `edit.delete` durch). Werte werden mit
  höchstens 4 Nachkommastellen geschrieben (`fmt`). Längen lesen über `baseVal` (Einheiten aufgelöst), geschrieben
  wird die Zahl in Benutzereinheiten. Gruppen, `use`, `image` und Mehrfachauswahl bekommen Box-Handles (E7).
- **E7 Box-Handles** (`box-math.ts` aus `BoxSelectionMathTests`/`computeScaleFactors` der Vorlage, rein): acht
  Handles (size) um die Box, die Gegenseite bleibt fest, Ecken skalieren **gleichmäßig** (dominanter Faktor), Kanten
  nur auf ihrer Achse, kein Spiegeln (Mindestfaktor 0,05). Einzelne Node: Box = lokale BBox im eigenen
  Koordinatensystem (gedreht wie die Node), Skalierung `T(a)·S·T(−a)` **hinten** an `transform` angehängt
  (`matrix(sx 0 0 sy tx ty)`; skaliert entlang der eigenen Achsen). Mehrfachauswahl: Box = Vereinigung im
  Dokumentraum, je Node `P⁻¹·S·P` (P = Eltern → Dokument) **vorn** an `transform`. Pivot-Handle (rot) am Mittelpunkt
  eines `rotate(a cx cy)` im `transform` (Lage über die Matrizen der Einträge davor, `transform.baseVal`); Ziehen
  ändert `cx cy` dieses Eintrags (Bearbeitung der Transform-Liste selbst: 009).
- **E8 Pfade** (`path-data.ts` + `path-edit.ts`, rein): Der Browser bietet keine Pfaddaten-API
  (`getPathData` fehlt in Chromium und WebKit), darum ein kleiner **Tokenizer** für `d` (Zahlen, Befehle, kompakte
  Arc-Flags) – kein Renderer, keine Geometrie-Auswertung. Jedes Segment kennt seinen Quelltext, ob es relativ und ob
  es implizit (ohne Buchstaben) war, und seine absoluten Punkte. **Unveränderte Segmente bleiben Zeichen für Zeichen
  stehen**; nur Segmente, deren Punkte sich ändern, deren Startpunkt sich bei relativer Schreibweise verschiebt
  oder deren implizite Glättung (S/T) nicht mehr passt, werden neu geschrieben – in ihrer Schreibweise (relativ
  bleibt relativ). Umwandlungen nur beim Bearbeiten: H/V → L, wenn sich die andere Koordinate ändert; S/T → C/Q, wenn
  die Spiegelung nicht mehr stimmt; A behält seine Parameter (nur der Endpunkt ist ein Handle). Anker ziehen nimmt
  die anliegenden Kontrollpunkte mit (wie Illustrator); Einfügen teilt das Segment bei t = 0,5 (de Casteljau für
  C/Q, L halbiert); Löschen verbindet die Nachbarn (zwei Kurven → eine C mit den äußeren Kontrollpunkten), `Z` bleibt.
- **E9 Ziehen = Geste** (`canvas-gesture.ts`): Pointer-Capture, ab 3 px Bewegung `store.begin(label)`, je Frame
  (rAF-gedrosselt) **ein** `update` mit dem Ergebnis aus Schnappschuss + aktueller Position, `commit` beim Loslassen,
  `cancel` bei Esc (stellt den Ausgangszustand her) oder `pointercancel`. Klick ohne Bewegung = Klick-Aktion
  (einfügen, löschen, Anker umschalten, Punkt wählen). Labels: `moveNode` (verschieben), `adjustPath` (Punkte,
  Kontrollpunkte, Größe), `changeTransform` (Box, Pivot), `insertPoint`, `deletePoint`.
- **E10 Ein serialisierbarer Command je Geste** (KI-Regel): neuer Command **`setAttributes { changes: [{ ref, name,
value }], label? }`** – mehrere Attribute an mehreren Nodes als ein Schritt. `merge()` übernimmt einen Folgebefehl
  mit derselben Liste von Zielen (ref + name) und ersetzt die Werte, also steht nach `commit` genau **ein**
  `setAttributes` mit den Endwerten im Undo-Stapel (`lastCommandJson()`); Undo stellt alle Attribute (auch
  Reihenfolge, fehlende werden wieder entfernt) her. Registriert, JSON-Roundtrip-Fall, feindliche Eingaben geprüft.
- **E11 Verschieben über `transform`** (`transform-text.ts`, rein): eine Verschiebung `l` (lokal, E1) wird **vorn**
  an `transform` gesetzt; steht dort schon ein `translate(…)` oder `matrix(…)`, wird damit verrechnet statt eine neue
  Funktion anzuhängen (`translate(10 0) rotate(30)` → `translate(11 0) rotate(30)`), damit wiederholtes Nudgen keine
  Kette erzeugt. Der Rest der Liste bleibt Text-gleich. Gilt für alle Node-Arten (auch Pfade – wie
  `testOptionTranslationUpdatesPathTransformOnly` der Vorlage); Geometrie-Attribute ändern nur die Punkt-Handles.
- **E12 Pfeiltasten** `arrange.nudge.left|right|up|down` (1) und `…Big` (⇧, 10) im Kontext `canvas` (im Baum bleiben
  die Pfeile Navigation), Einheit **Dokumentraum**, lokal umgerechnet (E1/E11), BoundsGuard. Eine Undo-Aktion je
  Folge: `DocumentStore.executeCoalescing(cmd, key)` legt einen Befehl in den obersten, wenn dieser der letzte
  derselben Folge (`key` = Auswahl) ist und weniger als **500 ms** vergangen sind (kein offenes Gesten-Fenster, das
  fremde Befehle verschlucken könnte). Dazu `arrange.moveBy { dx, dy }` (KI, Tests).
- **E13 Snapping** (`shared/geometry/snapping.ts`, rein, aus `SnappingService` der Vorlage): Grid (Abstand 10,
  Ursprung `worldZero` = (0, 0) | `svgCenter` = (512, 512), Option `gridOrigin`, Radio-Aktionen
  `view.gridOrigin.*`), Magic Snap auf markante Punkte, Aktivierung **20 px in Bildschirmpixeln** (Abstand im
  Dokument × Zoom, euklidisch, `≤`), bei Gleichstand **Magic vor Grid**; Defaults Grid aus, Magic an (005).
  Markante Punkte (`magic-points.ts`, DOM, einmal je Geste gesammelt, höchstens 20 000): BBox-Ecken, Kantenmitten
  und Mitte jedes gerenderten Blatt-Elements aller sichtbaren Layer/Assets (über `nodeToDocument`), dazu die
  Punkt-Handles (Pfad-Anker, Polygon-Punkte, Linien-Enden, Kreis-Mitten) und Ecken/Mitte der Leinwand – **ohne** die
  gezogenen Nodes und ihre Nachfahren. Beim Handle-Ziehen schnappt der Handle-Punkt, beim Verschieben der beste der
  neun Box-Punkte der bewegten Auswahl. Alt (⌥) beim Ziehen unterdrückt Snapping.
- **E14 BoundsGuard** (`shared/geometry/bounds-guard.ts`, rein, Fälle aus `BoundsGuardTests`): Handle-Punkte und
  Pfadpunkte werden auf die Leinwand (0…1024) geklemmt, Verschiebungen so begrenzt, dass die Box drin bleibt. Liegt
  eine Box schon teilweise draußen (oder ist größer als die Leinwand), gilt je Achse die Vereinigung aus Leinwand und
  Box – nichts springt beim ersten Nudge hinein.
- **E15 Zustand** `CanvasEditStore` (Root-Service wie `CanvasViewStore`, ein Canvas je Fenster): `context`,
  `activePoint`, `marquee`, `snap`, `dragging`. Aktionen in `canvas-edit-actions.ts`, registriert von `CanvasView`:
  `canvas.escape` (Esc im Kontext `canvas`: Geste abbrechen → Rahmenauswahl abbrechen → Punkt abwählen → Kontext
  verlassen; sonst fällt Esc zu `edit.deselect` durch), `canvas.deletePoint`, `arrange.nudge.*`, `arrange.moveBy`,
  `canvas.selectionMode.*`, `view.gridOrigin.*`.
- **E16 Abgrenzung zu 006:** der achsparallele Auswahlrahmen im Host-SVG entfällt zugunsten der gedrehten Polygone.
  Select All / Deselect / Delete bleiben die Aktionen aus 006.

## Verträge

```ts
// shared/geometry/snapping.ts
type SnapKind = 'none' | 'grid' | 'magic';
interface SnapOptions { zoom; grid: boolean; magic: boolean; step = 10; origin: Point; tolerancePx = 20 }
snapPoint(p, candidates: readonly Point[], o): { point; kind; target: Point | null; distancePx }
gridSnap(p, origin, step): Point
snapMove(keyPoints, delta, candidates, o): { delta; kind; target }
// shared/geometry/bounds-guard.ts
CANVAS_BOUNDS: Rect; clampPoint(b, p); clampPath(b, ps); clampTranslation(b, rect, delta)
// shared/geometry/box-math.ts
type BoxHandle = 'topLeft'|'top'|'topRight'|'right'|'bottomRight'|'bottom'|'bottomLeft'|'left';
boxHandlePoint(rect, h); oppositeAnchor(rect, h); computeScaleFactors(h, initial, anchor, proposed, allowFlip, minScale)
scaleAbout(anchor, sx, sy): Matrix
// shared/geometry/box-selection.ts
marqueeRect(a, b); intersects(a, b); combineSelection(current, hits, mode: 'replace'|'add'|'toggle', same)
// shared/geometry/matrix.ts – Matrix {a,b,c,d,e,f}: multiply, invert, apply, linear, fromDom
// shared/geometry/transform-text.ts
prependAffine(transform: string | null, m: Matrix): string; appendAffine(transform, m): string; fmt
// shared/geometry/path-data.ts / path-edit.ts
parsePath(d): PathSeg[] | null; serializePath(segs, original): string
pathAnchors(segs), pathControls(segs), pathMidpoints(segs)
moveAnchor(segs, i, p), moveControl(segs, seg, which, p), insertPoint(segs, seg), removeAnchor(segs, i)
// features/canvas/handles/
handle-types.ts: HandleKind, HANDLE_SIZE, Handle { id, kind, local: Point, … }
node-geometry.ts: NodeGeometry (rect|circle|ellipse|line|poly|path|text|box); readGeometry(el)
node-handles.ts: handlesOf(g): Handle[]
handle-edit.ts: dragHandle(g, handle, local): Record<string,string> | null; clickHandle(g, handle, alt)
// features/canvas
hit-test.ts: hitTest(box, client, tolPx): { asset, id } | null; selectableRef(doc, leaf, context)
magic-points.ts: magicPoints(box, host, doc, exclude): Point[]
canvas-edit.store.ts: CanvasEditStore; canvas-gesture.ts: GestureController
move-ops.ts: moveCommand(doc, host, refs, d): SetAttributes | null
canvas-pointer.ts (Klick/Rahmen/Doppelklick), selection-overlay.ts (Komponente), canvas-edit-actions.ts
// features/document
commands: SetAttributes { changes: { ref, name, value }[]; label }  (Typ 'setAttributes')
DocumentStore.executeCoalescing(command, key, windowMs = 500, now = Date.now)
```

Kein Rust-Command, keine neue Abhängigkeit.

## Tests

- Vitest (rein): `snapping` (Fälle aus `SnappingServiceAdditionalTests`: außerhalb der Toleranz nichts, Gleichstand
  → Magic; Grid-Runden aus `testGridSnapperRoundsTowardNearestCell` mit beiden Ursprüngen; 19/21 px bei
  50/100/150 %), `bounds-guard` (alle vier Fälle aus `BoundsGuardTests` + teilweise draußen), `box-math` (die
  vier Fälle aus `BoxSelectionMathTests`), `box-selection`, `matrix`, `transform-text` (Verrechnen mit
  translate/matrix, Rest unverändert, Fall `testOptionTranslationUpdatesPathTransformOnly`), `path-data`
  (Zerlegen/Zusammensetzen: unverändert byte-gleich, relativ bleibt relativ, implizite Wiederholungen, kompakte
  Arc-Flags, H/V/S/T-Umwandlung, Fälle aus `PathEditingTests`), `node-handles`/`handle-edit` (jede Node-Art,
  Fälle aus `HandleOverlayGeometryTests` über die lokale Umrechnung), `SetAttributes` (do/undo/merge, Registry),
  `executeCoalescing` (500 ms, anderer Schlüssel, fremder Befehl dazwischen), Geste begin/update/commit/cancel über
  den `GestureController` mit Fake-Zeitgeber.
- Playwright (`e2e/selection.spec.ts`, Pflicht, echtes Layout) mit `nested_g.svg` und `nested_g_small.svg` bei
  Zoom 50/100/150 % und nach Pan: Handle-Position = Bildschirmposition des Punkts per `getScreenCTM` (± 0,5 px) für
  Rects in verschachtelten translate/scale/rotate/skew/matrix-Gruppen; Ziehen um (dx, dy) Bildschirm verschiebt
  den Punkt im Dokumentraum um (dx, dy)/zoom; Magic Snap greift bei 19 px, nicht bei 21 px; Esc während des Ziehens
  stellt her; Undo nach einer Geste ist **ein** Schritt (`setAttributes`); Klick-Treffer, Doppelklick in die Gruppe,
  Rahmenauswahl, Pfeiltasten (eine Undo-Aktion), Punkt einfügen/löschen, Box-Skalierung einer gedrehten Node.

## Fragen an Marc

1. **Klick wählt das oberste Element im Layer** (bzw. im Gruppen-Kontext), Doppelklick geht hinein (E3) – wie
   Figma. Die Vorlage wählte vermutlich das Blatt. Passt das?
2. **Verschieben schreibt `transform`** (vorn, mit vorhandenem `translate` verrechnet) statt `x`/`cx`/`points`/`d`
   zu ändern (E11). Lieber Geometrie-Attribute, wo möglich?
3. **Box-Skalierung** hängt `matrix(sx 0 0 sy tx ty)` an `transform` an (E7), statt Breite/Radius zu ändern. Ok bis
   009 (Transform-Liste)?
4. **Pivot ziehen** ändert `cx cy` des `rotate(…)` – die Form dreht sich dann um den neuen Punkt (springt). Lieber
   den sichtbaren Stand halten (Ausgleich über `translate`)?
5. **Selection Mode `none`** sperrt nur die Auswahl im Canvas (der Baum wählt weiter). Richtig verstanden?
6. Auf dem Mac prüfen: Trackpad-Ziehen mit Pointer-Capture in WKWebView, Alt-Klick (⌥) löscht Punkt, ⌥ beim
   Ziehen schaltet Snapping ab.

## Fortschritt

- [x] Design
- [x] Rust: nichts nötig (kein Command, keine Crate) – `cargo` im `pnpm check` unverändert grün
- [x] Reine Geometrie + Tests: `matrix`, `snapping`, `bounds-guard`, `box-math`, `box-selection`,
      `transform-text`, `path-data`, `path-edit` (Fälle aus `SnappingServiceAdditionalTests`, `BoundsGuardTests`,
      `BoxSelectionMathTests`, `PathEditingTests`, `HandleOverlayGeometryTests` der Vorlage als Tabellen)
- [x] Command `setAttributes` (registriert, JSON-Roundtrip, feindliche Eingaben), `UndoService.executeInto`,
      `DocumentStore.executeCoalescing`
- [x] Handles (`handles/`: Geometrie lesen, Handles erzeugen, Bearbeiten rein), Treffer, Messung über CTM,
      Overlay, `GestureController` (Vitest mit Fake-Frames), `CanvasInteraction`, Aktionen (Esc, Punkt löschen,
      Pfeiltasten, `moveBy`, Selection Mode, Grid Origin) in Menü, View Options und Keymap
- [x] Playwright: `e2e/selection.spec.ts` (6: Handles = Screen-CTM ± 0,5 px bei 50/100/150 % mit Pan für
      `nested_g_small.svg` und eingefügte Rects in der 19. Ebene von `nested_g.svg` – translate/scale/matrix/rotate
      plus eine Gruppe mit `skewX` + `matrix` und ein Rect mit `rotate(20 10 10)` samt Pivot und gedrehtem Rahmen;
      Ziehen = (dx, dy)/zoom, Gegenecke bleibt, ein Undo-Schritt, Verschieben der Form), `e2e/selection-edit.spec.ts`
      (9: Klick/⇧/Ctrl, dünne Linie mit Toleranz, Doppelklick in die Gruppe, Esc heraus, Klick ins Leere,
      Rahmenauswahl, Magic Snap 19/21 px bei 50/100/150 %, Esc während des Ziehens, eine Geste = ein
      `setAttributes`, Pfeiltasten als ein Undo-Schritt, `moveBy` mit BoundsGuard, Punkt einfügen/⌥-Klick/Entf,
      Box-Skalierung eines gedrehten Rects im Modus `boxed`); alle 56 Tests grün
- [x] Echte App unter Xvfb (WebKitGTK): `nested_g_small.svg` über den nativen Dialog importiert, per
      Doppelklick drei Gruppen tief bis `r_1_3` (translate · scale(2,3) · translate) – Handles exakt auf den Ecken,
      Ecke gezogen (folgt dem Zeiger), Pfeiltasten verschieben, Baum folgt der Auswahl
- [x] Doku, `pnpm check` + `pnpm e2e` grün

## Abweichungen und Grenzen

- **Keymap-Test:** Esc und Entf/⌫ stehen jetzt auch im Kontext `canvas` (`canvas.escape`, `canvas.deletePoint`).
  Der Test „ein Kontext-Kürzel verdeckt kein globales“ hat dafür eine benannte Ausnahmeliste bekommen – beide
  Aktionen sind nur aktiv, wenn es etwas zu tun gibt, sonst fällt die Taste wie in 005 E4 vorgesehen durch.
- **Handles sind nicht per Tab erreichbar** (das Overlay ist `aria-hidden`); per Tastatur gibt es Pfeiltasten,
  Esc und Entf, die genaue Bearbeitung bringt das Properties-Panel (009). Die KI nutzt `setAttribute(s)`,
  `arrange.moveBy` und `edit.select`.
- **Magic-Snap-Test** mit einem eigenen SVG (Linie, Rect) statt `nested_g*.svg`: dort liegen zu viele markante
  Punkte (Texte, Rasterlinien) dicht beieinander, um 19/21 px eindeutig zu prüfen. Die Genauigkeit in
  verschachtelten Gruppen prüfen die Handle-/Zieh-Tests.
- **`nested_g*.svg` enthalten kein `skew`**: der Test fügt eine `skewX(25) matrix(…)`-Gruppe mit gedrehtem Rect in
  die 19. Ebene von `nested_g.svg` ein (über `insertNode`, wie es die KI täte).
- **BoundsGuard bei Handles:** Ein Punkt, der schon außerhalb der Leinwand liegt, darf dort bleiben (Grenze =
  Leinwand ∪ Startpunkt), sonst spränge er beim ersten Ziehen hinein.
- **Hinweis-Linie beim Snappen** zeigt nur den Zielpunkt (Ring + Kreuz), keine Hilfslinien über die Fläche.
- **Pfad-Bögen (A):** nur der Endpunkt ist ein Handle; Einfügen in einen Bogen geht nicht (keine Mitte ohne
  eigene Bogen-Geometrie).
- Text: Position und Anker-Marke ändern `x`/`y` (alle Werte einer Liste ziehen mit); `dx`/`dy`, `tspan`-Positionen
  bleiben unberührt.
