# Design 014: Clip Paths

Status: in Arbeit · Datum: 27.10.2026

## Ausgangslage

Die Vorlage hatte ein Datenmodell (`SVGClipPath`, `clipPathId` an Nodes, Vererbung Layer → Node mit Override und
Opt-out `"none"`), „Create Clip Path“ je Layer, einen Picker und 25 Modell-Tests (`SVGClipPathTests.swift`,
`ClipPathTests.swift`) – aber keinen Bearbeitungsmodus, kein sauberes Rendering und keinen Ausschluss aus dem
Hit-Testing (legacy §11, `CLIPPATH_GAP_ANALYSIS.md`, `CLIPPATH_IMPLEMENTATION_STATUS.md`). Die Neuauflage hat:
Dokument = SVG-DOM (003), Hierarchie mit „Definitions“-Knoten (006 E1: `clipPath` und sein Inhalt stehen dort,
`definition: true`), Hit-Testing/Magic Snap ohne nicht darstellende Inhalte (007, `isRendered`), Einfügen (008),
Properties-Panel (009, Abschnitt „Clip Path“ ausgelassen), Duplicate/Paste mit eindeutigen IDs (006 E10/E12), Export
mit ID-Präfixen je Layer (012 E1) und resvg.

## Entscheidungen

- **E1 Normales SVG.** Ein Clip Path ist ein `<clipPath id clipPathUnits?>` in der `<defs>` der Asset-Wurzel
  (fehlt sie, entsteht sie als erstes Kind der Wurzel); Formen sind seine Kinder. Zuweisung als Attribut
  `clip-path="url(#id)"`. Gelesen wird auch `style="clip-path:url(#…)"` (Style gewinnt wie 009 E1); beim Schreiben
  entfällt nur diese Deklaration (`styleWithout`, 010 E15). Andere Werte (`circle(50%)`, `inset(…)`, fremde
  `url(…)`) bleiben unangetastet und erscheinen als „Other“ (nur lesen).
- **E2 `clip-path="none"` ist gültiges SVG, aber kein Opt-out.** `none` ist der Initialwert (`<url> | none` in
  SVG 1.1, CSS Masking 1) und überall erlaubt. Clipping eines Vorfahren wirkt aber auf das gerenderte Ergebnis der
  ganzen Gruppe – ein Kind kann sich mit `none` **nicht** herausnehmen (Chromium, WebKit, resvg, Icon Composer
  verhalten sich gleich). Die Vorlage speicherte `"none"` nur im eigenen Modell. Entscheidung: `none` wird nie als
  Opt-out geschrieben (gelesen = „kein eigener Clip“, sonst unverändert gelassen); das Opt-out entsteht über die
  **Struktur** (E4).
- **E3 Layer-Clip = Clip-Gruppe auf Layer-Ebene.** Ein Clip Path am Layer ist ein `<g clip-path="url(#id)">` als
  Kind der Asset-Wurzel, das sonst nur `id`/`data-*` trägt („Clip-Gruppe“) – genau die Form, die Figma und Sketch
  exportieren (`<g clip-path="url(#clip0_1_2)">`). Erkannt wird sie an der Struktur, ohne eigenes Marker-Attribut;
  importierte Dateien zeigen ihren Layer-Clip also sofort. Der Layer-Clip ist der Clip der ersten Clip-Gruppe;
  weitere Clip-Gruppen mit demselben Clip gehören dazu (Teilstücke nach einem Opt-out). `clip-path` an der
  Asset-Wurzel `<svg>` scheidet aus: die äußerste `<svg>` ist in Browsern/Icon Composer eine CSS-Box
  (`userSpaceOnUse` bezieht sich dann auf deren Rahmen, nicht auf die `viewBox`), eine innere `<svg>` (unsere
  Platzierung) schneidet im Raum des Elternelements.
- **E4 Vererbung und Auflösung** (`model/clip-model.ts`, rein): `resolveClip(el)` → `own` (eigener Verweis),
  `inherit` (nächster schneidender Vorfahr, `layer: true` wenn es eine Clip-Gruppe ist) oder `none`;
  `effectiveClips(el)` = alle Clips von `el` bis zur Wurzel (sie schneiden sich). Picker einer Node:
  - **Inherit from Layer**: eigener Verweis weg; steht die Node direkt in der Wurzel und hat der Layer einen Clip,
    kommt sie in die benachbarte Clip-Gruppe (Ende der vorigen, Anfang der nächsten, sonst eine neue um sie).
  - **None**: eigener Verweis weg; ist die Node **direktes Kind einer Clip-Gruppe**, wird die Gruppe an ihr
    geteilt (`<g clip>vorher</g> Node <g clip>nachher</g>`, leere Teile fallen weg) – Reihenfolge und Bild der
    übrigen Nodes bleiben exakt. Tiefer in einer geclippten Gruppe ist None nicht möglich (deaktiviert mit Hinweis:
    Teilen einer Gruppe mit Opacity/Filter/IDs änderte das Bild).
  - **<id>**: eigener Verweis; direkte Kinder einer Clip-Gruppe werden dabei wie bei None herausgelöst, damit
    **nur** ihr eigener Clip gilt (Override wie die Vorlage). Tiefer gilt SVG: eigener ∩ geerbter Clip (Hinweis
    „also clipped by …“).
- **E5 Serialisierbare Commands** (Registry, KI-Regel):
  `insertDefinition { asset, markup }` (Element in die Wurzel-`<defs>`, legt sie an),
  `assignClip { ref, mode: 'own'|'none'|'inherit', clip? }` (E4 samt Struktur),
  `setLayerClip { asset, clip: string|null }` (alle darstellenden Wurzel-Kinder in **eine** Clip-Gruppe bzw. alle
  Clip-Gruppen des Layer-Clips auflösen; die Kinder behalten ihre Plätze),
  `removeClipPath { ref }` (alle Verweise entfernen, Clip-Gruppen auflösen, dann das Element).
  Strukturänderungen laufen intern als aufgezeichnete Grundschritte (`MoveNode`, `InsertNode`, `RemoveNode`,
  `SetAttributes`): beim ersten `do` geplant und ausgeführt, bei Redo **dieselben** Schritte wiederholt (gleiche
  Elemente, gleiche `data-ai-id`), Undo rückwärts. „Create“ = `composite` aus `insertDefinition` + `assignClip`
  bzw. `setLayerClip` mit vorab eindeutig gewählter ID (`clip`, `clip-2` …). Einheitenwechsel = `setAttributes`
  (`clipPathUnits` + ausgleichendes `transform`, E8) – kein eigener Command.
- **E6 Startform** von „Create Clip Path“: Layer = Rechteck der Asset-Leinwand (`viewBox` der Wurzel, sonst
  `width`/`height`, sonst 0 0 1024 1024 – das, was der Layer zeigt); Node = ihre lokale BBox (`getBBox()`, genau
  der `userSpaceOnUse`-Raum der Node); ohne Layout (Tests) die Leinwand. Optional `shape: 'rect'|'circle'|'ellipse'`
  (eingeschrieben) oder eigenes `markup` (bereinigt wie jedes Einfügen).
- **E7 Bearbeitungsmodus** (`ClipEditStore`, Root wie `FreehandStore`): `clip.edit` betritt ihn für den Clip der
  Auswahl (eigen oder geerbt), einen gewählten `clipPath` bzw. eine seiner Formen oder eine angegebene ID.
  Im Modus: Layer abgeblendet (CSS), die Formen des Clips als durchscheinende Fläche mit Umriss in Akzentfarbe in
  der Host-`<svg>` (Kopien ohne IDs, nie im Dokument-DOM), Banner „Editing Clip Path #id · Done“. Klick, Rahmen,
  Handles, Pfeiltasten, Snapping wirken **nur** auf die Formen des Clips (Magic Snap: sichtbare Nodes + Formen);
  Add (008) fügt in den `clipPath` ein. Esc (`canvas.escape`, nach Geste/Punkt) oder „Done“ (`clip.done`) beendet;
  verschwindet der Clip (Undo, Löschen) oder wechselt das Dokument, endet der Modus. Der Clip wirkt im Modus weiter
  (Live-Ergebnis). Die Hierarchie zeigt die Formen unter Definitions › clipPath (Auswahl klappt sie auf).
  Bezugs-Element („Owner“) für `userSpaceOnUse`/`objectBoundingBox`: das erste darstellende Element, das den Clip
  benutzt (Dokumentreihenfolge) – eindeutig und für die KI vorhersagbar.
- **E8 Geometrie der Clip-Formen** (`shared/geometry/clip-geometry.ts`): Clip-Raum → Dokument =
  `nodeToDocument(owner)` · `transform` des `clipPath` · Einheiten (OBB: `translate(b.x b.y) scale(b.w b.h)` der
  Owner-BBox) · Transforms zwischen `clipPath` und Element. Gemessen: Chromium liefert für Clip-Kinder eine
  `getScreenCTM()`, als stünde der `clipPath` an seiner Stelle im Baum – falsch für jeden Owner mit Transform.
  `nodeToDocument` nimmt deshalb für Elemente in einem `clipPath` diesen Weg; Handles, Rahmen, Verschieben,
  Einfügezentrum funktionieren damit unverändert. Matrizen nur aus dem Browser (`getScreenCTM`, `getBBox`,
  `transform.baseVal.consolidate()`) – keine eigene Transform-Kette. **Einheitenwechsel** exakt für den Owner:
  `T_neu = U⁻¹ · T_alt` bzw. `U · T_alt` (`U` = OBB-Matrix), als `transform` am `clipPath`
  (`clip-units.ts`, rein, Vitest). Andere Benutzer eines OBB-Clips ändern sich naturgemäß mit (im Picker genannt).
- **E9 Treffer respektieren Clips** (`hit-test.ts`): eine Node ist nur getroffen, wenn der Punkt in **jedem**
  wirksamen Clip liegt (eigener + Vorfahren; `isPointInFill` der Clip-Formen im Clip-Raum, E8). So trifft ein Klick
  auf den weggeschnittenen Teil die Node darunter. Clip-Formen selbst sind außerhalb des Modus nie treffbar,
  auswählbar (Rahmen) oder snapbar (schon 007: `isRendered`). Grenzen: `clip-rule` wird wie `fill-rule` geprüft,
  ein `clip-path` am `clipPath` selbst (verschachtelt) wird beim Treffer ignoriert, die Rahmenauswahl nutzt die
  ungeschnittenen Bounds.
- **E10 Referenzpflege.** Löschen eines `clipPath` (oder einer `defs` mit einem), den etwas benutzt, fragt immer
  („Delete Clip Path “id”? n elements use it …“) und entfernt Verweise + Clip-Gruppen im selben Schritt.
  **Duplicate**: Clips, auf die die Kopie zeigt und die außerhalb liegen, werden mit neuer ID (`id-2`) in die
  `<defs>` kopiert, die Kopie zeigt darauf. **Copy** (Zwischenablage, Copy XML): solche Clips kommen als `<defs>`
  hinter die Nodes; **Paste** legt `<defs>` des eingefügten Markups in die Wurzel-`<defs>` des Ziel-Assets (IDs
  eindeutig wie 006 E12), nicht in die gewählte Gruppe. Layer-Duplikat kopiert das Asset (006 E10) – Clips inklusive.
- **E11 Rendering und Export**: Canvas rendert nativ (Clip-IDs lösen je Layer-Shadow-Root auf, 004 E2); Export
  (012) übernimmt `clipPath` mit präfixierten IDs, `url(#…)` folgt (Vitest); resvg rendert Clip Paths (Rust-Test:
  Pixel außerhalb transparent, `userSpaceOnUse` und `objectBoundingBox`).
- **E12 Hierarchie**: Nodes mit eigenem Clip zeigen ein Clip-Symbol (Tooltip „Clipped by #id“), Clip-Gruppen heißen
  „Layer Clip · n“. Sonst bleibt der Baum (Formen unter Definitions › clipPath).
- **E13 Properties**: Abschnitt „Clip Path“ (`ClipPathSection`): bei **einer** darstellenden Node (Picker None /
  Inherit from Layer / IDs des Assets, Create, Edit, Remove, Hinweis), bei **einem** Layer unter dem Icon-Inspector
  (Picker None / IDs, Create, Edit, Remove) und bei einem `clipPath` bzw. seiner Form (Units, Edit, Remove,
  Anzahl der Benutzer). Remove = den gezeigten Clip löschen samt Verweisen (mit Rückfrage, E10).
- **E14 Aktionen mit Argumenten** (KI): `clip.create { node?, layer?, shape?, markup?, id? }`,
  `clip.assign { node?, layer?, clip?, mode? }` (`mode: 'none'|'inherit'` oder `clip: id`),
  `clip.edit { clip?, asset? }`, `clip.done`, `clip.remove { clip?, asset?, confirm? }`,
  `clip.setUnits { units, clip?, asset? }`. Ohne `node`/`layer` gilt die Auswahl.

## Verträge

```ts
// features/document/model/clip-model.ts (rein)
type ClipMode = 'own' | 'inherit' | 'none';
interface ClipResolution { mode: ClipMode; clip: string | null; from: Element | null; layer: boolean;
  other: string | null /* nicht auflösbarer Wert */ }
clipRefOf(el): { id: string } | { other: string } | null        // Attribut/Style
resolveClip(el, root): ClipResolution
effectiveClips(el, root): string[]                                // innen → außen
isClipGroup(el, root): boolean
layerClipOf(root): string | null; clipGroupsOf(root, id): Element[]
clipPathsOf(root): Element[]; clipUsers(root, id): Element[]; findClipPath(root, id): Element | null
clipOwner(root, clipEl): SVGGraphicsElement | null
uniqueClipId(root, base = 'clip'): string; canvasRect(root): Rect
// features/document/model/clip-units.ts (rein)
unitsMatrix(bbox): Matrix; convertUnitsTransform(transform: string|null, bbox, from, to): string | null
// features/document/commands/clip-commands.ts
InsertDefinition(asset, markup) · AssignClip(ref, mode, clip?) · SetLayerClip(asset, clip|null) · RemoveClipPath(ref)
// shared/geometry/clip-geometry.ts
clipSpaceToDocument(host, clipPath, el?): DOMMatrix | null; enclosingClipPath(el): Element | null
// features/clip/
ClipEditStore { target: Signal<{ asset, clip } | null>; enter(t); exit(); scope(doc): Element | null }
ClipService { create, assign, edit, done, remove, setUnits, model(…) }  · clip-actions.ts · ClipPathSection
ClipEditLayer (Formen in die Host-<svg>) · clip-texts.ts
```

Undo-Labels: `createClipPath`, `assignClip`, `removeClipPath`, `changeClipUnits`, `layerClip`.

## Tests

- Vitest: `clip-model.spec.ts` (Tabelle aus `SVGClipPathTests`: Definition, Kinder, Units-Default/eigene,
  Layer-Clip, Override, Opt-out, Create/Assign/Unassign, alle Formen; plus Clip-Gruppe, Style-Verweis, Kette),
  `clip-units.spec.ts` (Hin und zurück, mit vorhandenem Transform), `clip-commands.spec.ts` (jeder Command: Ergebnis,
  Undo = Snapshot, Redo = gleiche IDs, JSON hin und zurück; Teilen/Zusammenführen der Clip-Gruppe, Reihenfolge),
  Registry-Fälle, Duplicate/Paste/Copy/Delete mit Clips, Hierarchie-Badge, Properties-Abschnitt, Export-Präfix.
- Playwright: Clip anlegen (Layer), Modus betreten, Form verschieben → ein vorher sichtbarer Punkt wird
  weggeschnitten (Treffer + Pixel); Klick auf weggeschnittene Fläche trifft die Node darunter; Clip-Formen außerhalb
  des Modus weder treffbar noch per Rahmen wählbar; Handles im Modus liegen auf der Form (OBB und Owner mit
  Transform); Esc beendet.
- Rust: resvg schneidet (`userSpaceOnUse`, `objectBoundingBox`).

## Fragen an Marc

1. Opt-out über Teilen der Clip-Gruppe (E2/E4) statt `clip-path="none"` – einverstanden? Alternative wäre ein
   Clip je Wurzel-Kind (bläht das SVG auf, neue Nodes müssten ihn bekommen).
2. Layer-Clip ohne eigenes Marker-Attribut, rein an der Struktur erkannt (E3) – so werden Figma-Exporte zum
   Layer-Clip. Gewünscht?
3. Duplicate kopiert den Clip mit neuer ID (Prompt). Für viele Duplikate entstehen viele gleiche Clips – lieber
   teilen?

## Fortschritt

- [ ] Design
- [ ] Rust-Test resvg
- [ ] Modell, Units, Commands + Tests
- [ ] Geometrie, Treffer, Bearbeitungsmodus
- [ ] Properties, Aktionen, Hierarchie, Referenzpflege
- [ ] Playwright, Xvfb-Sichtprüfung, Doku
