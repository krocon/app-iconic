# Design 009: Properties-Panel

Status: umgesetzt · Datum: 27.10.2026

## Ausgangslage

006 liefert die Auswahl (`DocumentStore.selection` für SVG-Nodes, `items` für Root/Gruppen/Layer), 007 den
serialisierbaren Command `setAttributes` (mehrere Attribute an mehreren Nodes als ein Schritt, `merge` für Gesten),
die Gesten `begin/update/commit/cancel` (003 E6), die Transform-Hilfen `shared/geometry/transform-text`
(`transformItems`, `setItemArgs`, `prependAffine`) und `matrix`, sowie den Pivot-Handle im Canvas (erstes
`rotate(a cx cy)`, 007 E7). Das Properties-Panel zeigt bisher nur „Nothing selected“. 009 macht daraus einen
generischen Editor aus **Property-Specs** (die Vorlage hatte 1 500 Zeilen `PropertiesPanel.swift`).

## Entscheidungen

- **E1 Property-Spec rein** (`features/properties/property-spec.ts`): `PropertyDef { name, label, type, section,
  unit?, min?, max?, step?, default?, options?, on?/off?, reset }` mit `type` = `number | length | color | enum |
  text | textarea | toggle`, Abschnitte in fester Reihenfolge **Geometry, Appearance, Stroke, Text, Transform,
  Advanced**. Werte und Bereiche aus legacy §7.4 / `PropertySpec.swift`: `fill-opacity`, `stroke-opacity`, `opacity`
  0…1 (Schritt 0,01), `stroke-width` 0…100, `font-size` 4…512, `width`/`height` 0…10 000, `rx`/`ry` 0…1 000, `r`
  0…10 000, `stroke-miterlimit` 1…100 (Default 4), `fill-rule` nonzero|evenodd, Linecap butt|round|square,
  Linejoin miter|round|bevel, `display` inline|block|none, `visibility` visible|hidden|collapse, `vector-effect` als
  Toggle („Non-scaling stroke“: `non-scaling-stroke` / `none`), `stroke-dasharray`/`filter`/`mask`/`id` als Text,
  `d`/`points` als Textarea, `preserveAspectRatio` (none + 9 Ausrichtungen × meet/slice) für `image` und inneres
  `svg`. `specFor(tag)` je Node-Typ: Geometrie je Form (rect, circle, ellipse, line, polyline/polygon, path, text,
  tspan, image, use, svg, stop), Appearance + Stroke für alle darstellenden Elemente und Container (`g`, `a`,
  `switch`; vererbte Werte), Text nur für `text`/`tspan`, Transform für alles, was `transform` kennt, Advanced für
  alle. Nicht darstellende Elemente (Verläufe, `clipPath`, `mask`, `defs` …) bekommen nur Advanced, `stop` dazu
  `offset`, `stop-color`, `stop-opacity`. Clip Path (Picker) fehlt bewusst: Prompt 014.
- **E2 Werte lesen** (`property-values.ts`, DOM): `style`-Eigenschaft vor Attribut, weil sie im Browser gewinnt
  (der Prompt nennt „Attribut, sonst style“ – angezeigt wird, was wirkt; beim Schreiben verschwindet die
  `style`-Eigenschaft ohnehin, E3). Sonst für CSS-Eigenschaften der **berechnete** Wert (`getComputedStyle`,
  grau/kursiv mit Hinweis „inherited / computed“), sonst der Spec-Default als Platzhalter. Text-Inhalt (`text`)
  über `textContent`; enthält das Element Kind-Elemente (`tspan`), ist das Feld schreibgeschützt (Hinweis „Edit SVG…“,
  011).
- **E3 Schreiben = Attribut** (`property-edit.ts`): ein Wert wird als Attribut geschrieben; hat das Element eine
  gleichnamige `style`-Eigenschaft, gehört zum selben Schritt `style` ohne diese Eigenschaft (der Browser parst den
  `style`, `svg/style-props.ts`, aus 006 `visibility.ts` herausgelöst und dort wiederverwendet; leer → `style` weg).
  Alles als **ein** `setAttributes` (Label je Property wie legacy §12: Change Fill / Stroke / Stroke Width / Opacity /
  Font Size / Font Family / Font Weight / Transform, sonst Change Attribute). `SetAttributes` bekommt dafür
  `value: string | null` (`null` = Attribut entfernen; JSON `null`) – auch Reset ist damit ein serialisierbarer
  Schritt. Text-Inhalt über den neuen Command **`setText { changes: [{ ref, text }] }`** (mit `merge`, registriert,
  JSON-Roundtrip; nur Elemente ohne Kind-Elemente).
- **E4 Getippte Werte = Geste je Feld** (Coalescing, 003 E6/007 E9): die erste Änderung eines Felds startet
  `store.begin(label)`, jede weitere Eingabe ist ein `update` mit demselben `setAttributes` (Ziele werden zu Beginn
  aus einem Schnappschuss bestimmt – `style`-Bereinigung inklusive –, darum verschmilzt `merge` alles zu **einem**
  Command mit den Endwerten), **Enter/Blur** = `commit`, **Esc** = `cancel` (stellt den Ausgangswert her). Ungültige
  Zwischenstände (`1.`, `-`, leer) werden nicht geschrieben. Slider: Ziehen = Geste, Loslassen (`change`) = commit.
  Steuerung `PropertySession` (rein bis auf das Lesen der Schnappschüsse).
- **E5 Mehrfachauswahl** (`mixed.ts`, rein): angezeigt wird die **Schnittmenge** der Specs (Reihenfolge der ersten
  Node, Typ/Bereich der ersten); gleiche Werte erscheinen normal, verschiedene als leeres Feld mit Platzhalter
  „mixed“ (Farbe: Swatch mit Schraffur). Eine Änderung wirkt auf alle gewählten Nodes als ein Schritt. Gibt es keine
  gemeinsame Property außer Advanced, bleibt nur Advanced.
- **E6 Constrain proportions** (`constrain.ts`, rein): Schloss-Knopf zwischen `width`/`height` und zwischen
  `rx`/`ry` (je Panel, Standard aus). An: die andere Größe folgt im Verhältnis der Werte **zu Beginn der Geste** (je
  Node eigenes Verhältnis; ist eine Seite 0 oder fehlt, folgt nichts). Beide Attribute im selben `setAttributes`.
  Bei `scale` in der Transform-Liste gibt es dasselbe Schloss für x/y (wie `lockProportions` der Vorlage).
- **E7 Transform-Liste** (`transform-list.ts`, rein): `parseTransformList(text) → TransformStep[] | null` mit
  strenger Grammatik (nur `translate` 1–2, `scale` 1–2, `rotate` 1|3, `skewX` 1, `skewY` 1, `matrix` 6 Zahlen;
  Trenner Leerzeichen/Komma; alles andere → `null` = ungültig). Jeder Schritt behält seinen **Quelltext**:
  `serializeSteps` schreibt unveränderte Schritte Zeichen für Zeichen zurück, geänderte neu mit `fmt` (≤ 4
  Nachkommastellen). `stepMatrix`/`listMatrix` über `matrix.ts` (links zuerst multipliziert, wie
  `transform.baseVal.consolidate()` – geprüft in Playwright gegen den Browser). Bearbeiten: `addStep(kind)` (ans
  Ende, neutral: `translate(0 0)`, `scale(1 1)`, `rotate(0)`, `skewX(0)`, `skewY(0)`, `matrix(1 0 0 1 0 0)`),
  `removeStep`, `moveStep(from, to)`, `setStepArgs`, `setPivot(on)`: „Use pivot“ an setzt als Pivot die **Mitte der
  BBox** des Elements, abgebildet durch die Schritte nach dem `rotate` (also in dessen Koordinatensystem; die Form
  dreht dann um ihre Mitte), aus = `rotate(a)`. Anzeige der Zahlen auf 3 Nachkommastellen gerundet. Reihenfolge
  wie im Attribut (oben = links); Hinweis „top applies first“ wie die Vorlage (gemeint: das Koordinatensystem des
  obersten Schritts gilt zuerst). Umordnen per Drag am Griff (Zeigerereignisse wie 006 E7, Einfügelinie) und per
  Tastatur (Knöpfe ↑/↓ je Schritt; Alt+↑/↓ auf dem Griff). Rohanzeige: Textfeld mit dem Attributtext, Enter/Blur
  übernimmt nur gültigen Text (Fehler `role="alert"`, Esc verwirft); übernommen wird der Text, wie er getippt wurde.
  Jede Änderung ist ein `setAttributes` mit Label `changeTransform` (getippte Zahlen als Geste, E4). Der Pivot-Handle
  im Canvas (007) folgt von selbst, weil er aus `transform.baseVal` misst.
- **E8 Reset** (`property-edit.ts`): je Property ein Knopf ↺ (nur sichtbar, wenn ein eigener Wert gesetzt ist): ein
  Schritt „Reset Property“, der Attribut **und** `style`-Eigenschaft entfernt – danach gilt der geerbte Wert bzw.
  der Initialwert, der dem Spec-Default entspricht (die Vorlage schrieb Defaults wie `fill="none"` hinein, was das
  Bild ändert). Nicht zurücksetzbar (`reset: false`): Geometrie, ohne die die Form verschwindet (`width`, `height`,
  `r`, `d`, `points`, `href`), und der Text-Inhalt. „Reset All Properties“ im Panel-Kopf (und als Aktion) fragt
  zuerst (AskService) und entfernt alle zurücksetzbaren Properties der Auswahl in einem Schritt
  (`resetAllProperties`).
- **E9 Panel** (`properties-panel.ts`): Kopf mit Typ („rect“, „3 items selected“), Undo/Redo-Knöpfe (Aktionen
  `edit.undo`/`edit.redo`, Titel mit dem Undo-Label) und „Reset All…“. Leerzustand „Nothing selected – Select an
  element in the hierarchy or on the canvas.“. Root/Gruppe/Layer gewählt → Hinweis „Icon, group and layer
  properties come with the icon inspector.“ (Prompt 010). Abschnitte als Knöpfe mit `aria-expanded` (Advanced zu,
  der Rest offen). Jede Zeile: `<label for>` + Editor + Reset; alles per Tab erreichbar.
- **E10 Editoren** (`shared/controls/`, generisch, ohne Dokument-Wissen; Ausgaben `edit(value)` live, `commit()`,
  `cancel()` – als Outputs `edited`/`committed`/`reverted`, weil `cancel` ein DOM-Ereignis ist): **NumberField** (Stepped Slider: `<input type="range">` nur bei min+max, Zahlenfeld; ↑/↓ ± step,
  ⇧ × 10, auf den Bereich geklemmt; Ziehen am Label: ein Schritt je 2 px, ⇧ × 10, als Geste; Einheiten bei `length`
  bleiben erhalten: `50%` → `51%`), **ColorField** (Swatch, Hex-Feld `#RGB`/`#RRGGBB`/`#RRGGBBAA`, Menü `none` /
  `inherit` / `currentColor`, nativer Farbwähler `<input type="color">`, `url(#…)` als Verlaufs-Swatch mit Namen,
  benannte/`rgb()`-Farben bleiben als Text), **SelectField** (Optionen; ein unbekannter vorhandener Wert bleibt als
  zusätzliche Option), **TextField** (Input bzw. Textarea für `d`/`points`; in der Textarea bestätigt ⌘/Ctrl+Enter,
  Enter macht eine Zeile), **ToggleField** (Checkbox). Farbformate rein in `shared/controls/color-value.ts`.
- **E11 Aktionen** (KI-Regel): `properties.set { name, value, constrain? }` (setzt eine Property der Spec an allen
  gewählten Nodes, ein Schritt; `name: "text"` = Inhalt), `properties.reset { name }`, `properties.resetAll
  { confirm? }` (Palette: „Reset All Properties…“). Die Transform-Liste braucht keine eigene Aktion: sie ist
  `properties.set { name: "transform", value }`. Registriert vom `PropertiesService` (Root, folgt `FilesService.store`).
- **E12 Tastatur:** Der `KeyboardDispatcher` ruht in Textfeldern (005 E4) – Pfeile, Enter, Esc gehören dort dem
  Editor. ⌘Z im Feld ist das Undo des Felds (Browser); das Dokument-Undo liegt auf den Knöpfen im Panel-Kopf und
  wirkt außerhalb der Felder wie gewohnt.

## Verträge

```ts
// features/properties/property-defs.ts (Katalog) + property-spec.ts (je Node-Typ, rein)
type PropertyType = 'number'|'length'|'color'|'enum'|'text'|'textarea'|'toggle';
type SectionId = 'geometry'|'appearance'|'stroke'|'text'|'transform'|'advanced';
interface PropertyDef { name; label; type; section; unit?; min?; max?; step?; default?; options?; on?; off?; reset: boolean }
SECTIONS: readonly SectionId[]; specFor(tag): PropertyDef[]; commonSpec(tags): PropertyDef[]
bySection(defs): { section; defs }[]; isCssProperty(name): boolean
// features/properties/mixed.ts (rein)
type Combined = { kind: 'none' } | { kind: 'same'; value: string } | { kind: 'mixed' };
combine(values: (string | null)[]): Combined
// shared/controls/color-value.ts (rein)
parseHex(s): Rgba | null; toHex(c: Rgba): string /* #RRGGBB | #RRGGBBAA */; colorKind(v): 'hex'|'keyword'|'url'|'other'
normalizeHex(input): string | null; nativeValue(v): string /* #rrggbb for <input type=color> */
// features/properties/constrain.ts (rein)
PAIRS: { width: 'height', height: 'width', rx: 'ry', ry: 'rx' }; follow(name, value, before: {a, b}): number | null
// features/properties/transform-list.ts (rein)
type StepKind = 'translate'|'scale'|'rotate'|'skewX'|'skewY'|'matrix';
interface TransformStep { kind; args: number[]; source?: string }
parseTransformList(text): TransformStep[] | null; serializeSteps(steps): string
stepMatrix(step): Matrix; listMatrix(steps): Matrix; addStep(steps, kind); removeStep; moveStep(steps, from, to)
setStepArgs(steps, i, args); setPivot(steps, i, center: Point | null); normalizedArgs(step): number[]
// features/properties/property-values.ts (DOM)
interface PropertyValue { value: string | null; source: 'attribute'|'style'|'computed'|'default'|'none' }
readProperty(el, def): PropertyValue; readText(el): { text; editable }
// features/properties/property-edit.ts
propertyChanges(doc, refs, name, value: string | null, constrain?): AttributeChange[]
setPropertyCommand(doc, refs, name, value, constrain?): DocCommand | null
resetCommand(doc, refs, name): DocCommand | null; resetAllCommand(doc, refs): DocCommand | null
labelFor(name): UndoLabel
class PropertySession { constructor(store, refs, name); edit(value, constrain?); commit(); cancel() }
// features/properties/properties.service.ts (Root) – actions properties.set/reset/resetAll
// features/document/commands
SetAttributes { changes: { ref, name, value: string | null }[]; label }   // value null = remove (009 E3)
SetText { changes: { ref, text }[] }                                      // Typ 'setText', Label changeText
// shared/controls/
NumberField, ColorField, SelectField, TextField, ToggleField  (inputs value/placeholder/disabled…, outputs edit/commit/cancel)
```

Kein Rust-Command, keine neue Abhängigkeit.

## Tests

- Vitest (rein): `property-spec` (jede Node-Art hat ihre Geometrie, alle Namen aus legacy §7.4 kommen vor, Bereiche
  und Defaults, keine doppelten Namen je Spec, Schnittmenge), `transform-list` (Parse ↔ Serialize byte-gleich,
  ungültige Eingaben, Pivot an/aus mit BBox-Mitte, Umordnen, Matrix = Produkt der Schritte, Rundung),
  `color-value` (Hex 3/6/8, Keywords, `url()`, native Werte), `mixed`, `constrain`, `property-values` (Attribut,
  `style`, berechnet, Default), `property-edit` (style-Eigenschaft fällt mit weg, Mehrfachauswahl ein Schritt,
  Constrain, Reset, Reset All, Geste = ein `setAttributes`, Esc stellt her), `SetAttributes` mit `null`, `SetText`
  (do/undo/merge, Registry, feindliche Eingaben), Panel-Komponente (Leerzustand, Hinweis für Items, mixed,
  Abschnitte), Controls (Pfeiltasten ± step, ⇧ × 10, Enter/Esc).
- Playwright (`e2e/properties.spec.ts`): Breite tippen → Canvas-BBox ändert sich; Undo eines getippten Werts ist
  **ein** Schritt; rotate mit Pivot über das Panel → Pivot-Handle an der Bildschirmposition des Pivots (Screen-CTM,
  ± 0,5 px); Transform-Liste = `transform.baseVal.consolidate()` des Browsers; Mehrfachauswahl „mixed“ + Änderung an
  allen; Farbe per Hex; Reset entfernt die `style`-Eigenschaft.

## Fragen an Marc

1. **Hex mit Alpha:** FEATURES nennt `#AARRGGBB`, die Vorlage (`SVGColorValue.parse`) und CSS/SVG lesen 8-stellige
   Werte aber als `#RRGGBBAA`. Umgesetzt ist **`#RRGGBBAA`** (sonst färbt der Browser falsch). Passt das?
2. **Reset entfernt** Attribut und `style`-Eigenschaft (Wert fällt auf Geerbtes/Initialwert zurück), statt den
   Spec-Default hineinzuschreiben wie die Vorlage. Einverstanden?
3. **`style`-Bereinigung** geht über das CSSOM des Browsers (wie 006 beim Einblenden): unbekannte Deklarationen im
   `style` (z. B. `-inkscape-…`) gehen dabei verloren, sobald eine Property geschrieben wird, die auch im `style`
   stand. Lieber textuell nur die eine Deklaration entfernen?
4. **„top applies first“**: Die Liste steht in Attribut-Reihenfolge (oben = links im Text). Mathematisch wirkt der
   letzte Schritt zuerst auf die Punkte; der Hinweis der Vorlage meint das Koordinatensystem. Hinweis so lassen?
5. Auf dem Mac prüfen: nativer Farbwähler (`<input type="color">`) in WKWebView, Ziehen am Label mit Trackpad.

## Fortschritt

- [x] Design
- [x] Rust: nichts nötig (kein Command, keine Crate). Nebenbei: CI-Fehler aus 008 behoben – unter Windows liefert
      `File::open` auf einen Ordner `PermissionDenied`, darum prüfen `read_image_file`/`read_svg_file` jetzt zuerst
      `fs::metadata` (Test für SVG ergänzt)
- [x] Reine Module + Tests: `property-defs`/`property-spec`, `transform-list`, `color-value`, `mixed`, `constrain`,
      `step-value`
- [x] Commands `setAttributes` mit `null` (Undo stellt die Attribut-Reihenfolge her), `setText` (registriert,
      Roundtrip-Fälle); `property-values`, `property-edit` (`PropertySession`), `panel-model`, `style-props` (aus
      006 `visibility.ts` herausgelöst)
- [x] Controls (`shared/controls/`), Panel, Transform-Editor, `PropertiesService`, Aktionen `properties.*`;
      Tastatur-Kontext: im Panel nur `global` (Pfeile auf Slidern nudgen nicht den Canvas)
- [x] Playwright `e2e/properties.spec.ts` (7): Leerzustand/Hinweis, Breite live + ein Undo-Schritt (Panel-Knöpfe),
      Esc + Constrain, rotate mit Pivot → Pivot-Handle ± 0,5 px an der Screen-CTM-Position, Transform-Liste =
      `transform.baseVal.consolidate()`, Mehrfachauswahl mixed + `style`-Bereinigung + Reset + Reset All,
      `properties.set`
- [x] Echte App unter Xvfb (WebKitGTK): Leerzustand, Rechteck über die Command Sidebar, Breite 400 und Fill `#3a7`
      getippt → Canvas und Baum folgen
- [x] Doku, `pnpm check` + `pnpm e2e` grün

## Abweichungen und Grenzen

- **Slider nicht per Tab erreichbar** (`aria-hidden`, `tabindex=-1`): die Tastatur bedient das Zahlenfeld daneben
  (↑/↓, ⇧ × 10) – sonst gäbe es zwei Tab-Stopps mit derselben Bedeutung.
- **Rohanzeige der Transform-Liste** übernimmt erst bei Enter/Blur (ungültiger Text wird nie geschrieben); die
  Zahlenfelder der Schritte wirken live.
- **Mehrfachauswahl mit verschiedenen `transform`s:** die Schritte werden nicht gezeigt („different transforms“),
  die Rohanzeige ist leer; ein dort getippter Text gilt für alle. „Add“ ist dann aus (es würde alle überschreiben).
- **Text mit `tspan`s:** der Inhalt ist schreibgeschützt (Hinweis auf „Edit SVG…“, 011) – `setText` würde die
  Struktur flachklopfen.
- **⌘Z im Textfeld** ist das Undo des Felds (Browser, `nativeInText` aus 005); das Dokument-Undo liegt auf den
  Knöpfen im Panel-Kopf und wirkt außerhalb der Felder.
- **Bestehende E2E-Tests** suchten den Undo-Knopf seitenweit; mit dem zweiten Knopf im Panel sind sie jetzt auf die
  Werkzeugleiste (`header.toolbar`) eingeschränkt (Prüfung unverändert).
- Clip Path fehlt bewusst (014); Root/Gruppen/Layer-Eigenschaften zeigt das Panel als Hinweis (010).
- Leerzustand zweizeilig: „Nothing selected“ + „Select an element in the hierarchy or on the canvas.“
