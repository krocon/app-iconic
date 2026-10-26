# Design 003: Dokumentmodell, Undo und Dateien im Frontend

Status: umgesetzt · Datum: 27.10.2026

## Ausgangslage

002 liefert `open_icon`/`new_icon`/`save_icon`/`close_icon`/`read_svg_file`/`pick_*`, die Fassade `IconFileApi`, den
`FakeIconFileApi` und das Fixture-Modul. 003 baut darauf das Dokument im Frontend, Undo/Redo und die Datei-Abläufe;
Rust bekommt zuletzt benutzte Dateien und Fenster (Titel, mehrere Fenster, Schließen).

## Entscheidungen

- **E1 `IconDocument` ist eine veränderliche Klasse, `iconJson` ein unveränderlicher Wert.** Die SVG-Assets sind
  DOM (veränderlich, eine `XMLDocument` je Asset, per `DOMParser` `image/svg+xml`). `iconJson` wird nie in place
  geändert: Helfer in `model/icon-json.ts` (`getIn`, `setIn`, `removeIn`, `insertAt`, `removeAt`, `moveAt`)
  liefern ein neues Objekt mit geteilter Struktur und **behalten die Schlüsselreihenfolge** (ersetzter Schlüssel
  bleibt an seiner Stelle). Unbekannte Felder werden nie angefasst. JSON-Commands merken sich den alten Wurzelwert
  (billig wegen geteilter Struktur) – Undo ist damit exakt, auch die Schlüsselreihenfolge.
- **E2 Node-IDs** `data-ai-id="n<k>"` für **jedes** Element eines Assets (auch die Wurzel `<svg>`), Zähler je
  Dokument (`IconDocument.nextId()`), vergeben beim Laden, Import, Einfügen und Ersetzen. `serializeAsset()`
  serialisiert eine Kopie ohne alle `data-ai-*` (`XMLSerializer`). `NodeRef { asset, id }`; Stores halten nur
  Refs. Commands dürfen ihr eigenes (abgehängtes) Element halten, damit Redo dieselben IDs wieder einsetzt.
- **E3 Was wird gespeichert?** Jedes SVG-Asset merkt sich beim Laden/Speichern seine Serialisierung (`saved`).
  Beim Speichern gilt ein Asset als unverändert, wenn `serializeAsset()` gleich `saved` ist **und** das Backend
  eine Sitzung dafür hat (Dokument geöffnet oder schon gespeichert) → `unchanged: true`, Rust schreibt die
  Originalbytes (002 E5). Damit bleiben nicht bearbeitete Assets byte-gleich, auch wenn ein Undo die Änderung
  zurücknahm. Ein neues Dokument (`new_icon` hat keine Sitzung) schickt beim ersten Speichern alle Texte. PNG/
  andere Assets sind immer `unchanged`. SVGs, die der Browser nicht parsen kann (`<parsererror>`) oder die nicht
  als Text kamen (`unreadable_asset`), bleiben nur als Text bzw. Name im Dokument (nicht bearbeitbar, immer
  `unchanged`) und werden als Hinweis gemeldet.
- **E4 Bereinigung (`sanitize-svg.ts`) beim Öffnen, Import und Einfügen**: entfernt `<script>`,
  `<foreignObject>`, `on*`-Attribute, `href`/`xlink:href` außer `#…` und `data:image/…`, Attribute und
  `style`-Werte mit `url(…)` auf Externes, `<style>` mit `@import` oder externem `url(…)`, `<animate>`/`<set>`,
  die `href` oder `on*` setzen, sowie `javascript:` überall. Ergebnis: Liste von Hinweisen (`script`, `handler`,
  `foreign_object`, `external_ref`, `style`). Beim **Öffnen** wird die Basis-Serialisierung (E3) *nach* dem
  Bereinigen genommen: die WebView sieht nur Bereinigtes, auf der Platte bleibt die Datei unverändert, solange das
  Asset nicht bearbeitet wird (Roundtrip). Ein bearbeitetes Asset wird bereinigt gespeichert.
- **E5 Stile auflösen nur beim Import** (`resolve-styles.ts`), ohne eigenen CSS-Parser: die `<style>`-Texte
  werden mit `new CSSStyleSheet().replaceSync()` vom Browser geparst und in einem unsichtbaren Host mit
  **Shadow Root** (Stile wirken nicht auf die App) auf eine Kopie angewandt. Für jedes Element und jede in einer
  Regel oder einem `style`-Attribut vorkommende Eigenschaft wird `getComputedStyle` mit und ohne Stile verglichen;
  nur Unterschiede, die nicht bloß vom Elternelement geerbt sind, werden geschrieben – Präsentationsattribute als
  Attribut, alles andere als `style`-Eigenschaft. Danach sind `<style>` und `class` entfernt. **Einheiten:** `px`
  wird bei Längen-Attributen abgeschnitten, `em` mit der berechneten Schriftgröße in Benutzereinheiten umgerechnet,
  `%` bleibt (hängt vom Viewport ab und ist gültiges SVG). Der Host hat `font: medium` (16 px, wie ein
  alleinstehendes SVG), damit `em` nicht von der App-Schrift abhängt. Beim **Öffnen** eines `.icon` wird nichts umgeschrieben.
  Getestet in Playwright (jsdom kennt keine Kaskade).
- **E6 Undo** (`UndoService`, je Dokument, kein DI): Einträge mit fortlaufender ID; Save-Punkt = ID des obersten
  Eintrags beim Speichern, `dirty = top ≠ savePoint` (fällt ein Save-Punkt aus dem Redo-Stapel, bleibt das Dokument
  dirty, bis gespeichert wird). Tiefe 200. `CompositeCommand` für zusammengesetzte Aktionen. **Gesten:**
  `begin(label)` → `update(cmd)`* → `commit()` (ein Eintrag) / `cancel()` (alles zurück). Aufeinanderfolgende
  Commands einer Geste, die `merge()` können (`SetAttribute`/`SetIconJsonValue` auf dasselbe Ziel), werden
  zusammengelegt. `undo`/`redo` während einer Geste schließen sie vorher ab. Namen aus `undo-texts.ts` (legacy §12
  + neue für Gruppen/Layer/Import), Anzeige „Undo Change Attribute“. Undo einer Attribut-Entfernung stellt auch die
  Reihenfolge der Attribute wieder her (identische Serialisierung).
- **E7 `DocumentStore` je Dokument** (einfache Klasse mit Signals, `new DocumentStore(doc)`): `document`
  (`equal: () => false`), `revision`, `selection`, `dirty`, `canUndo/canRedo`, `undoLabel/redoLabel`,
  `execute/undo/redo/begin/update/commit/cancel`, `markSaved()`. Nach Undo/Redo werden Auswahl-Refs auf
  verschwundene Nodes entfernt. Der `FilesService` (Root-Service des Fensters – jedes Fenster ist eine eigene
  WebView) hält den aktuellen Store.
- **E8 Fenster und Dokumente:** jedes Fenster hat genau ein Dokument. Ein Fenster startet mit seinem Startpfad
  (`window_start_path`, von `open_document_window`) oder einem neuen, unbenannten Dokument. **New Document** (⌘N)
  ersetzt das Dokument im Fenster (Dirty-Frage, legacy §4). **Open** ersetzt ein unberührtes unbenanntes Dokument,
  sonst öffnet es ein neues Fenster (macOS-Verhalten); ist die Datei schon in einem Fenster offen, kommt dieses nach
  vorn. **Open Recent** wie Open. **Close** (⌘W) schließt das Fenster (Dirty-Frage). **New Window** (⇧⌘N) öffnet
  `doc-<n>` mit neuem Dokument.
- **E9 Fragen** über `AskService` + `AskDialog` (aus editlicious `shared/ask`, Promise, eine Frage zur Zeit):
  „Do you want to save the changes to “X”?“ – Save / Don't Save / Cancel (Esc = Cancel). **Save As** fragt nach dem
  Format (Bundle / ZIP / Cancel, Vorauswahl = aktuelles Format), dann der native Dialog. Fehler erscheinen als Frage
  mit „OK“ (Text aus `describeFsError`), Hinweise beim Öffnen (fehlende Assets, bereinigtes SVG) als Statuszeile.
- **E10 Rust-Fenster** (`windows.rs`, `DocWindows`): Labels `doc-<n>`; Startpfade je Label; Pfad je Label (gemeldet
  über `set_window_title`) für „schon offen?“; Fenster, die das Schließen übernommen haben (`take_over_close`):
  `CloseRequested` → `prevent_close` + Ereignis `close-requested` an genau dieses Fenster, das Frontend fragt und
  ruft `close_window` (zerstört das Fenster). Beim Schließen des letzten Fensters: **macOS** bleibt die App offen
  (`ExitRequested` ohne Code → `prevent_exit`; Klick aufs Dock-Symbol → `Reopen` öffnet ein neues Fenster), sonst
  beendet Tauri die App (Standard).
- **E11 Fenstertitel** `set_window_title(title, edited, path)`: macOS setzt den Titel und `setDocumentEdited:` am
  `NSWindow` (Punkt im roten Knopf; über `objc2`, Tauri hat dafür keine API), sonst `• ` vor dem Titel. Titel =
  Dateiname (vom Backend, siehe E13) bzw. „Untitled“.
- **E12 Zuletzt benutzt** (`ai-core::recent`, `recent.json` im App-Konfigordner über `config_file`):
  `{ "version": 1, "files": [...] }`, höchstens 10, neuester zuerst, ohne Duplikate, nur absolute Pfade.
  `recent_files` liefert nur noch vorhandene Einträge (Validierung beim Anzeigen wie legacy §4; die Datei behält
  vorübergehend fehlende, z. B. ein nicht eingehängtes Laufwerk), `add_recent_file` entfernt fehlende und setzt den
  Pfad nach vorn, `clear_recent_files` leert. Kaputte Datei → leer + `.bad` (config_file). Ein Mutex serialisiert
  Lesen-Ändern-Schreiben über alle Fenster. Die Liste erscheint als Menü an „Open Recent“ in der Toolbar (bis 005)
  mit „Clear Menu“ und „No Recent Items“.
- **E13 DTO-Ergänzung:** `IconDocumentDto.name` (Dateiname, `null` bei neuen) und `SaveResult.name`,
  `RecentFileDto { path, name }` – das Frontend zerlegt keine Pfade (CLAUDE.md §4).
- **E14 Browser-Modus:** `app/backend-providers.ts` bindet die Tauri-Fassaden; in der `development`-Konfiguration
  (`ng serve`, auch `tauri dev`) ersetzt `fileReplacements` sie durch `backend-providers.dev.ts`: in Tauri die
  echten, im Browser die Fakes aus `src/testing/` (In-Memory-Dateien mit `camscanner.icon`) und ein Test-Hook
  `window.__appIconic` für Playwright. Der Produktions-Build enthält keine Fakes. Im Browser beantworten die Fakes
  leere Dialoge mit Vorgaben (Öffnen → `camscanner.icon`, Speichern unter → `/browser/<Name>`), damit man
  `pnpm start` auch von Hand bedienen kann.
- **E15 Import SVG** (⇧⌘I): Name des Assets aus dem Dateinamen, Layer-Name = Name ohne Endung, beide eindeutig
  (`unique-names.ts`, TS-Gegenstück zu `names.rs`, geprüft mit `testdata/unique-names.json`). Neue Gruppe **am Ende**
  (wie legacy `importSVG`) mit den Icon-Composer-Vorgaben `shadow {neutral, 0.5}`, `translucency {true, 0.5}`
  (legacy: keine – echte Dateien haben sie immer). Ein `CompositeCommand` „Import SVG“ (AddAsset + AddGroup), ein
  Undo entfernt alles.
- **E16 Platzhalter bis 004/006:** Die Hierarchie zeigt Gruppen → Layer (Name, Asset, Opacity) und die Assets als
  Liste; das Canvas legt die SVG-Assets in Gruppen-/Layer-Reihenfolge (erste Gruppe unten, wie legacy) übereinander
  – in einem Shadow Root, damit `<style>` der Assets nicht auf die App wirkt (Vorbild für 004). Undo/Redo, Neu,
  Öffnen, Zuletzt, Import, Speichern, Speichern unter, Schließen, Neues Fenster sind Toolbar-Knöpfe.
- **E17 Provisorische Kürzel** (`provisional-shortcuts.ts`, klar markiert, 005 ersetzt ihn durch den
  `KeyboardDispatcher`): ein `keydown`-Listener für ⌘N, ⇧⌘N, ⌘O, ⇧⌘I, ⌘S, ⇧⌘S, ⌘W, ⌘Z, ⇧⌘Z (Ctrl außerhalb
  macOS). Nicht während ein Dialog offen ist und nicht in Eingabefeldern.
- **E18 Abhängigkeiten:** `objc2` 0.6 (nur macOS, ohnehin im Lockfile über Tauri/tao) für `setDocumentEdited:`.

## Verträge

### Rust

```rust
// ai-core::recent
pub const MAX_RECENT: usize = 10;
pub fn load(file: &Path) -> Loaded<Vec<String>>;            // config_file, ≤ 64 KiB, nur absolute, ohne Duplikate
pub fn save(file: &Path, files: &[String]) -> Result<(), FsError>;   // atomar, legt den Ordner an
pub fn add(files: &[String], path: &str, exists: impl Fn(&str) -> bool) -> Vec<String>;
pub fn existing(files: &[String], exists: impl Fn(&str) -> bool) -> Vec<String>;
pub fn display_name(path: &str) -> String;                  // letzter Pfadbestandteil
// app: windows.rs
pub fn window_title(title: &str, edited: bool, mac: bool) -> String;
pub struct DocWindows { /* next label, start paths, path per label, close takeover */ }
```

| Command | Signatur |
|---|---|
| `recent_files` | `() -> RecentFileDto[] { path, name }` – nur vorhandene |
| `add_recent_file` | `(path) -> RecentFileDto[]` |
| `clear_recent_files` | `() -> ()` |
| `set_window_title` | `(title, edited, path?) -> ()` – aufrufendes Fenster |
| `open_document_window` | `(path?) -> string` (Label; vorhandenes Fenster mit `path` kommt nach vorn) |
| `focus_document_window` | `(path) -> bool` – `true`, wenn ein anderes Fenster `path` zeigt (dann vorn) |
| `window_start_path` | `() -> string \| null` – einmalig, für das aufrufende Fenster |
| `take_over_close` | `() -> ()` – ab jetzt fragt das Fenster selbst (`close-requested`) |
| `close_window` | `() -> ()` – zerstört das aufrufende Fenster |

Ereignis `close-requested` (an das Fenster). DTO-Änderung: `IconDocumentDto.name`, `SaveResult.name`.

### Frontend

- `core/window/window-api.ts`: `WindowApi { setTitle(title, edited, path), openDocumentWindow(path),
  focusDocumentWindow(path), startPath(), takeOverClose(), closeWindow(), onCloseRequested(fn) }`.
- `core/recent/recent-files-api.ts`: `RecentFilesApi { list(), add(path), clear() }`.
- `features/document/`:
  - `model/icon-json.ts` (Pfade `JsonPath = (string|number)[]`), `model/unique-names.ts`
  - `svg/node-ids.ts` (`assignIds`, `stripInternal`, `serializeAsset`, `parseSvg`), `svg/sanitize-svg.ts`,
    `svg/resolve-styles.ts`
  - `icon-document.ts`: `IconDocument.fromDto(dto)`, `node(ref)`, `refOf(el)`, `asset(name)`, `nextId()`,
    `adoptSvg(root)`, `saveRequest(path, format, from?)`, `markSaved(result)`, `serialize()` (für Tests)
  - `undo/undo.service.ts`, `undo/undo-texts.ts`, `commands/*.ts` (`SetAttribute`, `RemoveAttribute`,
    `InsertNode`, `RemoveNode`, `MoveNode`, `ReplaceAssetMarkup`, `SetIconJsonValue`, `AddGroup`, `RemoveGroup`,
    `MoveGroup`, `AddLayer`, `RemoveLayer`, `AddAsset`, `RemoveAsset`, `CompositeCommand`)
  - `document.store.ts`
- `features/files/`: `files.service.ts` (New/Open/Recent/Import/Save/SaveAs/Close/NewWindow, Fragen, Titel),
  `recent-files.service.ts`, `recent-menu.ts`, `files-texts.ts`, `provisional-shortcuts.ts`, `svg-import.ts`.
- `shared/ask/` (aus editlicious).
- Platzhalter: `features/hierarchy/hierarchy-list.ts`, `features/canvas/canvas-view.ts` (Assets übereinander).

## Tests

- Vitest: `icon-json` (Reihenfolge, unbekannte Felder), `unique-names` (Tabelle), `node-ids` (IDs eindeutig,
  Entfernen, Serialisierung aller SVG-Fixtures ohne Änderung gleich), `sanitize-svg` (bösartige Beispiele),
  `IconDocument` (fromDto, Refs, Save-Request: nur geänderte Assets, neues Dokument alle), alle Commands
  (do → undo → identisch serialisiert, redo), `UndoService` (Labels, Gruppen, Gesten, cancel, merge, Tiefe,
  Save-Punkt), `DocumentStore` (Signals, Auswahl nach Undo), `FilesService` mit Fakes (Neu, Öffnen, Ersetzen vs.
  neues Fenster, Dirty-Frage Save/Don't Save/Cancel, Save nur wenn dirty, Save As mit Format, Import + Undo,
  Recent, Schließen, Titel), `AskService`, `RecentMenu`.
- Playwright: Öffnen (Fake) zeigt Hierarchie und Canvas, Attribut über Test-Hook ändern → Dirty-Marker im Titel,
  Undo/Redo (Knopf und Kürzel), Speichern → unverändertes Asset byte-gleich, Import SVG mit `<style>` → Attribute
  aufgelöst, Undo entfernt Gruppe/Layer/Asset; Schließen-Frage (Cancel / Don't Save); Save As ZIP.
- Rust: `recent` (fehlende Dateien, Grenze 10, Duplikate, kaputte Datei, relative Pfade), `window_title`,
  `DocWindows` (Labels, Startpfad einmalig, Pfad-Suche, Übernahme), `command_rules`.

## Fragen an Marc

1. **Open** ersetzt nur ein unberührtes, unbenanntes Dokument, sonst neues Fenster (macOS-Stil). Lieber immer im
   selben Fenster (mit Dirty-Frage)?
2. **Save As** fragt per Dialog nach dem Format (Bundle/ZIP). Alternative: zwei Menüpunkte in 005 („Save As…“,
   „Save As ZIP…“) – was ist dir lieber?
3. **Reihenfolge der Gruppen:** Platzhalter und Import folgen der Vorlage (erste Gruppe unten, Import ans Ende).
   In Icon Composer steht die oberste Gruppe der Seitenleiste vermutlich zuerst in `icon.json` – kannst du das mit
   einer Datei mit überlappenden Gruppen prüfen? (004 legt die Reihenfolge fest.)
4. Auf dem Mac prüfen: Punkt im roten Schließknopf bei ungespeicherten Änderungen (`setDocumentEdited:` über
   `objc2`), App bleibt nach dem letzten Fenster offen, Dock-Klick öffnet ein neues Fenster. **Quit (⌘Q)** fragt
   noch nicht nach ungespeicherten Dokumenten – das kommt mit dem App-Menü in 005.
5. Neue Gruppen beim Import bekommen `shadow`/`translucency` wie Icon Composer (die Vorlage ließ sie weg) – ok?

## Fortschritt

- [x] Design
- [x] Rust: `ai-core::recent`, `windows.rs`, 9 neue Commands, Fensterereignisse, macOS-Exit/Reopen
- [x] Frontend: Dokument, Undo, Commands, Bereinigung, Stile
- [x] Frontend: Dateien, Fenster, Fragen, Platzhalter, Browser-Modus (Fakes + Test-Hook)
- [x] Playwright (8 Tests), echte App unter Xvfb: ZIP über den nativen Dialog geöffnet, SVG importiert
  (Titel `• cam.icon`), gespeichert (unveränderte Assets und `icon.json` byte-gleich, neues Asset ohne
  `data-ai-*`), `recent.json` geschrieben, New Window, „Open Recent“ im zweiten Fenster holt das erste nach vorn
  statt die Datei doppelt zu öffnen, Close ohne Änderungen schließt sofort, mit Änderungen fragt es, „Don’t Save“
  beendet die App (letztes Fenster, Linux)
- [x] Doku, `pnpm check` + `pnpm e2e` grün

## Abweichungen und Grenzen

- **Kürzel** nur provisorisch (`provisional-shortcuts.ts`, E17); Menü und Keymaps bringt 005. Die Knöpfe stehen in
  der Toolbar (bei 900 px Fensterbreite wird es eng – 005 räumt sie ins Menü).
- **Quit (⌘Q)** fragt noch nicht nach ungespeicherten Dokumenten aller Fenster (App-Menü 005).
- **Schließknopf des Fensters** (`CloseRequested`) ist im Container nur über den Fake getestet (Xvfb ohne
  Fenstermanager hat keine Titelleiste); der Weg über „Close“ lief in der echten App.
- **macOS-Code** (`setDocumentEdited:`, `ExitRequested`/`Reopen`) kompiliert hier nicht mit (kein macOS-Target im
  Container); die CI baut und prüft ihn mit clippy auf `macos-latest`.
- **Gesten** (`begin/update/commit/cancel`) sind fertig und getestet, im UI benutzt sie erst 007.
- **Stile beim Import:** Pseudoklassen (`:hover`) und `:root`-Selektoren werden nicht aufgelöst (im Shadow Root
  gibt es kein `:root`); `%` bleibt stehen. Nicht bearbeitbare SVGs (Parserfehler) bleiben nur als Text erhalten.
- Die Reihenfolge der Assets kommt aus dem Backend (beim ZIP die Reihenfolge im Archiv) – sie ist nur Anzeige.
