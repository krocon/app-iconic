# Design 006: Hierarchie (Ebenenbaum)

Status: umgesetzt · Datum: 27.10.2026

## Ausgangslage

003 liefert `DocumentStore` (Auswahl `selection: NodeRef[]`, Commands, Undo), 004 den Canvas mit lebenden Assets und
die Geometrie-Basis (`nodeToDocument`, `nodeBoundsInDocument` über Screen-CTMs), 005 das Aktionssystem: Cut/Copy/
Paste/Duplicate/Delete/Select All/Deselect und Arrange (Front/Back/Group/Ungroup/Align) stehen im Katalog, ohne
Handler (deaktiviert); die Kontexte `hierarchy` und `dialog` sind leer. Die Hierarchie ist ein Platzhalter (Listen
Gruppen → Layer, Assets). 006 ersetzt ihn durch den echten Baum und bringt die Bearbeitungsfunktionen der Auswahl.

## Entscheidungen

- **E1 Baummodell rein aus dem Dokument** (`features/hierarchy/hierarchy-model.ts`, `computed` im Baum):
  `buildTree(doc) → TreeNode` mit Arten `root` (Icon, Hintergrund-Fill) → `group` → `layer` → `node` (SVG-Element,
  rekursiv) und `defs` (virtueller Knoten „Definitions“ je Layer). Die Asset-Wurzel `<svg>` hat **keine eigene
  Zeile**: der Layer steht für sie, seine Kinder sind die Kinder der Wurzel („hinein“ in einen Layer = ans Ende der
  Wurzel). Nicht darstellende Kinder der Wurzel (`defs`, `clipPath`, `mask`, `pattern`, Verläufe, `filter`,
  `symbol`, `marker`, `style`, `title`, `desc`, `metadata`) kommen in den eingeklappten Knoten „Definitions“; diese
  und alle Elemente darin bzw. in nicht darstellenden Elementen tragen `definition: true` – im Baum auswählbar
  (Copy XML, Delete, Duplicate), aber Canvas-Aktionen (Ausrichten, Front/Back, Group) sind dafür deaktiviert und
  der Canvas zeigt für sie keinen Rahmen. Zeilen-Ids: `root`, `g0`, `g0/l1`, `g0/l1/n17`, `g0/l1/defs` – ein Asset
  in zwei Layern erscheint zweimal (gleiche `NodeRef`, beide Zeilen markiert). `flatten(tree, collapsed)` liefert
  die sichtbaren Zeilen (Ebene, Position, Geschwisterzahl). Standard: Root, Gruppen, Layer offen; SVG-Container und
  „Definitions“ zu. Ab **500 Zeilen virtualisiert** (feste Zeilenhöhe `--tree-row-height`, nur der sichtbare
  Ausschnitt + Überhang wird gerendert).
- **E2 Reihenfolge im Baum:** Gruppen und Layer wie Icon Composer (erste = oben = vorn, 004 E3). **SVG-Nodes in
  Dokumentreihenfolge** (wie der Quelltext, Copy XML und „Edit SVG…“; die vorderste Node steht damit unten).
  „Bring to Front“ = letztes Kind des Elternelements, bei Gruppen/Layern Index 0. Frage 1.
- **E3 Zeile:** Typ-Icon (eigene 16-px-SVG-Glyphen, `tree-icons.ts`, keine SF Symbols), Name: `id`-Attribut, sonst
  Elementname + Kurzinfo (`rect 10 × 20`, `circle r 5`, `text “Hallo”`, `use → #a`, `g · 3`), Gruppe: `name` aus
  `icon.json`, sonst „Group n“; Layer: `name`, sonst `image-name`; fehlendes Asset als Warnung. **Swatches**
  (`swatch.ts`, rein) für Fill und Stroke aus dem Attribut oder der `style`-Eigenschaft des Elements selbst (nicht
  vererbt – wie die Vorlage): Farbe (immer mit Rand, Weiß bleibt sichtbar), `none` (durchgestrichen),
  `url(#verlauf)` als Mini-Verlauf aus den `<stop>`s des Assets (Verweise über `href` werden verfolgt, max. 8),
  andere `url(…)` (Pattern) schraffiert, `currentColor`/`inherit` als „geerbt“. Root zeigt den Hintergrund-Fill
  (`fillPreview` aus 004).
- **E4 Sichtbarkeit:** Auge-Knopf je Zeile. Node: `display="none"` setzen bzw. entfernen (auch `display:none` im
  `style` wird erkannt und beim Einblenden aus dem `style` entfernt); Gruppe/Layer: `icon.json` `hidden: true` bzw.
  Schlüssel entfernen (004 rendert `hidden` schon; der Schlüssel ist in Icon-Composer-Dateien belegt, Frage 2).
  **Alt-Klick** = rekursiv: Node mit allen Nachfahren, Gruppe mit allen Layern – alle auf den neuen Zustand der
  geklickten Zeile. Ein Undo-Schritt „Toggle Visibility“. Aktion `edit.toggleVisibility { recursive? }` für die
  Auswahl (Tastatur: Mod+Shift+H). Zeilen unter einem ausgeblendeten Vorfahren sind abgeblendet.
- **E5 Auswahl:** `DocumentStore.selection` (Nodes) bleibt die eine Quelle für Canvas und Baum; neu
  `DocumentStore.items` (Root, Gruppen, Layer: `IconItem`). Beide schließen sich aus (`select(refs)`,
  `selectItems(items)`), eine Auswahl ist **gleichartig** (nur Nodes, nur Gruppen oder nur Layer; ein Bereich über
  verschiedene Arten behält die Art des Ankers). Klick = einzeln, ⇧-Klick = Bereich ab Anker (sichtbare Zeilen),
  ⌘/Ctrl-Klick = umschalten. Tastatur nach **APG Tree** (`role=tree`, `aria-multiselectable`, flache `treeitem`s mit
  `aria-level/-posinset/-setsize/-expanded/-selected`, Roving Tabindex) – als Aktionen im Kontext `hierarchy`
  (CLAUDE.md §4): ↑/↓ (Fokus + Auswahl), Home/End, → (aufklappen bzw. erstes Kind), ← (zuklappen bzw. Eltern),
  ⇧↑/⇧↓/⇧Home/⇧End (Bereich), Mod+↑/↓ (nur Fokus), Mod+Space bzw. Ctrl+Space (umschalten), Space (auswählen),
  ⇧F10 / Kontextmenü-Taste (Kontextmenü). Ändert sich die Auswahl von außen (Canvas ab 007, KI über `edit.select`),
  klappt der Baum die Vorfahren auf und scrollt zur ersten ausgewählten Zeile. Undo/Redo entfernt verschwundene
  Gruppen/Layer aus `items`. Der Canvas zeichnet einen Auswahlrahmen (Vereinigungs-Box je Node, über
  `nodeBoundsInDocument`) in das Overlay – sichtbarer Abgleich bis 007 Handles bringt.
- **E6 Ein Command „Reorder Node“** (`ReorderNode`, Typ `reorder`, serialisierbar):
  `{ type: 'reorder', sources: TreeTarget[], target: TreeTarget, position: 'before'|'after'|'into' }` mit
  `TreeTarget = {kind:'group',group} | {kind:'layer',group,layer} | {kind:'node',ref}`. **Relative Position** statt
  Index – für Maus, Tastatur und KI gleich verständlich. Regeln (`model/reorder-rules.ts`, rein, Testfälle aus
  `TreeReorderServiceTests` der Vorlage): Quellen gleichartig, nicht der Root, nicht das Ziel; Gruppen nur
  vor/nach Gruppen (bleiben oben, „topLevelGroupRestriction“); Layer vor/nach Layern (auch in einer anderen Gruppe)
  oder hinein in eine Gruppe (ans Ende); Nodes vor/nach Nodes oder hinein in Container (`g`, `a`, `switch`, `svg`,
  `defs`, `symbol`, `clipPath`, `mask`, `pattern`, `marker`) oder einen Layer (ans Ende seiner Wurzel); nie in sich
  selbst oder Nachfahren („cycle“), keine Asset-Wurzel; eine Quelle in einer anderen Quelle zieht nur mit. Ergebnis
  ohne Änderung → abgelehnt („sameLocation“). Gruppen/Layer ändern `icon.json` als ein Wert (vorher/nachher, exaktes
  Undo), Nodes über `MoveNode` je Quelle (in Dokumentreihenfolge; „nach“ rückwärts, damit die Reihenfolge bleibt).
  Nach `do` liefert `moved` die neuen Orte der Quellen (Folge-Auswahl). Tastatur-Alternative (Kontext `hierarchy`,
  auch im Menü Arrange): **Move Up/Down** (Alt+↑/↓: vor das vorige / nach das nächste Geschwister), **Move Into
  Group** (Alt+→: ans Ende des vorigen Geschwisters, wenn es ein Container ist; Layer: in die vorige Gruppe), **Move
  Out of Group** (Alt+←: hinter das Elternelement; nicht für Layer, die immer in einer Gruppe stehen, und nicht für
  Kinder der Asset-Wurzel).
- **E7 Drag & Drop mit Zeigerereignissen** (keine HTML5-Drag-API: Tauri fängt Drag&Drop für Datei-Drops ab,
  besonders unter Windows): ab 4 px Bewegung beginnt das Ziehen (die gezogene Zeile wird ausgewählt, eine
  Mehrfachauswahl zieht mit). Ziel = Zeile unter dem Zeiger; oberes/unteres Viertel = vor/nach, Mitte = hinein
  (nur Container, sonst die nähere Hälfte). Eine **Einfügelinie** (eingerückt auf die Zielebene) bzw. ein Rahmen für
  „hinein“; ungültige Ziele (Regeln aus E6) zeigen nichts und der Zeiger wird `not-allowed`. Am Rand scrollt die
  Liste. Esc bricht ab (während des Ziehens wird `edit.deselect` übernommen, 005 E3 „jüngster Handler gewinnt“).
  **Wechselt eine Node das Asset**, meldet die Statuszeile Verweise, die dort nicht mehr auflösen
  (`svg/svg-references.ts`: `url(#…)`/`href="#…"` aus dem Teilbaum ohne Ziel im neuen Asset und Ziele im Teilbaum,
  auf die das alte Asset noch zeigt).
- **E8 Kontextmenü** (APG Menu, `context-menu.ts`): Rechtsklick (wählt die Zeile vorher aus, falls sie nicht in der
  Auswahl ist) oder ⇧F10/Kontextmenü-Taste: Duplicate, Group <g>, Bring to Front, Send to Back, Edit SVG… (Aktion
  `edit.editSvg`, Handler kommt mit 011 – bis dahin deaktiviert), Copy XML, Delete…. Pfeile/Home/End/Enter/Esc,
  Fokus zurück auf den Baum. „Delete…“ fragt („Delete “x”? This removes the node and its children.“, Delete/Cancel)
  und läuft als `edit.delete { confirm: true }`; Entf/⌫ und das Edit-Menü löschen ohne Frage (Undo genügt).
  Dieselben Aktionen in Edit/Arrange (005), neu im Menü: Copy XML (Edit), Show/Hide (Edit), Move Up/Down/Into/Out
  (Arrange).
- **E9 Löschen mit Folge-Auswahl** (`follow-up.ts`, rein): nächstes nicht gelöschtes Geschwister nach der letzten
  gelöschten Zeile, sonst das vorige vor der ersten, sonst die Eltern; bei Gruppen/Layern werden die Indizes auf das
  Ergebnis umgerechnet. Gruppe/Layer löschen entfernt auch **Assets, auf die danach kein Layer mehr zeigt**
  (`image-name` und `image-name-specializations`; ein Undo-Schritt stellt alles wieder her; Frage 3). Nachfahren
  einer gelöschten Node werden nicht doppelt gelöscht. Die Asset-Wurzel ist nicht löschbar.
- **E10 Duplicate** (⌘D): Nodes → Kopie direkt dahinter (`InsertNode` mit dem Markup, neue `data-ai-id`s; `id`s
  werden eindeutig gemacht: `x` → `x-2`, `x-3` …, Verweise im Teilbaum ziehen mit), Auswahl = Kopien. Layer → neuer
  Layer dahinter mit **eigenem Asset** (Kopie, eindeutiger Name über `unique-names`), Gruppe → Gruppe dahinter mit
  kopierten Layern/Assets – sonst würde die Bearbeitung der Kopie das Original ändern. Label „Clone“ (legacy §12).
- **E11 Group <g>** (⌘G, Command `groupNodes { refs }`): neue `<g>` an der Stelle der ersten (Dokumentreihenfolge)
  Node, alle Auswahl-Nodes desselben Assets hinein (Reihenfolge bleibt), Auswahl = die Gruppe. **Ungroup** (⇧⌘G,
  Command `ungroup { ref }`): Kinder an die Stelle der `<g>`, `transform` der Gruppe wird jedem Kind vorangestellt;
  nur für `<g>` ohne weitere Attribute als `id`/`transform` (sonst gingen geerbte Werte verloren – Frage 4).
- **E12 Zwischenablage als SVG-XML** (`core/clipboard/clipboard-api.ts` Fassade, `features/hierarchy/
  clipboard.service.ts`): **Copy** = Markup der Auswahl ohne `data-ai-*` (mehrere Nodes untereinander; Layer = das
  ganze Asset-SVG; Gruppe = das SVG ihres ersten Layers). **Cut** = Copy + Delete. **Paste** (`edit.paste { text? }`;
  ohne `text` aus der Zwischenablage): Markup wird geparst (ein ganzes `<svg>` oder Fragmente), **bereinigt**
  (`sanitize-svg`, im `InsertNode`), bekommt neue `data-ai-id`s, kollidierende `id`s werden umbenannt (Verweise im
  Eingefügten ziehen mit). Ziel: ausgewählter Container → hinein (Ende), andere Node → dahinter, Layer → ans Ende
  seiner Wurzel; ein ganzes `<svg>` in eine Node-Auswahl → seine Kinder. Ohne Node-/Layer-Auswahl (oder Root/Gruppe
  gewählt) wird ein ganzes `<svg>` eine **neue Gruppe oben** (wie Import, Asset-Name `Pasted.svg` eindeutig).
  Wege: die Aktionen nutzen `navigator.clipboard.writeText/readText` (Fassade, im Browser-Modus und unter Tests ein
  Fake). Zusätzlich hört der Baum auf die DOM-Ereignisse `copy`/`cut`/`paste` außerhalb von Textfeldern – so kommen
  die vordefinierten Einträge des macOS-Menüs an (005 E7), mit `clipboardData` ohne Berechtigungsfrage. Über
  Fenster/Dokumente hinweg geht es, weil es reiner Text in der System-Zwischenablage ist. Kein Rust-Command nötig,
  solange WebKitGTK/WKWebView/WebView2 `navigator.clipboard` liefern (unter Xvfb geprüft, siehe Fortschritt).
- **E13 Ausrichten** (`arrange.align.*`, ≥ 2 Nodes ohne Definitionen, alle mit Layout): Bezug = Vereinigung der
  `nodeBoundsInDocument` (BBox-Ecken über `nodeToDocument`, also inkl. aller Transforms bis zum Dokument). Je Node
  die Verschiebung `d` im Dokumentraum (`shared/geometry/align.ts`, rein), umgerechnet in das lokale System:
  `l = A⁻¹·d` mit `A` = linearer Teil der Eltern-Matrix (`nodeToDocument(host, parent)`, die Screen-CTM des Eltern-
  elements ist das Koordinatensystem der Kinder; `P⁻¹·T(d)·P` ist eine reine Translation um `A⁻¹·d`), gesetzt als
  **vorangestelltes** `translate(lx ly)` im `transform`. Verschiebungen < 0,001 entfallen; Zahlen auf 4 Stellen.
  Ein Undo-Schritt „Change Transform“ (Composite aus `SetAttribute`).
- **E14 Import fügt oben ein** (004 E3 kündigte es an): neue Gruppen aus „Import SVG…“ und „Paste“ an Index 0 = vorn,
  wie Icon Composer.
- **E15 Wo die Handler wohnen:** `features/hierarchy/edit-actions.ts` (edit.* und arrange.* der Auswahl, registriert
  von `App` – die Aktionen gehen auch bei ausgeblendetem Panel), Navigation `hierarchy.*` registriert der Baum
  (`hierarchy-tree.ts`) mit seinem `DestroyRef`. Bausteine rein und getestet: `edit-operations.ts` (Commands für
  Delete/Duplicate/Front/Back/Move/Visibility), `paste.ts`, `align.ts`.
- **E16 Neue Aktionen** (Katalog, alle mit Id; Argumente serialisierbar): `edit.copyXml`, `edit.editSvg` (011),
  `edit.toggleVisibility { recursive? }`, `edit.select { nodes?, items? }` (KI/Test: Auswahl setzen),
  `edit.delete { confirm? }`, `edit.paste { text? }`, `arrange.moveUp/moveDown/moveInto/moveOut`,
  `hierarchy.next/prev/first/last/expand/collapse/extendNext/extendPrev/extendFirst/extendLast/focusNext/focusPrev/
  toggleSelect/select/menu` (Kontext `hierarchy`, nicht in der Palette).
- **E17 Neue Undo-Namen:** `bringToFront`, `sendToBack`, `paste`, `cut`, `moveLayer`; Ausrichten heißt wie in der
  Vorlage „Change Transform“.
- **E18 Kürzel:** Move Up/Down/Into/Out auf Windows/Linux Alt+↑/↓/→/←, auf macOS ⌘⌥↑/↓/→/← (⌥+Pfeil springt in
  Textfeldern wortweise, und das native Menü würde es abfangen); Umschalten der Auswahl macOS Ctrl+Space (⌘Space =
  Spotlight), sonst Ctrl+Space; Show/Hide ⇧Mod+H.

## Verträge

```ts
// features/document/model/selection.ts
type IconItem = { kind: 'root' } | { kind: 'group'; group: number } | { kind: 'layer'; group: number; layer: number };
type TreeTarget = { kind: 'group'; group } | { kind: 'layer'; group; layer } | { kind: 'node'; ref: NodeRef };
// DocumentStore
items: WritableSignal<readonly IconItem[]>; select(refs): void; selectItems(items): void; clearSelection(): void
// features/document/model/reorder-rules.ts
type DropPosition = 'before' | 'after' | 'into';
type ReorderError = 'mixedSources' | 'cannotMoveRoot' | 'unknownSource' | 'unknownTarget' | 'parentNotContainer'
  | 'cycleDetected' | 'topLevelGroupRestriction' | 'sameLocation';
checkReorder(doc, sources, target, position): ReorderError | null
reorderIconJson(json, sources, target, position): { json; moved: TreeTarget[] }
isContainerElement(el): boolean;  isDefinitionElement(el): boolean
// commands (registriert, JSON-Roundtrip): MoveLayer { from:{group,layer}, to:{group,layer} },
//   ReorderNode { sources, target, position }, GroupNodes { refs }, Ungroup { ref }
// features/document/svg/svg-references.ts
collectIds(root): Set<string>; referencedIds(el): Set<string>; rewriteReferences(root, map)
renameCollidingIds(elements, taken): Map<string,string>; brokenReferences(doc, refs, targetAsset): string[]
// shared/geometry/align.ts
type AlignMode = 'left'|'centerH'|'right'|'top'|'middle'|'bottom';
unionRect(rects): Rect; alignDeltas(rects, mode): Point[]; localDelta(parent: DOMMatrix, d: Point): Point
// features/hierarchy
hierarchy-model.ts: buildTree(doc), flatten(tree, collapsed), rowIdOf…, TreeNode, TreeRow
swatch.ts: swatchOf(el, root): Swatch { kind: 'color'|'none'|'gradient'|'pattern'|'inherit'; css? }
node-label.ts: nodeLabel(el), groupLabel, layerLabel
follow-up.ts: followUpSelection(tree, refs, items): Selection { nodes, items }
edit-operations.ts: deleteCommand, duplicateCommand (Planned { command, selection() })
arrange-operations.ts: frontCommand, backCommand, moveCommand(dir), groupCommand, ungroupCommand, paintedNodes
visibility.ts: visibilityCommand(doc, sel, recursive)
paste.ts: parseClipboard(text), pasteCommand(doc, text, selection): Planned | null
align.ts: measurable(doc, host, refs), alignCommand(doc, host, refs, mode): DocCommand | null
edit.service.ts (EditService, Root), edit-actions.ts (registerEditActions, parseSelection, DOM-Clipboard-Ereignisse),
hierarchy-tree.ts/.html/.css, tree-navigation.ts, tree-selection.ts, tree-drag.ts, context-menu.ts, tree-icons.ts
// core/clipboard/clipboard-api.ts
abstract class ClipboardApi { writeText(text): Promise<void>; readText(): Promise<string> }
```

Kein neuer Rust-Command, keine neue Abhängigkeit.

## Tests

- Vitest: `hierarchy-model` (Arten, Namen, Definitions, Zeilen-Ids, Shared-Asset, flatten/collapsed),
  `swatch` (Farbe, Weiß, none, Verlauf mit href, Pattern, currentColor, style), `reorder-rules` (Fälle der
  Vorlage: Root, Gruppe in Gruppe, in Container, in Nicht-Container, über Gruppen; dazu Nachfahren, Asset-Wechsel,
  sameLocation, gemischte Quellen) und `ReorderNode` (do/undo/redo), `follow-up`, `edit-operations` (Delete mit
  Waisen-Assets, Duplicate mit `id`-Konflikten, Front/Back, Move Up/Down/Into/Out, Sichtbarkeit rekursiv),
  `paste` (Fragmente, ganzes SVG, Bereinigung, ID-Konflikte, neue Gruppe), `id-collisions`, `svg-references`,
  `align` (rein: Deltas, lokale Umrechnung), Commands-Roundtrip (`registry.spec`) für die neuen Typen,
  `HierarchyTree` (Rendern, Klick/⇧/⌘, Tastatur über Aktionen, Kontextmenü, Virtualisierung ab 500).
- Playwright (`e2e/hierarchy.spec.ts`): Ausrichten mit `nested_g.svg` (verschachtelte transformierte Gruppen) –
  alle sechs Modi, Ergebnis-Bounds per `getBBox`/CTM gleich auf ± 0,5; Drag & Drop mit der Maus (Gruppen, Node in
  Container, über Assets, Nachfahren abgelehnt); Tastaturbedienung des Baums; Sichtbarkeit und Reihenfolge im
  Canvas sofort; Copy/Paste über die Zwischenablage zwischen zwei Dokumenten; Kontextmenü Delete… mit Frage.

## Fragen an Marc

1. **SVG-Nodes in Dokumentreihenfolge** (vorderste unten) – oder lieber umgekehrt wie Gruppen/Layer (vorderste
   oben, wie Figma/Icon Composer)? Das Modell kann beides; Copy XML und „Edit SVG…“ sprechen für die
   Dokumentreihenfolge.
2. **`hidden` an Gruppe/Layer** ist unser Schlüssel für ausgeblendet (004 rendert ihn). Schreibt Icon Composer
   denselben Schlüssel? Bitte mit einer Datei prüfen, in der eine Gruppe ausgeblendet ist.
3. **Waisen-Assets:** Löschen eines Layers entfernt sein Asset, wenn kein anderer Layer darauf zeigt. Ok, oder
   Assets immer behalten?
4. **Ungroup** nur für schlichte `<g>` (nur `id`/`transform`). Sollen Attribute wie `fill`/`opacity` auf die Kinder
   verteilt werden?
5. Auf dem Mac prüfen: ⌘C/⌘X/⌘V im Baum über das native Menü (DOM-Ereignisse `copy`/`cut`/`paste`), Einfügen
   zwischen zwei Fenstern, ⌘C in Textfeldern unverändert.
6. Tastenkürzel neu (E18): Alt+↑/↓/→/← bzw. ⌘⌥+Pfeile (Move Up/Down/Into/Out), ⇧⌘H (Show/Hide) – ok?
7. Ein Layer-Duplikat bekommt eine **eigene Kopie des SVG-Assets** (`a 2.svg`), damit die Bearbeitung der Kopie das
   Original nicht ändert; `image-name-specializations` der Kopie zeigen weiter auf die alten Assets. Ok?

## Fortschritt

- [x] Design
- [x] Commands: `MoveLayer`, `ReorderNode` (Regeln + Testfälle der Vorlage), `GroupNodes`, `Ungroup` – registriert,
  JSON-Roundtrip (`registry.spec`), do/undo/redo (`commands.spec`); `parseFragment` lässt keine überflüssigen
  `xmlns` am eingefügten Element stehen
- [x] Rust: nichts nötig (kein Command, keine Crate) – `cargo` läuft im `pnpm check` unverändert grün
- [x] Frontend: Baummodell, Swatches, Namen, Icons, `HierarchyTree` (APG, virtualisiert, Drag & Drop, Kontextmenü,
  Augen), `EditService` + Aktionen (Cut/Copy/Paste/Copy XML/Duplicate/Delete/Show-Hide/Select All/Deselect/Select,
  Front/Back/Move/Group/Ungroup/Align), Auswahlrahmen im Canvas, Import oben; Platzhalter `hierarchy-list` entfernt
- [x] Vitest: Baum, Swatches, Folge-Auswahl, Delete/Duplicate/Arrange/Move/Sichtbarkeit/Paste, Reorder-Regeln,
  Referenzen/ID-Konflikte, Align (rein), `edit.select`-Argumente, Baum-Komponente (Klicks, Tastatur über den
  Dispatcher, Augen, Kontextmenü + Frage, Zwischenablage-Fassade, Virtualisierung)
- [x] Playwright (`e2e/hierarchy.spec.ts`, 6 Tests): Ausrichten aller sechs Modi mit `nested_g.svg` (± 0,5, Undo),
  Drag & Drop mit der Maus (Gruppen + Canvas-Reihenfolge, Node in Container, Nachfahren abgelehnt), Asset-Wechsel
  mit Meldung, Tastatur + Kontextmenü + Delete…, Sichtbarkeit im Canvas, Copy/Paste zwischen zwei Seiten über die
  echte Zwischenablage; bestehende Tests auf den Baum umgestellt (Import oben)
- [x] Echte App unter Xvfb (WebKitGTK): Import über den nativen Dialog, Baum mit Swatches, **Ctrl+C / Ctrl+V über
  `navigator.clipboard` funktioniert** (Rect in einen anderen Layer eingefügt, ausgewählt, Rahmen im Canvas) – kein
  Rust-Command mit `arboard` nötig; Drag & Drop einer Gruppe nach oben mit Einfügelinie, Canvas folgt sofort
- [x] Doku, `pnpm check` + `pnpm e2e` grün

## Abweichungen und Grenzen

- **Auswahl im Canvas per Klick** kommt mit 007 (Hit-Testing); 006 zeigt die Auswahl des Baums als Rahmen im Canvas
  und übernimmt jede Änderung von `DocumentStore.selection` (auch `edit.select` der KI) in den Baum.
- **„Edit SVG…“** steht im Kontextmenü und im Edit-Menü, bleibt aber bis 011 deaktiviert.
- **Ungroup** nur für schlichte `<g>` (E11, Frage 4).
- **Einfügelinie** „nach“ einer aufgeklappten Gruppe liegt unter deren Zeile (nicht unter dem letzten Kind) – die
  Bedeutung bleibt „nach der Gruppe“.
- **Copy einer Gruppe** kopiert das SVG ihres ersten Layers (eine Gruppe ist kein SVG); Paste ohne Ziel legt eine
  neue Gruppe an.
