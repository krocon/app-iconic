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
  app/core/icon-file/         IconFileApi (open/save/new/close .icon, read SVG, Dialoge), DTOs, findAsset (002)
  app/core/window/            WindowApi (Titel, Fenster, Schließen-Frage, 003)
  app/core/recent/            RecentFilesApi („Open Recent“, 003)
  app/backend-providers.ts    Bindung der Fassaden; Dev-Build: backend-providers.dev.ts (Fakes im Browser, 003 E14)
  app/features/document/      IconDocument, DocumentStore, UndoService (undo/), Commands (commands/),
                              model/ (icon-json, unique-names), svg/ (node-ids, sanitize-svg, resolve-styles) (003)
  app/features/files/         FilesService (Neu/Öffnen/Import/Speichern/Schließen/Fenster), Recent, provisorische
                              Kürzel (bis 005), Texte (003)
  app/features/hierarchy/     HierarchyList (Platzhalter bis 006: Gruppen/Layer/Assets)
  app/features/shell/         SidePanel, Texte der Fensterhülle
  app/features/canvas/        CanvasView (Toolbar, Lineale, Zeichenfläche, Statuszeile), CanvasViewStore (Zoom/Pan/
                              Optionen je Fenster), LayerStack (lebende Assets je Shadow Root), fill-preview,
                              icon-color, asset-placement (004)
  app/features/about/         About-Dialog
  app/shared/geometry/        Geometrie: icon-guides, view-transform, zoom-steps, ruler-ticks, squircle (rein);
                              dom-geometry (clientToDocument, nodeToDocument über Screen-CTMs, 004)
  app/shared/dialog/          Modal (Fokusfalle, Esc), DialogService (aus files-and-folders)
  app/shared/ask/             AskService + AskDialog (Fragen als Promise, aus editlicious)
  testing/                    Fakes – nie im Produktivcode importieren (Fake*Api, providers.ts, documents.ts,
                              browser-hook.ts = `window.__appIconic` für Playwright)
  testing/fixtures/           generiert aus testdata/ (camscanner.icon, svg/, unique-names.json; `pnpm fixtures`)
e2e/                          Playwright-Tests gegen den Dev-Server
public/                       icon.svg (App-Icon), favicon.png
src-tauri/                    Rust (Tauri 2), Crate `app-iconic`, Lib `ai_lib`
  src/lib.rs                  Modulübersicht, Builder (dialog, window-state), Commands
  src/commands.rs             dünne Command-Schicht, Test command_rules
  src/sessions.rs             IconSessions: zuletzt geöffnete/gespeicherte .icon je Pfad (002 E5)
  src/windows.rs              DocWindows: Labels doc-<n>, Startpfade, Pfad je Fenster, Schließen-Übernahme (003)
  src/about.rs, model.rs      AppInfo, DTOs (serde camelCase)
  core/                       Crate `ai-core` (Workspace-Mitglied): Engine ohne Tauri
    src/error.rs              FsError { code, message, path }
    src/fs_atomic.rs, config_file.rs  atomar schreiben / Konfig laden (aus files-and-folders)
    src/icon/                 .icon: model (Sicht), json_format, names, bundle, zip_io, save, svg_file (002)
    src/recent.rs             recent.json (zuletzt benutzt, max. 10, 003)
  icons/source/app-icon.svg   Quelle des App-Icons
testdata/fixtures/            SVGs und camscanner.icon aus der Vorlage (unverändert)
testdata/unique-names.json    Tabelle der eindeutigen Asset-/Layer-Namen (Rust `names.rs` und TS `unique-names.ts`)
scripts/                      fixtures.mjs (TS-Fixture-Module erzeugen/prüfen) + node:test
docs/                         architecture.md (Entscheidungen, Commands, Abhängigkeiten), legacy-analysis.md, legacy/,
                              FEATURES.md (Checkliste)
prompts/                      Feature-Prompts (Index README.md), done/
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
- **Texte** nur aus Katalogen (`*-texts.ts`, Englisch = Quelle; Deutsch + Umschalten ab Prompt 015).
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
- Symbole: **keine SF Symbols** (Lizenz verbietet App-Icons); freies Icon-Set mit Lizenz im About-Dialog (Prompt 013).

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
