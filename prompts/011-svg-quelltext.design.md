# Design 011: SVG-Quelltext, Formatierer, Pfad-Optimierer

Status: in Arbeit · Datum: 27.10.2026

## Vorlage

- `Views/Sheets/EditSVGSheet.swift`: Sheet je Node, Markup aus `SVGCodeGenerator` (neu erzeugt, verlustbehaftet),
  „Apply“ ruft `AppModel.editNode` (Parser → Fehlertext), Undo „Edit SVG Code“. Kein Syntax-Highlighting, keine
  Fehlerposition.
- `Utilities/SVGPathOptimizer.swift` (`optimizeSVGPath(d, epsilon: 1.0)`): nur für Pfade **ohne** Kurven echte
  Vereinfachung (Ramer-Douglas-Peucker mit Eckenschutz: Kosinus < 0,98 → Ecke, Nachbarn im Radius 1 geschützt;
  doppelte Punkte weg; geschlossen = `Z` oder erster = letzter Punkt); mit Kurven nur „Zahlen abschneiden und
  `L` entfernen“. Zahlen werden **auf ganze Zahlen abgeschnitten** (`rounded(.towardZero)`).
- `Utilities/CGPathSimplify.swift`: Vereinfachung eines `CGPath` durch Abflachen der Kurven zu Polylinien (für
  SF-Symbol- und Text-Umrisse) – macht aus Kurven Linien.
- `AppIconicTests/SVGPathOptimizerTests.swift`: vier Fälle (Tabelle unten). Die Vorlage nutzt den Optimierer nur
  intern (SF Symbol, Text → Pfad), es gab keine Aktion „Optimize Path“.

## Entscheidungen

- **E1 CodeMirror 6, lazy.** `@codemirror/state`, `view`, `lang-xml`, `commands`, `search`, `lint` + `language`
  und `@lezer/highlight` (Hervorhebung über `HighlightStyle` mit unseren Tokens – beide kommen mit `lang-xml`
  ohnehin, werden aber direkt importiert). Der Editor steckt in `features/svg-source/code-editor.ts` und wird nur
  per `import()` geladen, wenn der Dialog aufgeht (eigener Chunk, Startbundle unberührt). Transitive Pakete, die
  jünger als zwei Wochen waren, sind über `pnpm.overrides` auf die Vorversion gesetzt (`@codemirror/autocomplete`
  6.20.3, `@lezer/common` 1.5.3). Farben, Schrift, Auswahl und Lint-Marker kommen aus `styles.css`-Tokens (CSS
  `var(--…)` im CodeMirror-Theme → hell/dunkel ohne Neuaufbau).
- **E2 Ziel des Dialogs.** Eine gewählte Node → `replaceNode` (neuer Command); die Wurzel `<svg>` eines Assets, ein
  gewählter Layer oder eine Gruppe (deren erster Layer, wie „Copy“ 006) → `replaceAssetMarkup` (003). Mehrfach-
  auswahl, Root, PNG-Assets und unlesbare Assets: Aktion deaktiviert.
- **E3 Der Dialog zeigt den echten Quelltext, nicht den formatierten.** Node: `serializeElement` (ohne
  `data-ai-*`); Asset: `serializeAsset` (Datei wie gespeichert). Ein Knopf „Format“ formatiert auf Wunsch (Präzision
  wählbar). Grund: Roundtrip-Regel – wer nur eine Farbe ändert, soll nicht alle Zahlen gerundet bekommen.
  Unveränderter Text → „Apply“ gesperrt (kein leerer Undo-Schritt).
- **E4 Prüfung live mit `DOMParser`** (`svg-source-check.ts`, rein): Fehler → `{ line, column, detail }` aus der
  Meldung des Parsers (Chromium/WebKit „error on line L at column C“, Firefox „Line Number L, Column C“, jsdom
  „L:C:“), dazu eigene Regeln: Asset muss `<svg>` im SVG-Namensraum sein, Node genau **ein** Element (ein
  `<svg>`-Element als Node nur, wenn es nicht die Asset-Wurzel ist – das ist dann E2). Lint-Marker an der Stelle
  (Offset aus Zeile/Spalte, geklemmt), Meldung unter dem Editor mit `role="alert"`. „Apply“ nur ohne Fehler.
- **E5 Neuer Command `replaceNode { ref, markup }`** (Label „Edit SVG Code“): Fragment wie `insertNode` parsen
  (`parseFragment`), bereinigen und **neue** IDs vergeben (`prepare`), Element an derselben Stelle tauschen; Undo
  setzt das alte Element (mit seinen IDs) zurück, Redo dasselbe neue. Die Asset-Wurzel ist kein Ziel
  (`CommandError`, dafür gibt es `replaceAssetMarkup`). Registriert in `registry.ts`, Roundtrip-Test wie alle.
- **E6 Auswahl bleibt, wenn möglich.** Nach `replaceNode` ist das neue Element gewählt. Nach `replaceAssetMarkup`
  wird jede gewählte Node über ihren **Index-Pfad** im Asset gesucht und gewählt, wenn dort ein Element mit
  gleichem `localName` steht; sonst fällt sie weg (rein, `selection-map.ts`). Gewählte Layer/Gruppen bleiben.
- **E7 Tastatur.** ⌘/Ctrl+Enter = Apply (CodeMirror-Keymap im Editor und `keydown` am Dialog), Esc = Cancel: bei
  Änderungen eine Rückfrage **im Dialog** („Discard changes?“ mit „Keep Editing“ / „Discard“), weil der
  `DialogService` nur einen Dialog zugleich kennt und `AskService` den Editor sonst zerstören würde. Esc, das
  CodeMirror selbst verbraucht (Suchleiste schließen), schließt den Dialog nicht: `Modal` übergeht ab jetzt
  `keydown`, das schon `defaultPrevented` ist. Der globale Dispatcher ruht im Dialog (Kontext `dialog`, 005 E4;
  `.cm-editor` gilt seit 005 als Textfeld).
- **E8 Formatierer `svg-format.ts`** (rein, DOM nur zum Parsen): XML → Text mit 2 Leerzeichen Einrückung, ein
  Element je Zeile, leere Elemente als `<x/>`; Attribute in fester Reihenfolge: Namensraum-Deklarationen, `id`,
  Geometrie (`x y width height cx cy r rx ry x1 y1 x2 y2 points d viewBox preserveAspectRatio`), `transform`, dann
  alle übrigen alphabetisch – damit stabil **und** idempotent. Zahlen gerundet (Präzision einstellbar, Default 3,
  `-0` → `0`, `1e-7` → `0`) nur in Attributen, die Zahlen tragen (Geometrie, `transform`, `viewBox`, Opazitäten,
  Strichbreite, `offset`, `stdDeviation` …, Liste in `NUMERIC_ATTRS`); `d` über den Pfad-Tokenizer (007), weil
  Bogen-Flags (`a1 1 0 0110 10`) für eine Zahlen-Regex nicht trennbar sind; ungültiges `d` bleibt unverändert.
  Text-Inhalt (`<text>`, `<tspan>`, `<title>`, `<style>`/CDATA) bleibt Zeichen für Zeichen; Elemente mit
  gemischtem Inhalt oder `xml:space="preserve"` werden nicht umbrochen. Kommentare und Prolog bleiben.
  `null` als Präzision = Zahlen unverändert.
- **E9 „Copy XML“ (006) formatiert** (Präzision 3), „Copy“ bleibt der Rohtext (Einfügen, andere Apps). Beim
  Speichern wird **nie** formatiert (Roundtrip, 003 E3).
- **E10 Pfad-Optimierer `path-optimize.ts`** (rein, übertragen aus `SVGPathOptimizer.swift` mit Herkunftsvermerk),
  auf den Segmenten des Tokenizers (007): je Teilpfad H/V → Linie; Null-Segmente (Linie/Kurve ohne Länge) und
  eine Linie zurück zum Start vor `Z` entfallen; **jede Folge von Linien** (nicht nur ganz kurvenfreie Pfade wie in
  der Vorlage) wird mit RDP + Eckenschutz der Vorlage vereinfacht (Kosinus 0,98, Radius 1, Endpunkte der Folge
  fest); Kurven und Bögen bleiben Kurven (nur gerundet) – Abflachen wie `CGPathSimplify` würde sie zerstören.
  Ausgabe kürzeste Form je Segment: absolut oder relativ (das kürzere), `H`/`V` wenn waagrecht/senkrecht,
  `S`/`T` wenn die Spiegelung passt, wiederholte Befehlsbuchstaben weggelassen, kein Trenner vor `-`. Relative
  Werte werden aus den **gerundeten** absoluten Punkten gebildet (kein Aufsummieren von Rundungsfehlern).
  `epsilon` Default 1.0, `precision` Default 3.
- **E11 Abweichungen von der Vorlage beim Optimierer**: runden statt abschneiden (Abschneiden verschiebt alles um
  bis zu 1 Einheit nach 0 hin); `L` nur weglassen, wo es implizit wiederholt würde (die Vorlage entfernte jedes
  zweite `L` auch nach einer Kurve – das macht aus `C… L70 80` Kurven-Parameter, ein Fehler); Linienfolgen in
  Pfaden mit Kurven werden auch vereinfacht. Die Testfälle der Vorlage stehen als Tabelle im Test, mit dem
  Ergebnis der Vorlage daneben (Präzision 0).
- **E12 Aktion `path.optimize { epsilon?, precision? }`** für alle `<path>` der Auswahl (auch in gewählten Gruppen;
  Layer/Gruppe → Pfade ihres Assets). Ohne Argumente öffnet sie den Dialog „Optimize Path“ mit Vorschau (Punkte
  und Zeichen vorher/nachher, Epsilon und Präzision einstellbar, Apply/Cancel); mit Argumenten (KI) läuft sie
  direkt. Ergebnis ist **ein** `setAttributes { changes: d…, label: 'optimizePath' }` („Optimize Path“). Pfade, die
  sich nicht ändern, fehlen im Command; ändert sich keiner, kein Undo-Schritt.
- **E13 Erreichbar** über Menü Edit („Edit SVG…“, neu „Optimize Path…“), Hierarchie-Kontextmenü (beide) und das
  Properties-Panel (Knöpfe unter den Abschnitten bzw. unter dem Icon-Inspector, nur wenn die Aktion aktiv ist).
  `edit.editSvg { markup }` (KI) ersetzt das Ziel direkt ohne Dialog (wie `add.svgSnippet { markup }`, 008 E6);
  Fehler → Hinweis in der Statuszeile.
- **E14 Feindliche Eingaben.** Das Markup aus dem Editor oder von der KI geht nur über die Commands (bereinigt
  durch `prepare`, 003 E4); Grenzen wie bisher (`MAX_MARKUP` für Assets, `MAX_NODE_MARKUP` für Nodes). Der Editor
  selbst rendert nichts (nur Text).

## Verträge

```ts
// document/commands/replace-node.ts
class ReplaceNode implements DocCommand {          // label 'editSvgCode'
  constructor(readonly ref: NodeRef, readonly markup: string);
  get newRef(): NodeRef | null;                      // nach do()
  toJSON(): { type: 'replaceNode'; ref: NodeRef; markup: string };
}

// document/svg/svg-format.ts
interface FormatOptions { precision?: number | null; indent?: number }   // Default 3 / 2
function formatSvg(markup: string, opts?: FormatOptions): string | null; // null = kein wohlgeformtes XML
function formatElement(el: Element, opts?: FormatOptions): string;       // Element ohne data-ai-*
function roundNumbers(value: string, precision: number): string;         // Zahlen in einem Attributwert
function formatPathData(d: string, precision: number): string;           // Form behalten, nur runden

// shared/geometry/path-optimize.ts
interface OptimizeOptions { epsilon?: number; precision?: number }        // 1.0 / 3
interface OptimizeResult { d: string; pointsBefore: number; pointsAfter: number }
function optimizePath(d: string, opts?: OptimizeOptions): OptimizeResult | null;
function rdpWithCorners(points: Point[], epsilon: number): Point[];       // Vorlage

// shared/geometry/path-write.ts
function writeShortest(segs: PathSeg[], precision: number): string;
function writeKeepingForm(segs: PathSeg[], precision: number): string;

// features/svg-source/svg-source-check.ts
type SourceTarget = { kind: 'node'; ref: NodeRef } | { kind: 'asset'; asset: string };
type SourceProblem = { line: number; column: number; detail: string; kind: 'syntax' | 'root' | 'count' };
function checkSource(text: string, kind: SourceTarget['kind']): SourceProblem | null;
function offsetOf(text: string, line: number, column: number): number;

// features/svg-source/selection-map.ts
function indexPath(root: Element, el: Element): number[] | null;
function mapSelection(oldRoot: Element, newRoot: Element, selected: Element[]): Element[];

// features/svg-source/svg-source.service.ts (Root-Service)
class SvgSourceService {
  target(): SourceTarget | null;  source(t): string | null;
  apply(t: SourceTarget, text: string): 'ok' | 'invalid' | 'failed';
  openDialog(): void;
  optimizeTargets(): Element[];   optimizeCommand(opts): SetAttributes | null;
  optimize(opts): boolean;        openOptimizeDialog(): void;
}
```

Aktionen: `edit.editSvg { markup? }`, `path.optimize { epsilon?, precision? }` (neu, Gruppe `edit`), Undo-Label
`optimizePath`. Dialoge: `DialogKind` `svgSource`, `optimizePath`. Kein Rust-Command, kein DTO.

## Tests

- Vitest: `svg-format` (Fixtures aus `testdata/fixtures/svg`: stabil = Snapshot einer Datei, idempotent für alle,
  Reihenfolge, Rundung, `-0`, Bogen-Flags, Text/CDATA/Kommentare unverändert, `xml:space`); `path-optimize`
  (Tabelle der Vorlage, Null-Segmente, `L` vor `Z`, Linienfolgen zwischen Kurven, Ecken bleiben, relative/absolute
  Kurzform, Eigenschaft „Abweichung ≤ epsilon + Rundung“ per Stichproben auf zufälligen Polylinien und
  Kurvenpfaden); `path-write`; `svg-source-check` (Fehlerposition aus den drei Meldungsformen, Offset, Wurzel- und
  Anzahl-Regeln); `selection-map`; `ReplaceNode` (do/undo/redo, IDs, Bereinigung, Wurzel abgelehnt, Registry-
  Roundtrip über `command-cases`); `SvgSourceService` (Ziele, Apply, Auswahl, Optimize-Command); Copy XML formatiert.
- Playwright: Dialog über das Kontextmenü öffnen, Farbe im Quelltext ändern, ⌘Enter → Canvas zeigt die neue Farbe,
  Undo stellt her; ungültiges Markup → Lint-Marker + „Apply“ gesperrt; Esc mit Änderungen fragt; Asset-Ziel über
  einen Layer; Optimize Path mit Vorschau und Undo.

## Fragen an Marc

1. „Edit SVG…“ zeigt den Rohtext (E3) mit Knopf „Format“ – oder lieber gleich formatiert (rundet Zahlen)?
2. Optimierer: runden statt abschneiden und Linienfolgen auch in Kurvenpfaden vereinfachen (E11) – ok?
3. „Copy“ bleibt roh, „Copy XML“ formatiert (E9) – passt die Trennung?

## Fortschritt

- [ ] Design
- [ ] Reine Module + Tests (Formatierer, Optimierer, Prüfung, Auswahl-Abbildung, `replaceNode`)
- [ ] Dialoge, Aktionen, Menü, Kontextmenü, Properties
- [ ] Playwright, echte App
- [ ] Doku
