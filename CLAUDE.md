# CLAUDE.md – AppIconic (Tauri)

> Leitfaden für Claude (und Menschen) zur Arbeit an **AppIconic**: einem Desktop-Editor für App-Icons im
> Apple-Format `.icon` (Icon Composer) – Gruppen und Ebenen aus SVG, Hintergrund-Fill, Schatten, Transluzenz,
> Export nach SVG und PNG – für macOS, Windows und Linux.
> Autor: Marc Kronberg · Repo: https://github.com/krocon/app-iconic · MIT
>
> Neuauflage der unfertigen SwiftUI/AppKit-App **AppIconic** (`~/WebstormProjects/AppIconic/AppIconic`, fachliche
> Vorlage, `docs/legacy-analysis.md`) als Tauri 2 + Angular 22 (zoneless, Signals) + Rust. Architektur wie
> **editlicious**, **comic-commander-tauri** und **files-and-folders-tauri** (gleicher Autor, MIT, öffentlich auf GitHub).

---

## 1. Stand

- Offene Fragen an Marc: `docs/open-questions.md`.
- Auftrag: `prompts/000-init.md` (ursprünglicher Prompt, überarbeitet); Regeln: `prompts/000-arbeitsweise.md`;
  Prompt-Liste und Status: `prompts/README.md`. Feature-Checkliste (Parität = Definition of Done): `docs/FEATURES.md`.
- Erledigte Prompts samt Design-Dokument liegen in `prompts/done/`; Kürzel wie „002 E4“ in Code und Doku verweisen
  auf Entscheidungen dort bzw. in `docs/architecture.md`.

## 2. Befehle (Root, pnpm 10 via `packageManager`, Node ≥ 22.22.3, Rust stable ≥ 1.93)

| Zweck | Befehl |
|---|---|
| Install | `pnpm install` |
| App starten (Dev) | `pnpm tauri dev` (Angular-Dev-Server auf **Port 1450** + Fenster) |
| Nur Frontend im Browser | `pnpm start` (Fakes mit `camscanner.icon` im Speicher, Test-Hook `window.__appIconic`) |
| Frontend-Tests | `pnpm test` (Vitest + jsdom über `ng test`), `pnpm test:watch` |
| E2E (Browser) | `pnpm e2e` (Playwright gegen den Dev-Server); einmalig `pnpm e2e:install` |
| Lint / Format | `pnpm lint`, `pnpm format`, `pnpm format:check` |
| Frontend-Build | `pnpm build` |
| KI-Sidecar | `pnpm mcp:sidecar:dev` (Debug neben der Debug-App), Doku `docs/mcp.md` |
| Rust | `pnpm rust:fmt`, `pnpm rust:lint` (clippy `-D warnings`), `pnpm rust:test` (ganzer Workspace inkl. `ai-core`) |
| Fixture-Module | `pnpm fixtures` (neu erzeugen), `pnpm fixtures:check`, `pnpm scripts:test` |
| Alles prüfen | `pnpm check` (+ `pnpm e2e`) |
| Debug-App ohne Bundle | `pnpm tauri build --debug --no-bundle` → `src-tauri/target/debug/app-iconic` |
| Icons neu erzeugen | `pnpm tauri icon src-tauri/icons/source/app-icon.svg -o src-tauri/icons` (danach `android/`, `ios/` löschen; `public/icon.svg` = Quelle, `public/favicon.png` = `32x32.png`) |

## 3. Layout

```
src/                          Angular 22 (zoneless, Signals, OnPush, Standalone)
  styles.css                  Design-Tokens light/dark (einzige Stelle für Farben/Größen), Canvas-Tokens --ai-*
  app/app.ts, app.config.ts   Root (Toolbar, Seitenleisten, Canvas, Dialog) + Fassaden-Bindung
  app/core/backend/call.ts    einzige Stelle mit invoke() (+ isTauri-Prüfung, Fehler → FsError)
  app/core/errors/            FsError, toFsError, describeFsError (Codes = Rust ai-core error.rs)
  app/core/about/             AppInfo, AboutApi
  app/core/icon-file/         IconFileApi (open/save/new/close .icon, read SVG/Bild, Dialoge), DTOs, findAsset (002, 008)
  app/core/window/            WindowApi (Titel, Fenster, Schließen-Frage, 003)
  app/core/recent/            RecentFilesApi („Open Recent“, 003)
  app/core/actions/           Aktionskatalog (+ action-catalog.de.ts: deutsche Namen, 015), Keymaps
                              (base/mac/other.json), ActionService (run(id, args?)),
                              KeyboardDispatcher (einziger keydown-Listener), shortcut, action-args (005),
                              add-action-args (Schema der Add-Argumente, 008), export-action-args (012),
                              tool-action-args (Freehand/Text to Path/Symbol, 013), clip-action-args (014)
  app/core/menu/              MenuApi (natives Menü, menu-action), KeymapApi (keymap.json), MenuSpec (005)
  app/core/clipboard/         ClipboardApi (Text der System-Zwischenablage über navigator.clipboard, 006)
  app/core/export/            ExportApi (Ordner-Dialog, export_svg, export_png mit Channel, cancel), DTOs (012)
  app/core/fonts/             FontApi (list_fonts, text_to_path), DTOs + Grenzen (013)
  app/core/i18n/              translatable() (tiefer Proxy), phrasebook(), Sprach-Signal, systemLanguage,
                              catalogs.spec (Vollständigkeit aller Kataloge + Aktionsnamen, 015)
  app/core/mcp/               McpApi (mcp_info/ready/reply/disconnect, Ereignisse mcp-call/mcp-status), DTOs (018)
  app/core/settings/          SettingsApi (load/save(patch)/reset, settings-changed, Fenster-Theme), DTOs,
                              settings-rules (TS-Spiegel von Rust merge/sanitize, SETTING_KEYS), theme (015)
  app/backend-providers.ts    Bindung der Fassaden; Dev-Build: backend-providers.dev.ts (Fakes im Browser, 003 E14)
  app/features/document/      IconDocument, DocumentStore (runCommand), UndoService (undo/), Commands (commands/:
                              serialisierbar, command-json.ts + registry.ts commandFromJson, 005; tree-commands:
                              ReorderNode/GroupNodes/Ungroup, 006; set-attributes: Ergebnis einer Geste, 007),
                              model/ (icon-json, unique-names, selection, reorder-rules, specializations 010),
                              svg/ (node-ids, sanitize-svg, resolve-styles, svg-references, style-props,
                              svg-format 011) (003–011); commands/replace-node (011); model/clip-model +
                              clip-units, commands/clip-commands (014)
  app/features/files/         FilesService (Neu/Öffnen/Import/Speichern/Schließen/Fenster/Quit), Recent,
                              file-actions (Aktionen der Datei-Funktionen), Texte (003, 005)
  app/features/menus/         Menümodell (rein), MenuService (nativ/HTML), MenuBar (Windows/Linux), Befehlspalette,
                              Kürzel-Dialog, app-actions (005)
  app/features/hierarchy/     Ebenenbaum (006): hierarchy-model (Baum rein aus dem Dokument), HierarchyTree (APG
                              Tree, virtualisiert), tree-navigation/-selection/-drag, context-menu, swatch,
                              node-label, tree-icons; EditService + edit-actions (Cut/Copy/Paste/Duplicate/
                              Delete/Sichtbarkeit/Arrange/Align), edit-/arrange-operations, paste, align, visibility,
                              follow-up (Folge-Auswahl)
  app/features/commands/      „Add“ (008): CommandSidebar (Liste + Suche), AddService, add-actions, insert-target
                              (Einfügeort, rein), insert-center (Zentrum über inverse CTM), element-defaults
                              (Legacy-Defaults, rein), add-args, icon-group, svg-snippet (+ Dialog), image-size
  app/features/properties/    Properties-Panel (009): property-spec (rein: Specs je Node-Typ), property-values (lesen:
                              style/Attribut/berechnet/Default), property-edit (setAttributes/setText, PropertySession
                              = Geste je Feld, Reset), panel-model, mixed, constrain, transform-list (rein) +
                              transform-editor/-step-row, PropertiesService + properties-actions (properties.*)
  app/features/inspector/     Icon-Inspector (010) im Properties-Panel: icon-fields (rein: Feld-Specs je Root/Gruppe/
                              Layer), fill-model, icon-color-text, platforms, icon-json-text (rein), inspector-edit
                              (Felder → SetIconJsonValue, Umbenennen), IconInspectorService + icon-actions (icon.*),
                              Komponenten icon-inspector, inspector-section/-row, variant-tools, fill-editor,
                              icon-color-field, json-preview
  app/features/svg-source/    „Edit SVG…“ + „Optimize Path…“ (011): SvgSourceService (Ziel, Apply, Auswahl,
                              Optimizer-Command), svg-source-check (rein: DOMParser-Fehlerposition), selection-map
                              (rein), SvgSourceDialog (+ code-editor: CodeMirror 6, nur lazy), OptimizePathDialog,
                              svg-source-actions (edit.editSvg, path.optimize), Texte
  app/features/export/        Export (012): export-svg (Export-SVG aus stackOf/fillPreview, ID-Präfixe), export-options
                              (rein: Wahl, Argumente der KI, Dateiname), ExportService (Wahl der Sitzung, Fortschritt,
                              Abbruch, Hinweise), ExportDialog, export-actions (file.exportSvg/Png), Texte
  app/features/tools/         Werkzeuge (013): FreehandStore (Werkzeug-Modus, Abtastung, Esc), FreehandService
                              (Einfügen, `points` der KI), freehand-overlay (Vorschau in Viewport-Pixeln),
                              freehand-options (Werkzeugleiste), text-path (rein: Schrift auflösen, zentrieren),
                              TextPathService + TextPathDialog, tools-actions, Texte
  app/features/symbols/       Symbole (013): symbol-provider (Plugin-Schnittstelle), symbol-providers (Registry),
                              lucide-provider (Daten lazy aus lucide-static), symbol-search, symbol-grid (rein),
                              SymbolService (placeSymbol, Einfügen), SymbolPickerDialog
  app/features/shell/         SidePanel, LayoutStore (Seitenleisten ⌘1/⌘2/⌘3, Breiten), Splitter (APG Window
                              Splitter) + panel-width (rein), Texte der Fensterhülle (015)
  app/features/settings/      Einstellungen (015): SettingsStore (sofort anwenden, gebündelt speichern, andere
                              Fenster), SettingsSync (Stores ↔ Einstellungen, Theme, Sprache, Undo-Log),
                              SettingsDialog (⌘,, Tabs) + settings-view, settings-actions (app.settings,
                              settings.set/reset), Texte
  app/features/mcp/           KI-Steuerung (018): McpStore (mcp-call → ausführen → mcp_reply, Status, mcp.disconnect),
                              McpTools (Tools im Fenster: Revision, Undo-Gruppe, Rückfrage), mcp-read (rein: Dokument,
                              Baum, Node + BBox, Asset-SVG), mcp-policy (Sperrliste), Texte
  app/features/about/         About-Dialog + Texte
  app/features/canvas/        CanvasView (Toolbar, Lineale, Zeichenfläche, Statuszeile), CanvasViewStore (Zoom/Pan/
                              Optionen je Fenster), LayerStack (lebende Assets je Shadow Root), fill-preview,
                              icon-color, asset-placement (004), effects (Vorschau-Annäherung, 010),
                              canvas-actions, View-Options-Menü (005);
                              Auswahl/Handles (007): CanvasEditStore (Kontext, Punkt, Rahmen, Snap), canvas-pointer
                              (Klick/Rahmen/Ziehen), canvas-gesture (Geste je Ziehen), hit-test, selection-measure
                              (Rahmen + Handle-Sets über CTM), selection-overlay, magic-points, edit-ops (rein),
                              canvas-edit-actions (Esc, Punkt löschen, Pfeiltasten, moveBy); handles/ (rein:
                              node-geometry, node-handles, handle-edit, handle-types)
                              grid-hint-overlay (Rasterpunkte um den Zeiger bei Snap to Grid)
  app/features/clip/          Clip Paths (014): ClipEditStore (Bearbeitungsmodus), ClipEditLayer (Formen in der
                              Host-<svg>), ClipService + clip-actions (clip.*), clip-panel-model (rein),
                              ClipPathSection (Properties), clip-references (Copy/Duplicate/Delete), Texte
  app/shared/geometry/        Geometrie: icon-guides, view-transform, zoom-steps, ruler-ticks, squircle, align (rein);
                              dom-geometry (clientToDocument, nodeToDocument über Screen-CTMs, 004); 007 (rein):
                              matrix, snapping, bounds-guard, box-math, box-selection, transform-text,
                              path-data (Tokenizer für `d`), path-edit; 011 (rein): path-write (runden, Form
                              behalten / kürzeste Form), path-optimize (RDP mit Eckenschutz); 013 (rein): freehand
                              (RDP + Catmull-Rom), shape-path (Grundformen → `d`), path-translate; 014:
                              clip-geometry (Clip-Raum → Dokument über den Owner, Treffer durch Clips)
                              grid-hint (rein: Rasterpunkte um den Zeiger)
  app/shared/controls/        Generische Editoren (009): DraftField (Basis: live/commit/cancel), NumberField (Stepped
                              Slider), ColorField + color-value (rein), SelectField, TextField, ToggleField, step-value
  app/shared/dialog/          Modal (Fokusfalle, Esc), DialogService (aus files-and-folders)
  app/shared/ask/             AskService + AskDialog (Fragen als Promise, aus editlicious)
  testing/                    Fakes – nie im Produktivcode importieren (Fake*Api, providers.ts, documents.ts,
                              command-cases.ts, tree-documents.ts, fake-clipboard-api.ts, fake-export-api.ts,
                              fake-font-api.ts (Kästchen-Schrift, gleiche Fehlercodes), fake-settings-api.ts
                              (Regeln wie Rust, im Browser-Modus in localStorage),
                              browser-hook.ts = `window.__appIconic` für Playwright)
  testing/fixtures/           generiert aus testdata/ (camscanner.icon, all-fields.icon, svg/, unique-names.json;
                              `pnpm fixtures`)
e2e/                          Playwright-Tests gegen den Dev-Server
public/                       icon.svg (App-Icon), favicon.png
src-tauri/                    Rust (Tauri 2), Crate `app-iconic`, Lib `ai_lib`
  src/lib.rs                  Modulübersicht, Builder (dialog, window-state), Commands
  src/commands.rs             dünne Command-Schicht, Test command_rules
  src/sessions.rs             IconSessions: zuletzt geöffnete/gespeicherte .icon je Pfad (002 E5)
  src/windows.rs              DocWindows: Labels doc-<n>, Startpfade/-aktionen, Pfad je Fenster, Schließen-Übernahme
                              (003), QuitQueue (005)
  src/app_menu.rs             natives macOS-Menü: Spec je Fenster, fokussiertes zeigt seins, Klicks routen (005)
  src/export_commands.rs      Export-Commands (pick_export_dir, export_svg, export_png, cancel_export), ExportJobs (012)
  src/font_commands.rs        list_fonts, text_to_path, Vorladen der Schriften beim Start (013)
  src/settings_commands.rs    load_settings, save_settings(patch), reset_settings, set_window_theme; SettingsState,
                              Ereignis settings-changed an alle Fenster (015)
  src/mcp.rs                  KI-Router (018, rein über WindowHost): Argumente prüfen/begrenzen, Zielfenster, Calls
  src/mcp_commands.rs         Brücke an/aus nach settings.mcp, TauriHost (mcp-call → mcp_reply), mcp_* Commands (018)
  src/about.rs, model.rs      AppInfo, DTOs (serde camelCase)
  core/                       Crate `ai-core` (Workspace-Mitglied): Engine ohne Tauri
    src/error.rs              FsError { code, message, path }
    src/fs_atomic.rs, config_file.rs  atomar schreiben / Konfig laden (aus files-and-folders)
    src/icon/                 .icon: model (Sicht), json_format, names, bundle, zip_io, save, svg_file (002),
                              image_file (Bild als Data-URL, Magic Bytes, Größe aus dem Kopf, 008)
    src/recent.rs             recent.json (zuletzt benutzt, max. 10, 003)
    src/menu_spec.rs          MenuSpec prüfen, Accelerators, Menü ohne Fenster (005)
    src/keymap_file.rs        keymap.json laden (005)
    src/settings.rs           settings.json: je Feld nachsichtig (merge), sanitize, migrate, apply_patch (015)
    src/export/               Export (012): png (resvg, sichere usvg-Optionen), files (Namen, Überschreiben, atomar,
                              Fortschritt, Abbruch); `export::fonts` = Re-Export von `fonts::system`
    src/fonts/                Schriften (012, 013): system (fontdb einmal je Prozess, generische Familien), FontCatalog
                              (Familien/Stile/Ids), outline (Text → Pfad: harfrust-Shaping, skrifa-Umrisse, BBox)
  mcp/                        Crate `ai-mcp` + Binary `app-iconic-mcp` (018, aus editlicious ed-mcp): server (MCP über
                              stdio), tools (Schemas, Schnappschuss tools.snapshot.json), bridge, client, host
  tauri.sidecar.conf.json     bundle.externalBin für das Sidecar (nur Release, 030)
  icons/source/app-icon.svg   Quelle des App-Icons
testdata/fixtures/            SVGs und camscanner.icon aus der Vorlage (unverändert); all-fields.icon (010: alle
                              belegten Felder + unbekannte)
testdata/fonts/               Caladea-Regular.ttf + OFL.txt (Testschrift für Rust-Tests, nicht im Bundle, 013)
testdata/unique-names.json    Tabelle der eindeutigen Asset-/Layer-Namen (Rust `names.rs` und TS `unique-names.ts`)
testdata/settings-cases.json  Standardwerte + Fälle von settings.json (Rust `settings.rs` und TS `settings-rules`, 015)
scripts/                      fixtures.mjs (TS-Fixture-Module erzeugen/prüfen) + node:test, keymaps.test.mjs,
                              theme-contrast.test.mjs (Tokens light/dark, Kontraste, 015); mcp-sidecar.mjs (+ Test,
                              Sidecar bauen), mcp-e2e.mjs (Sidecar gegen die laufende App, 018)
docs/                         architecture.md (Entscheidungen, Commands, Abhängigkeiten), legacy-analysis.md, legacy/,
                              FEATURES.md (Checkliste), mcp.md (KI-Steuerung: Einrichtung, Tools, Sicherheit)
prompts/                      Feature-Prompts (Index README.md), done/
THIRD-PARTY-NOTICES.txt       Lizenzen fremder Werke (Lucide/Feather, Testschrift)
```

## 4. Architekturregeln (verbindlich)

- **Der Browser ist die Grafik-Engine** (001 E3): Das Dokument ist SVG-DOM. Rendern, Parsen (`DOMParser`), Geometrie
  (`getBBox`, `getCTM`, `getScreenCTM`, `DOMMatrix`) übernimmt der Browser. **Kein eigener XML-/SVG-/CSS-Parser,
  kein eigener Renderer, keine eigene Transform-Kette.** Rust: Dateisystem, Bundle/ZIP, `icon.json`, PNG-Export,
  Schriften.
- **Single Source of Truth**: Dokument = `icon.json`-Modell + je Asset ein SVG-Dokument. Mutationen nur über
  benannte Commands im `DocumentStore` (Undo/Redo, Gesten-Coalescing). Das Canvas rendert daraus.
- **Kein God-Object**: Services mit klarer Verantwortung, max. ~400 Zeilen je Datei (die Vorlage hatte ein
  `AppModel` mit 3 200 Zeilen).
- **Stabile Node-IDs**: jede Node trägt intern `data-ai-id`; beim Speichern/Export wird es entfernt.
- **Verlustfreier Roundtrip**: unbekannte Felder in `icon.json` und unbekannte SVG-Attribute/-Elemente bleiben
  erhalten. Beim `.icon`-Format konservativ sein – nachfragen statt raten.
- **Frontend ruft das Backend nur über typisierte Fassaden** (`AboutApi`, `IconFileApi` …, in `app/core/`);
  `invoke()` steht nur in `core/backend/call.ts`. Tests und der Browser-Modus ersetzen die Fassade.
- **DTO-Vertrag**: Rust `model.rs` ↔ TS `*.models.ts` von Hand synchron; jede Änderung auf beiden Seiten + Test.
  Fehler immer als `FsError { code: snake_case, message, path }`; neue Codes in `error.rs`, `fs-error.ts` und
  `describeFsError()`. Im UI nie Rusts `message` zeigen.
- **Pfade sind opake Strings** aus dem Backend; kein Split/Join mit `/` oder `\` im Frontend.
- **Zustand**: Signals; Stores je Dokument/Ansicht ohne `providedIn: 'root'`; Globales in Root-Services. `OnPush`
  überall, kein zone.js. Veraltete Antworten verwerfen (Revision/Sequenz).
- **Commands nie synchron**: `async fn` + `spawn_blocking` (`command_rules`-Test). Logik in `ai-core` ohne Tauri,
  Command-Schicht dünn.
- **Speichern ist heilig**: atomar (Temp + rename; bei Bundles: neues Bundle daneben, dann tauschen), nie halb
  geschriebene Dateien.
- **Fremde Dateien sind feindlich**: SVG/ZIP mit Grenzen lesen (Größe, Einträge, Zip-Slip); SVG-Markup vor dem
  Einfügen in die WebView von Skripten/Event-Handlern/externen Referenzen befreien.
- **Sicherheit** (001 E4): keine Tauri-Plugins mit Dateisystem-, Shell-, Store- oder Clipboard-Rechten für die
  WebView; Dialoge nur über die Rust-API; CSP strikt (`style-src 'unsafe-inline'` wegen Angulars Laufzeit-Styles).
- **KI-fähig** (Marc, 26.10.2026; Prompt 018): jeder Dokument-Command ist serialisierbar (`{ type, …args }`, reines
  JSON mit NodeRefs, Registry `type → Factory`, `runCommand(json)`), jede Funktion eine Aktion mit Id und
  serialisierbaren Argumenten. Keine Logik, die nur über Maus/DOM-Ereignisse erreichbar ist.
- **Tastatur nur über Aktionen** (ab 005): jede Funktion ist eine Aktion im Aktionskatalog, Kürzel in Keymaps je OS,
  ein einziger globaler `keydown`-Listener (`KeyboardDispatcher`).
- **Neue Abhängigkeiten** (npm oder crates) nur mit kurzer Begründung in `docs/architecture.md`. Keine
  UI-Frameworks; Styling mit CSS (natives Nesting) + Tokens aus `src/styles.css` – kein SCSS.
- **Texte** nur aus Katalogen (`*-texts.ts` mit `translatable()`, Englisch = Quelle, Deutsch daneben; neue Aktionen
  bekommen einen Namen in `action-catalog.de.ts` – `catalogs.spec.ts` prüft beides).
- **Barrierefreiheit**: sichtbarer Fokus, alles per Tastatur, Dialoge mit `role="dialog"`/`aria-modal` und
  Fokusfalle, Kontraste in light und dark.

## 5. Tests & Verifikation

- **Rust**: Unit-Tests neben dem Code (`#[cfg(test)]`), Dateisystem mit `tempfile`; Fixtures unter
  `testdata/fixtures/` (aus der Vorlage `AppIconic/docs/`), Roundtrip-Tests für jedes Fixture.
- **Angular**: Vitest (`*.spec.ts` neben dem Code) für reine Logik, Stores, Komponenten mit Fakes.
- **Geometrie mit DOM** (CTM, BBox, Handles, Snapping bei Zoom 50/100/150 %, verschachtelte transformierte Gruppen):
  Playwright (`e2e/`), weil jsdom kein Layout kennt.
- **Ende-zu-Ende**: echte App starten und Akzeptanzkriterien durchspielen.
- Jeder Bugfix bekommt zuerst einen roten Test.

## 6. Git & Zusammenarbeit

- Commits direkt auf `main`, Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), nach jedem Prompt
  mit grünem `pnpm check`. Kein Force-Push, kein `git reset --hard`, keine Releases ohne ausdrückliche Anweisung.

## 7. Lizenzen & Referenzen

- Eigene Lizenz: **MIT**.
- **editlicious**, **comic-commander-tauri**, **files-and-folders-tauri** (MIT, gleicher Autor): Code darf übernommen
  werden – mit Herkunftsvermerk im Modulkopf und den zugehörigen Tests.
- Die Vorlage AppIconic (Swift) ist Marcs eigener Code: Algorithmen (Path-Fitting, Pfad-Optimierer, Snapping) dürfen
  nach TypeScript/Rust übertragen werden, mit Herkunftsvermerk.
- Symbole: **keine SF Symbols** (Lizenz verbietet App-Icons); Lucide (ISC, Teil MIT von Feather) mit Lizenz in
  `THIRD-PARTY-NOTICES.txt` und im About-Dialog (Prompt 013). Weitere Sets nur mit geprüfter Lizenz.

## 8. Arbeitsumgebung für Claude (Remote-Sitzung)

- Das Repo liegt auf Marcs Mac (`~/WebstormProjects/app-iconic`). Gebaut, getestet und gepusht wird in der
  **Cloud-Umgebung** (Klon über `add_repo` mit Schreibrecht).
- Die Vorlage liegt auf dem Mac (`~/WebstormProjects/AppIconic/AppIconic`) – per `device_bash` lesen (nur lesen).
  Die Schwesterprojekte sind öffentlich: `git clone --depth 1 https://github.com/krocon/editlicious`.
- Container einrichten: `apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev
  librsvg2-dev librsvg2-bin xdotool imagemagick xvfb`, `pnpm install`,
  `cd src-tauri && CARGO_INCREMENTAL=0 cargo build --workspace --tests`.
- Playwright im Container: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm e2e` (vorinstalliertes Chromium passt zu
  1.63; kein `playwright install`).
- Ende-zu-Ende: `pnpm tauri build --debug --no-bundle`, `Xvfb :99 &`, `DISPLAY=:99 src-tauri/target/debug/app-iconic &`,
  Screenshot `DISPLAY=:99 import -window root shot.png`; `GTK_THEME=Adwaita:dark` schaltet dunkel.
