# Design 005: Aktionen, Menü und Tastatur

Status: umgesetzt · Datum: 27.10.2026

## Ausgangslage

003 liefert Datei-Abläufe (`FilesService`), Undo mit benannten Commands und provisorische Kürzel
(`provisional-shortcuts.ts`, 003 E17), 004 den Canvas mit `CanvasViewStore` und provisorischen Kürzeln für Zoom und
Space (004 E15). Alle Funktionen hängen an Toolbar-Knöpfen (bei 900 px Breite eng). Die Dokument-Commands aus 003
sind Klassen mit Konstruktor-Argumenten, aber **nicht serialisierbar** (`AddAsset` hält ein geparstes `SvgText`,
kein `type`, keine Registry). 005 bringt das Aktionssystem aus editlicious 005 / comic-commander 008 (Code mit
Herkunftsvermerk übernommen), Menüs, Palette, Kürzel-Dialog, Quit über alle Fenster und rüstet die KI-Regel
(Marc, 26.10.2026) für Commands und Aktionen nach.

## Entscheidungen

- **E1 Aktionskatalog** (`core/actions/action-catalog.ts`, aus editlicious): `ActionDef { id, label, context,
  group, palette?, repeat?, hold?, nativeInText?, args? }`. Kontexte `global` | `canvas` | `hierarchy` | `dialog`.
  Ids `^[a-z][A-Za-z0-9.]{0,63}$` (gleiche Regel wie Rust). Gruppen = Menüs (`file`, `edit`, `view`, `add`,
  `arrange`, `help`, `app`) für Palette und Kürzel-Dialog. Einträge, deren Funktion ein späterer Prompt liefert
  (Export, Cut/Copy/Paste, Add …, Arrange …, Snap), stehen im Katalog; ohne registrierten Handler sind sie
  deaktiviert – Menü und Palette zeigen das automatisch.
- **E2 Keymaps** `keymap.base.json` + `keymap.mac.json` + `keymap.other.json` (`Mod` = ⌘ bzw. Ctrl, Notation und
  `normalizeChord`/`chordOf`/`formatChord` aus editlicious `shortcut.ts`). Alle Kürzel aus legacy §4; neu nach
  gängigen Konventionen: ⇧⌘P Palette, ⌘/ Kürzel-Dialog, ⌘D Duplicate, ⌘G / ⇧⌘G Group/Ungroup, ⇧⌘↑ / ⇧⌘↓ Bring to
  Front / Send to Back (statt ⇧⌘] – auf deutschen Tastaturen braucht `]` Alt und ist kein Menü-Accelerator), ⌘A
  Select All, Esc und ⇧⌘A Deselect, Entf/⌫ Delete, ⌘Q Quit, Windows/Linux zusätzlich Ctrl+Y Redo und F10 Menüleiste.
  Tests: keine doppelten Kürzel je Kontext (auch keine doppelten JSON-Schlüssel: `scripts/keymaps.test.mjs` liest
  den Rohtext), OS-Dateien belegen keinen Basis-Chord um, Kontext-Kürzel verdecken kein globales.
- **E3 `ActionService`** (aus editlicious, erweitert): Handler `{ run(args?), enabled?, checked?, label?, release? }`
  mit `DestroyRef` (der jüngste gewinnt), `run(id, args?)` prüft die Argumente gegen `def.args` (kleines
  JSON-Schema: `object` mit `number`/`string`/`boolean`/`enum`-Eigenschaften, Grenzen) und verwirft Ungültiges
  (`false`). `label(id)` nimmt das dynamische Label des Handlers (Undo „Undo Change Attribute“, legacy §12) vor dem
  Katalog-Text. `describe()` liefert alle Aktionen mit Id, Text, Gruppe, Kürzel, `enabled`, `args` – die Liste,
  die der MCP-Server (018) der KI gibt. Aktionen mit Argumenten in 005: `view.zoomTo { zoom }` (0,25…2) und
  `edit.runCommand { command }` (ein serialisierter Dokument-Command, E15) – beide nicht in Palette und Menü.
- **E4 `KeyboardDispatcher`** (aus editlicious): der einzige globale `keydown`/`keyup`-Listener. Kontexte nach dem
  Fokus: offener Dialog → `['dialog']` (ruht damit, Dialog-Kontext ist in 005 leer), Fokus in der Hierarchie →
  `['hierarchy', 'global']`, sonst `['canvas', 'global']`. Textfelder (`input`, `textarea`, `select`,
  `contenteditable` – also auch CodeMirror ab 011) behalten alle Tasten außer `Mod`-Kürzeln und F-Tasten; Aktionen
  mit `nativeInText` (Undo/Redo, Cut/Copy/Paste, Select All, Delete) bleiben dort ganz beim Browser. Menü-Widgets
  (`role=menu|menubar|listbox`) behandeln ihre Tasten selbst. **Neu gegenüber editlicious:** ein Kürzel, dessen
  Handler gerade `enabled() === false` ist, fällt durch (nächster Kontext / Browser) statt verschluckt zu werden;
  **Halte-Aktionen** (`hold`, Space = `canvas.panHold`): `run` beim Drücken, `release` beim Loslassen oder wenn das
  Fenster den Fokus verliert, Wiederholungen werden geschluckt.
- **E5 Menümodell** `features/menus/menu-model.ts` (rein, aus editlicious): File / Edit / View / Add / Arrange /
  Help wie im Prompt; „Open Recent ›“ mit `file.recent.1…10` (Namen aus dem `RecentFilesService`), „No Recent Items“
  (`file.noRecent`, nie registriert = deaktiviert) und „Clear Menu“; View mit Untermenüs „Appearance“ und „Platform
  Mask“ (Radio-Einträge) und Palette; Arrange mit „Align ›“. macOS: About und Quit im App-Menü (Rust), Windows/Linux:
  Quit im File-, About im Help-Menü. `resolveMenu` (Texte, `enabled`, `checked`, Accelerator) → `toSpec` (für Rust,
  Texte bereinigt ≤ 120 Zeichen). `menuChord`: im nativen Menü nur Kürzel mit Modifier oder F-Taste (Delete/Space
  würde das Menü vor der WebView abfangen); die HTML-Leiste zeigt den ersten Chord.
- **E6 macOS: natives Menü je Fenster** (`app_menu.rs`, aus editlicious, erweitert für mehrere Fenster): jedes
  Fenster schickt seine Spec (`set_app_menu`, entprellt 150 ms); Rust prüft sie (`ai-core::menu_spec`: Größe,
  Tiefe, Ids, Texte), merkt sie je Fensterlabel und setzt die Spec des **fokussierten** Fensters (beim Fokuswechsel
  neu). Ein Klick geht als `menu-action { id }` nur an das fokussierte Fenster (`emit_to`). **Ohne Fenster** (macOS
  bleibt offen, 003 E10) zeigt das Menü die letzte Spec, in der nur fensterunabhängige Einträge (New, New Window,
  Open, Open Recent, Shortcuts, About) aktiv bleiben (`menu_spec::without_window`, rein); ein Klick darauf öffnet
  ein neues Fenster, das die Aktion als **Startaktion** ausführt (`window_start_action`), New/New Window öffnen nur
  das Fenster.
- **E7 Edit-Menü auf macOS ohne vordefiniertes Edit-Menü** (editlicious E3): Undo/Redo sind unsere Einträge (sonst
  wirkte ⌘Z doppelt, einmal im Undo-Manager der WebView). **Cut / Copy / Paste / Select All** dagegen sind in
  unserem Edit-Menü **vordefinierte Einträge** (`PredefinedMenuItem`, Ids `edit.cut|copy|paste|selectAll` erkennt
  Rust): ihre Cocoa-Selektoren gehen an den First Responder (WKWebView) – Kopieren/Einfügen in Textfeldern
  funktioniert, und außerhalb von Textfeldern kommen sie als DOM-Ereignisse `copy`/`cut`/`paste` an, die 006 für
  „Copy/Paste als SVG-XML“ nutzt (Zwischenablage ohne Plugin, 001 E4). Windows/Linux: der Dispatcher lässt
  Ctrl+C/X/V/A in Textfeldern dem Browser (`nativeInText`). Grenze: ⌘Z in einem Textfeld macht auf macOS das
  Dokument-Undo, nicht das Text-Undo (wie editlicious).
- **E8 HTML-Menüleiste** (Windows/Linux, `features/menus/menu-bar.*`, aus editlicious, APG „menubar“): immer
  sichtbar in der Kopfzeile (anders als editlicious; ausblenden kommt mit 015), F10 oder ein einzelnes Alt setzen den
  Fokus hinein (`app.focusMenu`), ←/→ zwischen Menüs, ↓/Enter/Space öffnen, Esc zurück, Untermenüs werden als
  beschriftete Gruppe im Menü gezeigt. Die Wahl führt die Aktion nach dem Zurückgeben des Fokus aus.
- **E9 Befehlspalette** (⇧⌘P, aus editlicious, APG-Combobox) mit allen registrierten, aktiven Aktionen außer
  `palette: false`, filterbar über alle Wörter in Text und Id; **„Keyboard Shortcuts“** (⌘/, Help-Menü): alle
  Aktionen mit ihren Kürzeln dieses OS, filterbar, gruppiert nach Menü. Beide als Dialoge des `DialogService`
  (`'palette' | 'shortcuts'`).
- **E10 „View Options“** in der Canvas-Toolbar (legacy): ein Menüknopf (APG „menu button“) mit denselben Aktionen –
  Rulers, Guides, Background, Cross Cursor, Show Handles, Snap to Grid, Magic Snap (Häkchen), Appearance und
  Platform Mask (Radio). Ersetzt die vier Umschaltknöpfe und die zwei Auswahllisten aus 004; die Zoom-Gruppe bleibt
  (ihre Knöpfe laufen über Aktionen). Snap to Grid und Magic Snap sind Zustände im `CanvasViewStore` (Default aus /
  an, legacy §6), wirken erst ab 007.
- **E11 Schlanke Kopfzeile:** die Datei-Knöpfe aus 003 entfallen (Menü). Windows/Linux: `[Icon] [Menüleiste] …
  [Titel •] [Undo] [Redo]`, macOS: `[Icon] AppIconic … [Titel •] [Undo] [Redo]`. Undo/Redo zeigen das Label
  („Undo Import SVG“) als Tooltip/Name. Der About-Knopf wandert ins Help- bzw. App-Menü.
- **E12 Seitenleisten ⌘1/⌘2/⌘3** (`features/shell/layout.store.ts`, Root-Service mit drei Signals, Checkbox-
  Einträge im View-Menü); Breiten und Persistenz in 015.
- **E13 Quit fragt alle Fenster** (aus 003 offen): Rust führt eine Warteschlange (`windows::QuitQueue`, rein):
  `quit_app` bzw. der App-Menü-Eintrag Quit (⌘Q) nimmt alle Fenster auf und fragt sie **nacheinander**: Fenster mit
  Schließübernahme kommen nach vorn und bekommen `close-requested` (das Frontend fragt wie beim Schließknopf), andere
  werden zerstört; `Destroyed` des aktuellen Fensters ruft das nächste; leer → `app.exit(0)` (macOS-Ausnahme
  `code: None` aus 003 E10 greift dann nicht). „Cancel“ (oder ein Fenster, das gerade beschäftigt ist) ruft
  `cancel_quit` – die App bleibt offen, die übrigen Fenster bleiben unberührt.
- **E14 `keymap.json`** im App-Config-Ordner (`ai-core::keymap_file`, aus editlicious, ≤ 64 KiB, kaputt → `.bad` +
  Hinweis, ungültige Ids/Texte verworfen), `load_keymap_overrides` beim Start; das Frontend normalisiert und meldet
  unbekannte Aktionen/Kürzel in der Konsole (eine Stelle für die Syntax, editlicious Review 008 #9).
- **E15 Serialisierbare Commands (KI-Regel, Retrofit 003):** jeder Command hat `toJSON(): CommandJson` (reines
  JSON, `NodeRef`s, Zahlen, Markup-Texte; `label` nur wenn abweichend), `commands/command-json.ts` definiert
  `CommandJson` als Union aller `{ type, … }`, `commands/registry.ts` die Registry `type → parse(json)`;
  `commandFromJson(json: unknown)` prüft feindliche Eingaben (Typen, Ids `n<k>`, ganze Zahlen, Attributnamen,
  Markup ≤ 16 MiB, Composite-Tiefe ≤ 8 und ≤ 10 000 Commands, bekannte Labels) und wirft `CommandError`.
  `DocumentStore.runCommand(json)` = `execute(commandFromJson(json))`, die Aktion `edit.runCommand` ruft es auf.
  Umbauten: `AddAsset(name, markup)` parst/bereinigt beim ersten `do` (wie `InsertNode`), der Import übergibt die
  Serialisierung nach Bereinigen und Stil-Auflösung; `SetIconJsonValue` ohne `value` = entfernen (statt
  `undefined`); `merge()` aktualisiert die Argumente (`value`), damit eine Geste nach `commit` als **ein**
  serialisierter Command dasteht. Test: jeder registrierte Typ hat einen Fall, JSON hin und zurück ergibt auf einem
  gleichen Dokument dieselbe Momentaufnahme (inklusive IDs), Undo stellt sie wieder her.
- **E16 Provisorisches entfernt:** `provisional-shortcuts.ts` (+ Test), die Zoom-Registrierung und der
  Space-Listener des Canvas; `RecentMenu` (Toolbar-Menü 003) entfällt zugunsten von „Open Recent ›“; `platformHint`
  und die `*Hint`-Texte entfallen (Tooltips zeigen `ActionService.shortcut(id)`).
- **E17 Wo die Handler wohnen:** `features/files/file-actions.ts` (file.*, edit.undo/redo, app.quit),
  `features/canvas/canvas-actions.ts` (view.* des Canvas, `canvas.panHold`, `view.zoomTo`; registriert von
  `CanvasView` mit dessen `DestroyRef`), `features/menus/app-actions.ts` (app.palette/shortcuts/about/focusMenu,
  Panels, edit.runCommand). `app.ts` ruft nur `install`/`start` auf.
- **E18 Browser-Modus/Test-Hook:** `FakeMenuApi` (merkt die letzte Spec, spielt Klicks), `FakeWindowApi.quit`;
  Hook bekommt `run(id, args?)`, `runCommand(json)`, `actions()` (= `describe()`), `menuSpec()`.
- **E19 Neue Fehlercodes:** `invalid_menu` (Rust `error.rs`, `fs-error.ts`, `describeFsError`).

## Verträge

### Rust

```rust
// ai-core::menu_spec (rein, aus editlicious app_menu.rs)
pub enum MenuItemSpec { Action { id, label, accelerator: Option<String>, enabled, checked: Option<bool> },
                        Separator, Submenu { label, items } }
pub struct TopMenu { label, items }   pub struct MenuSpec { menus: Vec<TopMenu> }
pub fn valid_id(id: &str) -> bool;    pub fn validate(spec: &MenuSpec) -> Result<(), FsError>;
pub fn accelerator(chord: &str) -> Option<String>;   pub fn split_chord(c) -> Option<(Vec<&str>, &str)>;
pub enum Predefined { Cut, Copy, Paste, SelectAll }  pub fn predefined(id: &str) -> Option<Predefined>;
pub fn without_window(spec: &MenuSpec) -> MenuSpec;  pub fn works_without_window(id: &str) -> bool;
pub enum NoWindow { OpenWindow, OpenWindowThen(String), Ignore }  pub fn no_window_action(id) -> NoWindow;
// ai-core::keymap_file
pub fn load(config_dir: &Path) -> KeymapOverrides { bindings: BTreeMap<String, Vec<String>>, warning }
// app: windows.rs
pub struct QuitQueue;  begin(labels) -> bool, current(), advance(closed) -> QuitStep, cancel(), active()
pub enum QuitStep { Ask(String), Exit, Wait }
// app: app_menu.rs – MenuSpecs je Label, apply (macOS), route(app, id), on_focus/on_destroyed
```

| Command | Signatur |
|---|---|
| `set_app_menu` | `(spec: MenuSpec) -> ()` – geprüft, je Fenster gemerkt, auf macOS gesetzt, wenn das Fenster vorn ist |
| `load_keymap_overrides` | `() -> KeymapOverrides { bindings, warning }` |
| `quit_app` | `() -> ()` – startet die Quit-Folge (E13) |
| `cancel_quit` | `() -> ()` – bricht sie ab (Cancel im fragenden Fenster) |
| `window_start_action` | `() -> string \| null` – einmalig, Aktion eines ohne Fenster gewählten Menüeintrags |

Ereignis `menu-action { id }` an das fokussierte Fenster.

### Frontend

```ts
// core/actions
type ActionContext = 'global' | 'canvas' | 'hierarchy' | 'dialog';
interface ActionDef { id; label; context; group; palette?; repeat?; hold?; nativeInText?; args?: ArgsSpec }
interface ActionHandler { run(args?): void; enabled?(): boolean; checked?(): boolean | undefined;
                          label?(): string; release?(): void }
class ActionService { register(id, h, destroyRef?); registerAll(map, destroyRef?); run(id, args?): boolean;
  available/enabled/checked/label/chords/shortcut(id); describe(): ActionInfo[]; loadOverrides() }
class KeyboardDispatcher { attach(doc); setContextProvider(fn); handle(e); keyup(e) }
checkArgs(spec, args): boolean            // action-args.ts
// core/menu/menu-api.ts
abstract class MenuApi { setAppMenu(spec); onAction(fn) }   abstract class KeymapApi { loadOverrides() }
// core/window: WindowApi += quit(), cancelQuit(), startAction()
// features/menus: buildMenuModel(os, { recent }), resolveMenu, toSpec, menuChord, isRadio, MenuService,
//   MenuBar, CommandPalette (matches), ShortcutsDialog, ViewOptionsMenu
// features/document/commands: CommandJson, toJSON(), COMMAND_TYPES, commandFromJson(json),
//   DocumentStore.runCommand(json)
```

## Tests

- Vitest: `shortcut` (Chords je OS, Normalisieren, Anzeige), `keymap` (gültig, keine Konflikte je Kontext, keine
  Umbelegung durch OS-Dateien, Overrides), `action-args` (Schema), `ActionService` (Stapel, DestroyRef, enabled,
  Label, Argumente, describe), `KeyboardDispatcher` (Kontexte, ruht in Textfeldern/Dialogen, `nativeInText`,
  deaktiviert fällt durch, Halte-Aktion, Alt allein), `menu-model` (alle Aktionen des Modells im Katalog mit Text,
  macOS ohne About/Quit, Recent, Accelerator nur mit Modifier/F-Taste, Spec ohne `shortcut`, Labels bereinigt),
  `CommandPalette.matches`, Palette/Kürzel-Dialog/Menüleiste/View Options als Komponenten, Commands: JSON-Roundtrip
  jedes registrierten Typs + feindliche Eingaben, `FilesService` mit Quit/Cancel.
- `scripts/keymaps.test.mjs`: keine doppelten Schlüssel in den Keymap-Dateien (Rohtext).
- Rust: `menu_spec` (Spec-Validierung mit feindlichen Eingaben, Accelerator-Umsetzung, `without_window`,
  `no_window_action`, `predefined`), `keymap_file`, `QuitQueue`, `command_rules`.
- Playwright: ⌘1/⌘2/⌘3 (Ctrl im Container) blenden Panels, Palette filtert und führt eine Aktion aus, Menüleiste
  per Tastatur (F10, ↓, Enter), Kürzel-Dialog, View Options, Zoom-Kürzel und Space-Pan über Aktionen; die Tests aus
  003/004 gehen über das Menü statt über Toolbar-Knöpfe.

## Fragen an Marc

1. **Natives Menü auf dem Mac prüfen** (unter Xvfb nicht prüfbar): Menüs File/Edit/View/Add/Arrange/Help mit
   Kürzeln, Häkchen, „Undo <Aktion>“, deaktivierte Zukunfts-Einträge; Fensterwechsel zeigt das Menü des vorderen
   Fensters; ohne Fenster öffnet „Open…“ ein Fenster mit dem Öffnen-Dialog.
2. **⌘C/⌘V in Textfeldern** (Palette, Kürzel-Filter) auf dem Mac – über die vordefinierten Einträge (E7)?
3. **Quit (⌘Q)** mit zwei geänderten Dokumenten: fragt nacheinander, Cancel bricht ab? Und: Beenden über das
   Dock-Menü – geht das am Frontend vorbei (tao meldet es eventuell nicht als `ExitRequested`)?
4. Neue Kürzel (E2): ⇧⌘↑/⇧⌘↓ für Bring to Front / Send to Back, ⌘/ für die Kürzel-Übersicht, Esc = Deselect – ok?
5. Menüleiste unter Windows/Linux immer sichtbar (E8) statt wie editlicious versteckt – ok? (015 macht es
   einstellbar.)
6. „Settings…“ fehlt im macOS-App-Menü bis 015 (keine Einstellungen vorhanden).

## Fortschritt

- [x] Design
- [x] Commands serialisierbar (Retrofit 003): `toJSON` je Command, `CommandJson`, Registry `commandFromJson` mit
  Prüfung feindlicher Eingaben, `DocumentStore.runCommand`/`lastCommandJson`, `AddAsset` mit Markup,
  Gesten-Ergebnis als ein Command; Roundtrip-Test für jeden registrierten Typ (`registry.spec.ts`)
- [x] Rust: `ai-core::menu_spec` (aus editlicious + Vordefinierte, Menü ohne Fenster), `ai-core::keymap_file`,
  `app_menu.rs` (Spec je Fenster, Fokus, Routing), `QuitQueue` + Startaktion in `windows.rs`, 5 neue Commands,
  Fehlercode `invalid_menu`
- [x] Frontend: Aktionskatalog (≈ 90 Aktionen), Keymaps, `ActionService` (Argumente, `describe`), Dispatcher
  (Halte-Aktionen, `nativeInText`), Menümodell, `MenuService`, HTML-Menüleiste, Palette, Kürzel-Dialog,
  View-Options-Menü, `LayoutStore`, Quit; `provisional-shortcuts.ts`, `RecentMenu`, Zoom-/Space-Listener entfernt
- [x] Playwright: 5 neue Tests (`e2e/actions.spec.ts`), die Tests aus 003/004 gehen über Menü und Aktionen (35)
- [x] Echte App unter Xvfb (WebKitGTK): Menüleiste, File-Menü per F10/↓ mit Kürzeln und „Open Recent“, Import über
  das Menü (nativer Dialog), **Quit (Ctrl+Q)** mit geändertem Dokument fragt, Cancel lässt die App offen; mit zwei
  Fenstern schließt Quit das unveränderte sofort, fragt im geänderten, „Don’t Save“ beendet die App
- [x] CI: E2E-Job mit Browser-Cache, Systembibliotheken nur bei Bedarf (Ubuntu-Archiv, Retries, Schritt-Limits),
  `ubuntu-24.04` fest, Testergebnisse als Artefakt bei Fehlern
- [x] Doku, `pnpm check` + `pnpm e2e` grün

## Abweichungen und Grenzen

- **Kein Hierarchie-/Dialog-Kürzel** in 005: die Kontexte `hierarchy` und `dialog` sind da und leer; 006/007
  belegen Pfeile, Tab usw.
- **Deaktiviert bis zu ihrem Prompt:** Export (012), Cut/Copy/Paste/Duplicate/Delete/Select All/Deselect (006/007),
  Add (008/013), Arrange (006), Settings (015). Snap to Grid / Magic Snap schalten nur den Zustand (wirken ab 007).
- **Debug-Build unter Linux:** Ctrl+Shift+I öffnet den WebKit-Inspector (Devtools sind nur im Debug-Build an), statt
  „Import SVG…“ – im Release-Build gibt es keinen Inspector. Im Xvfb-Test lief Import über das Menü.
- **⌘Z in Textfeldern** macht auf macOS das Dokument-Undo (das native Menü fängt ⌘Z), Windows/Linux lassen es dem
  Feld (E7).
- **Menüleiste** zeigt Untermenüs als beschriftete Gruppen (aus editlicious), keine aufklappenden Untermenüs.
- **macOS-Code** (`apply`, vordefinierte Einträge, Menü ohne Fenster) kompiliert im Container nur als Linux-Code
  mit; die CI prüft ihn auf `macos-latest` (clippy). Sichtprüfung siehe „Fragen an Marc“.
