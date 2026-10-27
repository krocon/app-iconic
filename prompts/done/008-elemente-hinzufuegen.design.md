# Design 008: Elemente hinzufügen (Command Sidebar, Menü „Add“)

Status: umgesetzt · Datum: 27.10.2026

## Ausgangslage

005 hat die Add-Aktionen (`add.*`) im Katalog, im Menü „Add“ und in der Palette – ohne Handler, also deaktiviert;
`Mod+I` ist `add.image`. 003/006 liefern die serialisierbaren Commands `insertNode`, `addAsset`, `addGroup` und
`composite`, 006 die Einfüge-Logik von Paste (Container → hinein, Node → dahinter) und `renameCollidingIds`, 007
Auswahl und Handles im Canvas sowie `CanvasEditStore.context` (Gruppen-Kontext nach Doppelklick). Die Command
Sidebar zeigt noch den Platzhalter „Coming with the next prompts.“.

## Entscheidungen

- **E1 Keine neuen Dokument-Commands.** Jede Add-Aktion erzeugt einen `composite` mit dem Label der Aktion
  (`addCircle`, `addGroup` …) aus vorhandenen Commands: Formen = `insertNode { parent, markup, index }`, Icon-Gruppe =
  `addAsset` + `addGroup`. Damit ist jedes Einfügen genau **ein** Undo-Schritt und als JSON darstellbar
  (`lastCommandJson()`); die KI kann wahlweise die Aktion (`add.circle { cx, cy, r, fill }`) oder den Command
  schicken. Neue Undo-Labels: `addGroup` (vorhanden), `addContainer`, `addCircle`, `addEllipse`, `addRect`, `addPath`,
  `addLine`, `addPolyline`, `addPolygon`, `addText`, `addImage`, `addSvgSnippet` („Add Circle“ …).
- **E2 Einfügeort** (`features/commands/insert-target.ts`, rein, Regeln der Vorlage
  `resolveTargetAssetAndContainer` + 006-Paste): (1) gewählte Nodes → die letzte (oberste Ebene der Auswahl): ist sie
  ein Container (`g`, `a`, `switch`, `svg`) → hinein ans Ende, sonst direkt dahinter im selben Eltern; (2) gewählter
  Layer → Ende seines Assets, gewählte Gruppe → ihr erster Layer; (3) Gruppen-Kontext des Canvas (Doppelklick,
  007 E3) → hinein; (4) sonst **Asset des aktuellen Layers** = erster Layer der ersten Gruppe mit bearbeitbarem
  SVG-Asset (oben in der Liste, 004 E3; Vorlage: `groups.first.layers.first`); (5) gibt es keinen solchen Layer, legt
  dieselbe Aktion zuerst eine Icon-Gruppe (E4) an und fügt in deren Asset ein – ein Undo-Schritt. Kein Dokument
  (Fenster ohne Store) → zuerst „New Document“, dann einfügen. Die KI kann `parent` (NodeRef) und `index` angeben.
- **E3 Zentrum** (`insert-center.ts`): Mitte des sichtbaren Viewports → Dokumentraum über den `ViewTransform`
  (`CanvasViewStore.toDocument`), auf die Leinwand 0…1024 geklemmt (nach weitem Pannen landet nichts außerhalb),
  dann mit `nodeToDocument(host, parent)⁻¹` in den Benutzerraum des Ziel-Elternelements – exakt auch bei
  transformierten Gruppen und Assets anderer Größe (Platzierungs-SVG, 004 E4). Ist das Elternelement nicht gerendert
  (ausgeblendeter Layer) oder fehlt der Host (Tests), gilt der Dokumentpunkt unverändert. **Explizite Geometrie der
  KI** (`cx`, `x`, `points` …) wird als Attributwert im Benutzerraum des Elternelements geschrieben (wie
  `setAttribute`), nicht umgerechnet.
- **E4 Icon-Gruppe** (`add.iconGroup`): neues Asset `layer-N.svg` (N = Anzahl Gruppen + 1, dann eindeutig über
  `uniqueAssetName`/`uniqueLayerName` wie die Vorlage `makeUnique*`), leeres SVG
  `<svg xmlns width="1024" height="1024" viewBox="0 0 1024 1024">`, Layer `layer-N`, Gruppe mit den Icon-Composer-
  Defaults von `newGroup` (Schatten neutral 0,5, Transluzenz 0,5 – wie Import, 003 E15; die Vorlage schrieb keine),
  eingefügt **hinter** der Gruppe des aktuellen Layers (Index + 1; ohne Gruppen an Index 0). Danach ist der **neue
  Layer** ausgewählt – die nächste Form landet darin (E2 Regel 2).
- **E5 Defaults** (`element-defaults.ts`, rein, Tabelle der Vorlage §8, Farbe `#000000`): Circle `r 128`; Ellipse
  `rx 160 ry 120`; Rectangle 256 × 256 zentriert; Path `M c.x,c.y-140 L c.x-140,c.y+140 L c.x+140,c.y+140 Z`; Line
  `c.x ± 160`, `stroke-width 12`, `stroke-linecap round`; Polyline `(−160,+120) (0,−140) (+160,+120)`, stroke 10,
  cap/join round, `fill="none"` (sonst füllt der Browser die offene Linie schwarz); Polygon `(0,−160) (−160,+120)
  (+160,+120)`; Text „Text“, `font-family="system-ui, -apple-system, 'SF Pro', sans-serif"`, `font-size 160`,
  `font-weight 400`, **`text-anchor="middle"`** und Grundlinie bei `c.y + 56` (≈ 0,35 em), damit der Text um die
  Mitte steht (die Vorlage setzte den Anfang auf die Mitte); Container leeres `<g>`. Zahlen über `fmt` (≤ 4
  Nachkommastellen). Markup über DOM (`createElementNS` + `XMLSerializer`) – kein Zusammenkleben von Strings.
- **E6 Aktions-Argumente** (KI-Regel, `add-args.ts`): je Form ihre Geometrie (`cx cy r`, `cx cy rx ry`,
  `x y width height rx`, `d`, `x1 y1 x2 y2`, `points`, `x y text`), dazu für alle `fill`, `stroke`, `strokeWidth`,
  `attributes` (Objekt Name → Text, Namen wie `setAttribute` geprüft, keine `on*`/`data-ai-*`), `parent` (NodeRef) und
  `index`. Fehlende Werte = Defaults. Ungültige Argumente → Aktion läuft nicht (`checkArgs`) bzw. die Prüfung im
  Handler verwirft (z. B. fremde Attributnamen). `add.image { href, width?, height? }` (nur `data:image/…`) und
  `add.svgSnippet { markup }` laufen ohne Dialog.
- **E7 Auswahl danach:** die eingefügte Node (bzw. alle eingefügten Nodes des Snippets) über `InsertNode.ref`; der
  Gruppen-Kontext des Canvas bleibt, wenn das Ziel darin liegt. Handles erscheinen sofort (007).
- **E8 Image** (`Mod+I`): Rust-Dialog `pick_image_file` (Filter PNG/JPEG/WebP/SVG), `read_image_file(path)` in
  `ai-core::icon::image_file`: höchstens **20 MiB**, Art an den **Magic Bytes** erkannt (nicht an der Endung; SVG =
  UTF-8-Text mit `<svg`), Größe aus dem Kopf (PNG IHDR, JPEG SOFn, WebP VP8/VP8L/VP8X) – sonst `invalid_image`.
  Ergebnis `ImageFileDto { name, mime, dataUrl, width?, height? }`. SVG-Größe ermittelt das Frontend (DOMParser:
  `width`/`height`, sonst `viewBox`; der Browser ist der Parser). Eingefügt als `<image href="data:…" x y width
  height>` mit natürlicher Größe, **nur verkleinert** auf höchstens 512 (Seitenverhältnis bleibt), zentriert. Ohne
  bekannte Größe 512 × 512. Ein SVG im `<image>` läuft im Browser im statischen Modus (keine Skripte).
  `insertNode` akzeptiert dafür bis **32 MiB** Markup (`MAX_NODE_MARKUP`; 20 MiB Base64 ≈ 27 MiB), `MAX_MARKUP`
  (16 MiB) gilt weiter für Assets und Paste.
- **E9 SVG Snippet** (`svg-snippet.ts` rein + Dialog): Text → als ganzes `<svg>` oder als Fragment geparst
  (`parseClipboard` aus 006), **bereinigt** (`sanitizeSvg`) bevor irgendetwas in die WebView kommt, Wurzel-`<svg>`
  entpackt (seine Kinder), `defs` werden mitgenommen (eigene Node, nicht verschoben), `id`s gegen das Ziel-Asset
  eindeutig (`renameCollidingIds`, Verweise folgen), Kommentare/Text verworfen. Zentrieren: die bereinigten Nodes
  kommen kurz in ein unsichtbares Mess-SVG (`measureSnippet`, `getBBox` einer umschließenden `<g>` – inklusive der
  eigenen `transform`s), die Verschiebung `Zentrum − Mitte der Bounds` wird **vorn** an `transform` jeder
  darstellenden Node gesetzt (`prependAffine`, wie 007 E11). Ohne Layout (jsdom) oder ohne Bounds bleibt die Lage.
  Ein `viewBox` der Snippet-Wurzel geht beim Entpacken verloren (Koordinaten bleiben die der Wurzel).
  Dialog „Paste SVG markup to append“: Textarea, Live-Fehler (`role="alert"`), „Add“ nur bei gültigem Markup, Esc
  bricht ab.
- **E10 Command Sidebar** (`features/commands/command-sidebar.ts`): Liste aller Add-Aktionen in der Reihenfolge des
  Menüs (Gruppen: Structure, Shapes, Tools, Import) mit eigenem 16er-Icon (`tree-icons`-Stil, keine SF Symbols),
  Titel und Kürzel; ein Suchfeld filtert (Teilwort, ohne Groß/klein). Tastatur: Pfeile ↑/↓ im Suchfeld und in der
  Liste bewegen den aktiven Eintrag, Enter führt aus, Home/End; Listbox nach APG (`role="listbox"`,
  `aria-activedescendant`). Diese Tasten sind lokale Bedienung eines Eingabefelds (wie die Palette, 005) und keine
  App-Funktionen. Deaktivierte Einträge (Freehand, Text to Path, Symbol bis 013) bleiben sichtbar mit Hinweis
  „Coming in a later version“. Ein Klick führt aus; der Fokus geht danach auf den Canvas (Pfeiltasten, ⌘Z wirken sofort). Enter im Suchfeld lässt
  den Fokus dort, damit mehrere Elemente nacheinander per Tastatur eingefügt werden können.
- **E11 Fehler** (ungültiges Bild, Snippet ohne Elemente, refused command) → Hinweis in der Statuszeile
  (`FilesService.notice`) bzw. im Dialog; nie Rusts `message`.

## Verträge

```ts
// features/commands/insert-target.ts (rein)
type InsertTarget =
  | { kind: 'node'; parent: NodeRef; index: number }
  | { kind: 'newGroup' };                                   // E2 Regel 5
insertTarget(doc, sel: Selection, context: NodeRef | null): InsertTarget
currentGroupIndex(doc, sel): number | null                  // Gruppe des aktuellen Layers (E4)
layerOfAsset(doc, asset): { group; layer } | null
// features/commands/element-defaults.ts (rein)
type ShapeKind = 'container'|'circle'|'ellipse'|'rect'|'path'|'line'|'polyline'|'polygon'|'text';
shapeAttributes(kind, c: Point): Record<string, string>; shapeText(kind): string | null
buildElement(tag, attrs, text?): string                     // Markup über DOM
fitImage(w, h, max = 512): { width; height }
// features/commands/add-args.ts
ADD_ARGS: Record<actionId, ArgsSpec>; shapeArgs(kind, args, c): { attrs; text } | null
// features/commands/icon-group.ts
iconGroupCommand(doc, sel): { command: CompositeCommand; group: number }
// features/commands/svg-snippet.ts
snippetElements(text): { elements: Element[] } | { error: 'empty' | 'invalid' }
snippetCommand(doc, parent: NodeRef, index, text, center, measure?): Planned | null
// features/commands/add.service.ts (Root) – add(kind, args?), addImage(args?), addSnippet(text)
// features/commands/add-actions.ts – registerAddActions(actions, add, destroyRef)
// core/icon-file: IconFileApi.pickImageFile(): string | null; readImageFile(path): ImageFileDto
interface ImageFileDto { name: string; mime: string; dataUrl: string; width: number | null; height: number | null }
```

Rust (`ai-core::icon::image_file`, Command-Schicht dünn und `async`):

| Command | Zweck |
|---|---|
| `pick_image_file()` | nativer Dialog (PNG, JPEG, WebP, SVG), `null` bei Abbruch |
| `read_image_file(path)` | Bild ≤ 20 MiB → `ImageFileDto` (Art aus Magic Bytes, Größe aus dem Kopf), Fehler `too_large`, `invalid_image` |

Neuer Fehlercode `invalid_image` (Rust `error.rs`, `fs-error.ts`, `describeFsError`). Keine neue Abhängigkeit.
Das Schema der Add-Argumente liegt in `core/actions/add-action-args.ts` (der Katalog darf keine Features
importieren), angewandt in `features/commands/add-args.ts`.

## Tests

- Rust: Erkennung PNG/JPEG/WebP (VP8, VP8L, VP8X)/SVG mit Größe, BOM-SVG, fremdes Format → `invalid_image`,
  > Grenze → `too_large`, Ordner, fehlende Datei; Data-URL-Präfix; Command `command_rules` (async).
- Vitest: Einfügeort-Regeln (Tabelle), Default-Geometrie je Befehl (Tabelle), Argumente (Geometrie, `attributes`,
  feindliche Namen), `fitImage`, Icon-Gruppe (Namen eindeutig, hinter der aktuellen Gruppe, ein Undo-Schritt,
  JSON-Roundtrip), Snippet-Extraktion (mehrere Wurzeln, `defs`, ID-Kollision, bösartiges Markup, leer/ungültig),
  `AddService` (Auswahl danach, kein Layer → Gruppe, kein Dokument → neues Dokument), Command Sidebar (Filter,
  Tastatur, deaktiviert), Snippet-Dialog (Live-Fehler).
- Playwright (`e2e/add.spec.ts`): Rechteck in eine rotierte Gruppe einfügen → Mitte im Dokumentraum = Mitte des
  sichtbaren Ausschnitts (± 0,5) nach Zoom/Pan, ein Undo entfernt es; Group legt Gruppe + Layer + Asset an
  (`icon.json` im Store) und die nächste Form landet darin; Snippet zentriert; Image über den Fake-Dialog;
  Sidebar-Suche + Enter; Freehand deaktiviert.

## Fragen an Marc

1. **Aktueller Layer** ohne Auswahl = erster Layer der ersten (obersten) Gruppe (wie die Vorlage). Soll sich die App
   stattdessen den zuletzt benutzten Layer merken?
2. **Text** steht mit `text-anchor="middle"` um die Mitte (Vorlage: Anfang auf der Mitte). Ok?
3. **Neue Icon-Gruppe** bekommt Schatten/Transluzenz-Defaults wie Icon Composer (Vorlage: keine Felder). Ok?
4. **Explizite KI-Koordinaten** gelten im Benutzerraum des Elternelements (rohe Attributwerte), nur das
   Default-Zentrum wird umgerechnet. Lieber Dokumentraum?
5. **Bilder werden nur verkleinert** (max. 512), kleine bleiben in natürlicher Größe. Auch vergrößern?
6. Auf dem Mac prüfen: nativer Bild-Dialog (Filter), `⌘I` im nativen Menü, `<image>` mit Data-URL im Icon Composer.

## Fortschritt

- [x] Design
- [x] Rust `ai-core::icon::image_file` (Magic Bytes, PNG/JPEG/WebP-Größe, SVG-Text, Grenzen) + Commands
      `pick_image_file`/`read_image_file` + Fehlercode `invalid_image`; 4 neue Tests, `command_rules` (25 Commands)
- [x] Frontend: insert-target, insert-center, element-defaults, add-args (Schema in `core/actions`), icon-group,
      svg-snippet (+ Dialog), image-size, AddService, add-actions, CommandSidebar, Fassade + Fake; 7 neue Spec-Dateien
      (Einfügeort-Tabelle, Default-Geometrie-Tabelle, Argumente/feindliche Namen, eindeutige Namen, Snippet mit
      mehreren Wurzeln/`defs`/ID-Kollision/bösartigem Markup, Service, Sidebar, Dialog)
- [x] Playwright `e2e/add.spec.ts` (5): Rechteck in `translate · rotate(30) · scale(1.5)`-Gruppe bei 150 % und 50 %
      → Mitte = sichtbare Mitte (± 0,5), ⌘Z stellt den Schnappschuss her; Group + Layer + Asset, nächste Form darin;
      Snippet mit Live-Fehler, zentriert, bereinigt; Image über den Fake-Dialog (2000 × 1000 SVG → 512 × 256);
      Sidebar-Filter + Enter, Freehand/Symbol deaktiviert, `add.circle` mit Argumenten
- [x] Echte App unter Xvfb (WebKitGTK): Sidebar mit Gruppen/Icons/Kürzel, Circle/Text/Rectangle/Ellipse zentriert
      und ausgewählt (Baum + Handles), Group (SVG) → „Group 2 / layer-2“, ⌘I öffnet den nativen GTK-Dialog mit
      Filter „Image“, ein 800 × 400-PNG landet als 512 × 256 zentriert in der neuen Gruppe (über `read_image_file`)
- [x] Doku, `pnpm check` + `pnpm e2e` grün

## Abweichungen und Grenzen

- **Platzhalter-Test angepasst:** `app.spec.ts` (Befehlspalette) sucht Combobox/Optionen jetzt im Dialog – die
  Sidebar hat ebenfalls eine Combobox. `registry.spec.ts`: die Grenze für `insertNode` ist jetzt 32 MiB (E8), der
  Fall „zu groß“ prüft beide Grenzen.
- **Snippet-Wurzel:** Attribute der entpackten `<svg>`-Wurzel (`viewBox`, `fill` …) gehen verloren; nur ihre Kinder
  werden eingefügt (wie die Vorlage).
- **Snippet-Zentrierung** ohne Layout (Vitest/jsdom) entfällt; geprüft in Playwright.
- **Bilder** werden nur verkleinert; ohne bekannte Größe 512 × 512. GIF nimmt die Vorlage an, hier nicht (Prompt:
  PNG/JPEG/WebP/SVG).
- **Freehand, Text to Path, Symbol**: sichtbar, deaktiviert (Hinweis „Coming in a later version“), aktiv ab 013.
