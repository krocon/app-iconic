# Design 033: Folgen aus dem Review von 031

> Prompt: [033-haertung-folgen.md](033-haertung-folgen.md) · Stand: 30.10.2026 · Befunde: [031-Design](031-haertung-paritaet.design.md) E2

## Ausgangslage (bestätigt)

- `open_icon`, `save_icon`, `read_svg_file`, `read_image_file`, `export_svg/png`, `add_recent_file` und
  `open_document_window` nahmen jeden absoluten Pfad. `UserPaths` (071) merkte nur Drop-Pfade, niemand prüfte.
- `transform-list.ts` rechnete `stepMatrix`/`listMatrix` selbst (Befund 11).
- Über ~400 Zeilen (ohne Tests): `mcp.rs` 458, `settings.rs` 586, `commands.rs` 526, `action-catalog.ts` 934,
  `canvas-view.ts` 426, `edit.service.ts` 425 (Befund 14).
- `lib.rs` hatte im `RunEvent`-Match (nur macOS kompiliert) einen `WindowEvent::DragDrop`-Zweig aus 071 mit
  `window`, das dort nicht existiert – der macOS-Build wäre gebrochen. Entfernt (der richtige Zweig steht in
  `on_window_event`).
- Leistung im Container (30.10., vor 033) deutlich schlechter als am 27.10.: Ziehen mit Snap 1,6 s/Schritt mit
  `opacity` (siehe E4/E5, Messung unten).

## Entscheidungen

- **E1 Pfadschutz (Befund 6)** – `ai_core::user_paths::UserPaths` ist die eine Menge vertrauter Pfade (Rust-State).
  - **Erlauben** – genau zwei Arten:
    - `allow(paths)` / `allow_str(paths)`: **exakte** Pfade (Dateien oder Ordner, wie gewählt); begrenzt auf 1 024,
      die ältesten fallen heraus. Quellen: Antworten aller `pick_*`-Dialoge (`commands::grant`), „Open Recent“
      (`recent_files` erlaubt die gelisteten, vorhandenen Einträge), das System (`open_files::open_paths`: argv,
      Zweitstart über single-instance, `RunEvent::Opened`), Drops (`drop_files`, 071) und die KI-Brücke (der
      Router erlaubt `path` von `open_document`/`save_document` und `dir` von `export_*` nach der
      Argumentprüfung; `WindowHost::allow_path`). Pfade offener Dokumente sind dadurch erlaubt, dass sie aus einer
      dieser Quellen kamen.
    - `allow_tree(dir)`: ein **internes Verzeichnis der App** samt allem darunter – nur für Ordner, die Rust selbst
      berechnet (App-Daten/Config + Unterordner), nie für einen Pfad aus der WebView. Heute nutzt es niemand; es ist
      die Schnittstelle für 083 (Wiederherstellung), 084 (Symbol-Bibliotheken), 086 (MCP-Konfig).
  - **Prüfen**: `UserPaths::checked(&str) -> Result<PathBuf, FsError>` (absolut → sonst `invalid_path`; erlaubt →
    sonst `not_allowed`), in der Command-Schicht `commands::allowed(&paths, &path)`. Geprüft werden `open_icon`,
    `save_icon`, `read_svg_file`, `read_image_file`, `add_recent_file` (sonst wüsche die Recent-Liste jeden Pfad
    rein), `export_svg`, `export_png`, `open_document_window`. Ein Test (`path_rules::path_commands_check_their_paths`)
    liest den Quelltext und verlangt die Prüfung in jedem dieser Commands.
  - **Vergleich** nach Komponenten von `Path` (kein `canonicalize`: die Dialog-Antwort kommt als derselbe String
    zurück; Symlinks werden nicht aufgelöst). Pfade mit `..` oder NUL sind nie erlaubt, auch nicht in einem Baum –
    so kann `starts_with` nicht überlistet werden (`.` mitten im Pfad ist für `Path` keine Komponente). Ein gewählter Ordner ist **kein** Baum (Export schreibt in ihn,
    Rust bildet die Dateinamen selbst).
  - **Neuer Fehlercode** `not_allowed` (`error.rs`, `fs-error.ts`, `describeFsError` en/de: „Die App darf diese
    Datei nicht verwenden. Wähle sie mit Öffnen oder Importieren oder lege sie auf dem Fenster ab.“).
  - **Browser-Modus/E2E**: die Fakes (`src/testing/`) kennen keine Pfade aus Rust und bleiben unverändert
    durchlässig – der Schutz ist eine Tiefenverteidigung gegen eine kompromittierte WebView, kein UI-Verhalten.
  - **Verworfen**: Capability-Token statt Pfad (ändert jeden DTO-Vertrag); `canonicalize` (Bundles, die gerade
    getauscht werden, und nicht vorhandene Speicherziele).
- **E2 Dateien teilen (Befund 14), ohne Verhalten zu ändern**:
  - Rust: `commands.rs` → `window_commands.rs` (Fenster, Titel, Startpfade) + `menu_commands.rs` (Menü,
    Keymap, Quit); `mcp.rs` → `mcp_args.rs` (Schema-Prüfung, Grenzen, Timeouts, `file_paths`) + Router;
    `ai-core/settings.rs` → `settings/model.rs` (Typen, Standardwerte) + Lesen/Mischen/Prüfen. Jede Command-Datei
    hat ihren eigenen `command_rules`-Test.
  - Frontend: `action-catalog.ts` → `core/actions/catalog/` (`action-def.ts` Typen + Helfer; je Bereich
    `app-file`, `edit`, `modify`, `view`, `add`, `arrange`), `action-catalog.ts` setzt sie in der alten
    Reihenfolge zusammen (geprüft: `ACTIONS` als JSON identisch, 299 Einträge); `canvas-view.ts` →
    `canvas-measure.ts` (Messen der Auswahl je Änderung, Viewport/Host verbinden); `edit.service.ts` →
    `edit-items.ts` (rein: Select All, Gruppen/Ebenen als Objekte, Ziel-Asset eines Drops).
  - Knapp über 400 bleiben (Toleranz „~400“, nicht im Prompt genannt): `app.ts` 412, `path-model.ts` 414,
    `hierarchy-tree.ts` 408; `menu_spec.rs` 365 ohne Tests.
- **E3 Transform-Liste über den Browser (Befund 11)**: `transform-list.ts` bearbeitet nur noch Text (parsen,
  schreiben, Schritte); die Matrix einer Schrittliste rechnet `transform-matrix.ts` `stepsMatrix(steps)`: Schritte
  als `transform` eines losgelösten `<g>`, `transform.baseVal.consolidate()`. `setPivot(steps, i, center, matrixOf)`
  bekommt die Matrix-Funktion übergeben (Panel und Test-Hook: `stepsMatrix`; Vitest: ein Stub nur für
  Translationen). `stepMatrix`/`listMatrix` sind weg; die reinen Matrix-Tests (Produkt links zuerst, Skew,
  `matrix()`, leere Liste, neutrale Schritte, Pivot als Fixpunkt, T(c)·R·T(−c)) laufen in Playwright
  (`properties.spec.ts`, Hook `transformListMatrix`/`transformPivot`).
- **E4 Weniger Arbeit je Zieh-Schritt (JS)** – Chromium-CPU-Profil eines Zieh-Vorgangs (20 000 Formen):
  - Snap-Kandidaten werden schon einmal je Geste gesammelt (031); aber `magicPoints` und der `skip` der
    Smart-Guide-Ziele fragten **je Element** `doc.node()` (`querySelector`) – 4,1 s beim ersten Schritt. Jetzt
    `nodeIndex(doc, exclude)`: die Ids des Dokuments und der bewegten Knoten (samt Nachkommen) einmal als `Set`,
    gleiche Bedeutung für lebende Knoten und Kopien (`LayerStack`).
  - Während einer Geste rechneten Menüs (`enabled`/`checked` aller Aktionen), die Add-Seitenleiste und die
    Dokumentfarben (`ColorLibrary`) bei **jedem** Schritt neu (~2,6 s auf 10 Schritte). Neu
    `settledComputed(store, fn)` (`document/settled.ts`): hält den letzten Wert, solange `store.gesture()` läuft,
    und rechnet beim Ende neu – wie der Ebenenbaum seit 031. Undo/Ergebnis unverändert (die Geste bleibt ein
    `setAttributes`); nur diese Ansichten zeigen den Zwischenstand nicht.
- **E5 Schatten komponiert statt gerendert** – das Trace zeigte „Layerize“ 236 ms je Bild mit `opacity`: Der
  Gruppenschatten (010 E13, je Ebene) war ein SVG-`filter` auf dem `<g>` des Inhalts; jede Änderung zeichnete die
  ganze gefilterte Ebene samt aller `opacity`-Gruppen neu. Jetzt steht derselbe `<filter>` als CSS
  `filter: url(#ai-fx-shadow)` auf dem `svg.layer-host` mit `will-change: transform`: Chromium rastert nur die
  geänderten Kacheln und wendet den Filter beim Komponieren an. Damit es pixelgleich bleibt, ist der Filter in
  `primitiveUnits="objectBoundingBox"` des Kastens (= die 1 024 Einheiten der Fläche, bei jedem Zoom) und
  Versatz/Unschärfe mit der Skalierung der Ebene multipliziert (`stackScale`, Gruppe × Ebene; die Positionen sind
  gleichmäßige Skalierungen + Verschiebungen). Der Export (`export-svg.ts`) behält den Filter am `<g>` (resvg).
  Playwright `composited-shadow.spec.ts` vergleicht die Pixel mit der alten Darstellung (Skalierung 1 und 0,6:
  identisch; ein um 40 % falscher Schatten fällt auf).
  - **Verworfen** (gemessen in einer Testseite): „bewegte Elemente in eigener Ebene, Rest als festes Bild“ – eine
    statische Kopie unter einer bis auf die bewegten Elemente unsichtbaren lebenden Ebene war mit Schatten
    *langsamer* (der Filterbereich hängt am ganzen Inhalt), als `<img>` noch langsamer; dazu falsche Stapelreihenfolge
    während der Geste. Ohne Filter brauchte das bloße Ziehen in der Testseite nur 25–50 ms – der Filter war die
    Ursache, nicht die Zahl der Formen.
- **E6 Messung** im Container eingetragen (`docs/architecture.md` „Performance“, Tabelle mit „vor/nach 033“);
  `hardening.spec.ts` protokolliert jetzt zusätzlich den ersten Schritt (Sammeln der Snap-Kandidaten) und den Schnitt
  der übrigen. Die Messung in WKWebView (echte App auf dem Mac) bleibt eine Mac-Aufgabe (Fragen an Marc).

## Verträge

```rust
// ai_core::user_paths
impl UserPaths {
    pub fn allow<'a>(&self, paths: impl IntoIterator<Item = &'a Path>);     // exakte Pfade
    pub fn allow_str<'a>(&self, paths: impl IntoIterator<Item = &'a str>);
    pub fn allow_tree(&self, dir: &Path) -> Result<(), FsError>;           // internes Verzeichnis + darunter
    pub fn is_allowed(&self, path: &Path) -> bool;
    pub fn check(&self, path: &Path) -> Result<(), FsError>;              // not_allowed
    pub fn checked(&self, path: &str) -> Result<PathBuf, FsError>;        // invalid_path | not_allowed
}
// commands.rs
pub(crate) fn allowed(paths: &UserPaths, path: &str) -> Result<PathBuf, FsError>;
pub(crate) fn grant(app: &AppHandle, picked: Option<String>) -> Option<String>; // Dialog-Antwort erlauben
// mcp.rs
trait WindowHost { fn allow_path(&self, path: &str); /* … */ }
// mcp_args.rs
pub fn file_paths(tool: &str, args: &Map<String, Value>) -> Vec<String>;
```

**Für spätere Prompts (083, 084, 086):** ein internes Verzeichnis in `setup` bzw. beim ersten Gebrauch berechnen
(`app.path().app_data_dir()?.join("recovery")`), anlegen und mit
`app.state::<UserPaths>().allow_tree(&dir)?` erlauben; die WebView bekommt Pfade darin nur aus Rust (z. B. eine
Liste der Wiederherstellungsdateien) und reicht sie an die vorhandenen, geprüften Commands. Einen Pfad aus der
WebView nie an `allow_tree` geben; für einzelne Dateien `allow`/`allow_str`.

```ts
// document/settled.ts
function settledComputed<T>(store: () => DocumentStore | null | undefined, fn: () => T): Signal<T>;
// properties/transform-matrix.ts
function stepsMatrix(steps: readonly TransformStep[], doc?: Document): Matrix;
// properties/transform-list.ts
type StepsMatrix = (steps: readonly TransformStep[]) => Matrix;
function setPivot(steps, index, center: Point | null, matrixOf: StepsMatrix): TransformStep[];
// canvas/magic-points.ts
function nodeIndex(doc, exclude): { counts(asset, el): boolean; moving(asset, el): boolean };
// canvas/effects.ts
function shadowFilter(d, id, s, box?: { scale: number } | null): Element;
function stackScale(group, layer, appearance): number;
```

## Tests

- Rust: `user_paths` (exakt, begrenzt, Ordner ≠ Baum, `checked`, Bäume ohne `..`-Ausbruch), `error`
  (`not_allowed`), `commands::path_rules` (absolut + vertraut; jeder Pfad-Command prüft), `mcp_args::file_paths`,
  `mcp::open_document_…` (Router erlaubt die Pfade der KI, ein relativer Pfad wird vorher abgewiesen),
  `command_rules` je neuer Command-Datei.
- Vitest: `fs-error.spec` (`not_allowed` ohne Rust-Text), `settled.spec`, `magic-points.spec` (`nodeIndex`, Kopien),
  `effects.spec` (Einheiten des komponierten Schattens, `stackScale`), `layer-stack.spec` (CSS-Filter am Kasten,
  keiner am Inhalt), `transform-list.spec` (Pivot mit Stub).
- Playwright: `properties.spec` (Matrizen des Browsers), `composited-shadow.spec` (Pixel wie vorher, auch skaliert),
  `hardening.spec` (Messung, erster Schritt getrennt).

## Messung (Container, 30.10.2026, Playwright-Chromium 1.63, 2 vCPU, Software-Rasterung)

| Schritt | vor 033 mit `opacity` | nach 033 mit `opacity` | vor 033 ohne | nach 033 ohne |
| --- | --- | --- | --- | --- |
| Import | 5,3 s | 3,8 s | 4,2 s | 4,2 s |
| Zoom/Pan je Bild | 570 ms | 327 ms | 495 ms | 321 ms |
| Klick-Auswahl | 2,5 s | 0,95 s | 1,4 s | 1,1 s |
| Ziehen mit Snap, Schnitt über 20 Schritte | 1 473 ms | 360 ms | 701 ms | 380 ms |
| – erster Schritt (Snap-Kandidaten) | 6,2 s | 2,4 s | 6,7 s | 2,7 s |
| – danach je Schritt | 1 160 ms | 227 ms | 361 ms | 231 ms |

Das Ziel ≥ 50 fps ist im Container (Software-Rasterung, 2 vCPU) nicht messbar erreichbar; die verbleibende Zeit je
Schritt ist hier zum größten Teil Rastern/Komponieren in Software und GC. Auf dem Mac (GPU) neu messen.

## Fragen an Marc

1. **Mac**: `pnpm e2e e2e/hardening.spec.ts` auf dem MacBook (Playwright-Chromium) und das Ziehen in der echten App
   (WKWebView, `pnpm tauri dev`, großes SVG aus `node scripts/big-svg.mjs > big.svg`) – wie viele Bilder/s? Reicht es,
   oder soll der erste Schritt (Snap-Kandidaten sammeln, hier 2,4 s für 20 000 Formen) im Leerlauf vorbereitet werden?
2. **Mac**: Der Gruppenschatten ist auf der Zeichenfläche jetzt ein komponierter CSS-Filter. Sieht er in WKWebView
   genauso aus wie vorher (in Chromium pixelgleich)? Safari unterstützt `filter: url(#…)` an HTML/SVG-Kästen – bitte
   einmal mit Zoom 50/100/200 % ansehen.
3. Pfadschutz: Ein Pfad aus „Open Recent“ gilt als vertraut, sobald die Liste gelesen wurde. Sollen Einträge, deren
   Datei zwischenzeitlich ersetzt wurde (z. B. Symlink), anders behandelt werden? (Heute: wörtlicher Vergleich, kein
   Auflösen von Symlinks.)
