# Architektur – AppIconic (Tauri)

Neuauflage der SwiftUI-App AppIconic (`~/WebstormProjects/AppIconic/AppIconic`, fachliche Vorlage,
[legacy-analysis.md](legacy-analysis.md)) als **Tauri 2 + Angular 22 (zoneless, Signals) + Rust**. Aufbau wie
**editlicious**, **comic-commander-tauri** und **files-and-folders-tauri** (gleicher Autor, MIT).

## Grundsatz

Der **Browser ist die Grafik-Engine**: Das Dokument ist SVG-DOM in der WebView. Rendering, Parsen (`DOMParser`),
Geometrie (`getBBox`, `getCTM`, `getScreenCTM`, `DOMMatrix`) und Hit-Testing übernimmt der Browser – kein eigener
SVG-/XML-/CSS-Parser, kein eigener Renderer (die größten Fehlerquellen der Vorlage). **Rust** übernimmt, was der
Browser nicht kann oder nicht darf: Dateisystem, `.icon`-Bundles und ZIP, verlustfreies `icon.json`, PNG-Export
(resvg), Systemschriften und Glyphen-Umrisse (fontdb + ttf-parser), Menü, Fenster, Einstellungen.

## Entscheidungen

| Nr. | Entscheidung | Begründung |
|---|---|---|
| 001 E1 | Versionen: Angular 22.2, TypeScript ~6.0, Tauri 2.12, Rust 2024 / ≥ 1.93, pnpm 10, Vitest 5, Playwright 1.63 | aktuelle stabile Linie der Schwesterprojekte (26.10.2026). TypeScript 7 und Tauri 3 (alpha) werden von Angular 22 bzw. dem Ökosystem noch nicht getragen. Playwright auf 1.63 gepinnt: passt zum vorinstallierten Chromium der Cloud-Umgebung |
| 001 E2 | Rust-Workspace: App-Crate `app-iconic` (Lib `ai_lib`, dünn: Commands, Menü, Fenster) + Engine-Crate `ai-core` (`src-tauri/core`) ohne Tauri | Engine testbar ohne GTK/WebKit (CI-Job „linux engine“ ohne apt), wie `ed-core` in editlicious |
| 001 E3 | SVG-DOM im Browser ist die Wahrheit für Geometrie; Transforms nur über `DOMMatrix` und echte CTMs | Vorlage: eigene Transform-Kette → versetzte Handles bei verschachtelten Gruppen |
| 001 E4 | **Keine** Tauri-Plugins mit WebView-Rechten für `fs`, `store`, `shell`, `clipboard-manager`; `dialog` nur über die Rust-API; `window-state` nur im Backend | Abweichung vom ersten Entwurf (`000-init.md`): gleiche Sicherheitsregel wie in den Schwesterprojekten. Einstellungen als eigene `settings.json` (`config_file.rs`, Schema-Version), Zwischenablage für SVG-Text über `navigator.clipboard` bzw. einen schmalen Command |
| 001 E5 | Port **1450**, Identifier `io.github.krocon.appiconic`, Fenster-Labels `main` und `doc-*` | eigener Port neben 1420/1430/1440 der Schwesterprojekte; mehrere Dokumentfenster ab Prompt 003 |
| 001 E6 | E2E: Playwright gegen den Angular-Dev-Server (Browser-Modus ohne Backend) + Sichtprüfung der echten App unter Xvfb | Geometrie braucht echtes Layout – jsdom kennt kein `getBBox`/`getCTM`. Geometrie-Tests mit DOM laufen deshalb in Playwright |
| 001 E8 | **KI-fähig, Logik bleibt im Frontend** (Marc, 26.10.2026): kein Umzug des Dokumentmodells nach Rust; stattdessen serialisierbare Commands + Aktionen mit Id, MCP-Sidecar mit Brücke (Prompt 018) | Geometrie (CTM, BBox, Text) liefert der Browser korrekt; ein Rust-Modell müsste sie nachbauen (Fehlerquelle der Vorlage) und jede Geste über IPC synchronisieren. Icons sind klein – kein Größenargument wie bei editlicious |
| 001 E7 | Arbeitsweise über Feature-Prompts (`prompts/`), Design-Dokument je Prompt, Commit + Push auf `main` | wie editlicious |
| 002 E1 | `icon.json` bleibt `serde_json::Value` (mit `preserve_order`); `IconJson` ist nur eine typisierte Sicht mit `extra` auf jeder Ebene | verlustfrei: unbekannte Felder (Specializations, `glass`, `position` …) werden durchgereicht, nie über die Sicht geschrieben |
| 002 E2/E3 | Ausgabe wie Icon Composer (2 Leerzeichen, `" : "`, kein Zeilenumbruch am Ende); unverändertes `icon.json` → Originalbytes | belegt an `camscanner.icon` und einer zweiten echten Datei; byte-genauer Roundtrip |
| 002 E5 | Sitzung je Pfad in Rust (`IconSessions`): unveränderte Assets kommen nicht über die Brücke | große Assets nicht doppelt serialisieren; Bytes bleiben exakt |
| 002 E6 | Bundle speichern: neues Bundle daneben, altes wegbenennen, neues an den Namen, altes löschen | Rename über einen bestehenden Ordner geht weder unter Windows noch unter Unix; gleiche Strategie auf allen OS |
| 002 E7/E8 | Grenzen für ZIP und Bundle (2 000 Einträge, 64 MiB je Datei, 256 MiB gesamt, Tiefe 16), Zip-Slip und verschlüsselte Einträge abgelehnt, Symlinks ignoriert | fremde Dateien sind feindlich |
| 002 E16 | Fixtures fürs Frontend als generiertes TS-Modul (`scripts/fixtures.mjs`, `pnpm fixtures:check`) | gleicher Weg für `ng test`, `ng serve` und Playwright, ohne Loader-Tricks |
| 003 E1/E2 | `IconDocument`: `icon.json` als unveränderlicher Wert (Helfer behalten Schlüsselreihenfolge), je Asset eine eigene `XMLDocument` mit `data-ai-id` an jedem Element; Stores halten nur `NodeRef { asset, id }` | exaktes Undo (alter Wurzelwert), stabile IDs über Undo/Redo, keine DOM-Referenzen in Stores |
| 003 E3/E4 | Unverändert = Serialisierung gleich der beim Öffnen/Speichern → `unchanged`, Rust schreibt Originalbytes; Bereinigung (Skripte, Handler, `foreignObject`, externe Referenzen) beim Öffnen, Import, Einfügen, Basis nach dem Bereinigen | byte-gleicher Roundtrip nicht bearbeiteter Assets, die WebView sieht nur Bereinigtes |
| 003 E5 | Stile beim Import auflösen über `CSSStyleSheet.replaceSync` + Shadow Root + `getComputedStyle` (mit/ohne Stile) | kein eigener CSS-Parser; Stile wirken nicht auf die App |
| 003 E6/E7 | `UndoService` je Dokument (Save-Punkt, Tiefe 200, Gesten `begin/update/commit/cancel` mit `merge`), `DocumentStore` als einfache Klasse je Dokument | kein God-Object, Gesten für 007 vorbereitet |
| 003 E8/E10 | Ein Dokument je Fenster (`main`, `doc-<n>`); Open ersetzt ein unberührtes neues Dokument, sonst neues Fenster; schon offene Datei → Fenster nach vorn; Schließen fragt über `close-requested`; macOS bleibt ohne Fenster offen | macOS-Dokumentverhalten, auf allen OS gleich bedienbar |
| 003 E14 | Browser-Modus über `fileReplacements` (`backend-providers.dev.ts`): Fakes + Test-Hook `window.__appIconic` nur im Dev-Build ohne Tauri | Playwright prüft Öffnen/Bearbeiten/Speichern ohne Backend; Produktions-Build ohne Fakes |
| 004 E1 | Asset-Wurzel lebt im Fenster-Dokument (`goLive` nach dem Bereinigen), die `XMLDocument` behält nur den Prolog; der Canvas zeigt dieselbe Instanz | keine Kopien pro Änderung, `getCTM`/`getBBox` an den Elementen der `NodeRef`s (007); Serialisierung byte-gleich |
| 004 E2 | je Layer ein Shadow Root mit eigenem Host-`<svg viewBox="0 0 1024 1024">` | gleiche `id`s verschiedener Assets lösen `url(#id)` im eigenen Tree Scope auf; `<style>` der Assets bleibt eingeschlossen |
| 004 E3 | erste Gruppe/erster Layer in `icon.json` = oben | wie die Seitenleiste in Icon Composer (Frage an Marc) |
| 004 E4 | Assets anderer Größe zentriert, unskaliert (Platzierungs-`<svg>` gehört dem Canvas) | wie Icon Composer; das Asset bleibt unverändert |
| 004 E8 | Maske als CSS `clip-path` (Squircle = „continuous corner“, 22,37 %; Kreis) | Hintergrund + Layer geschnitten, Guides darüber nicht |
| 004 E9/E10 | Zoom stufig (Knöpfe, Kürzel) und stufenlos (Pinch/Ctrl+Rad) um den Zeiger; Pan per `translate()` ohne Scrollbalken | flüssig; SVGs werden bei jeder Zoomstufe scharf gerastert (Breite = 1024 · z) |
| 004 E11 | `ViewTransform` rein; DOM-Geometrie nur über `getScreenCTM()` von Host und Element | `getCTM()` endet am nächsten Viewport (Asset-`<svg>`), keine eigene Transform-Kette |
| 004 E12 | Lineale in `<canvas>` | ein Zeichenvorgang je Änderung statt Hunderter SVG-Elemente beim Pannen |
| 004 E14 | `CanvasViewStore` als Root-Service | ein Canvas je Fenster (eigene WebView); Menüs (005) und Test-Hook brauchen ihn |
| 004 E16 | Playwright ohne Pixel-Baselines: DOM-/Geometrie-Assertions und einzelne Pixelfarben | Schriftrasterung unterscheidet sich zwischen Container und CI |
| 005 E1–E4 | Aktionskatalog (Id, Text, Kontext `global`/`canvas`/`hierarchy`/`dialog`, Gruppe, optionale Argumente), Keymaps je OS (`Mod`), `ActionService.run(id, args?)`, ein `KeyboardDispatcher` (ruht in Textfeldern und Dialogen, deaktivierte Aktionen fallen durch, Halte-Aktionen wie Space) | aus editlicious 005 übernommen; eine Stelle für Menü, Palette, Tastatur und die KI (018) |
| 005 E5–E8 | Ein Menümodell → natives macOS-Menü (Spec je Fenster, das fokussierte zeigt seins, Klicks nur an dieses Fenster) bzw. HTML-Menüleiste (Windows/Linux, immer sichtbar, F10/Alt) | mehrere Fenster (003); ohne vordefiniertes Edit-Menü (⌘Z nicht doppelt), aber Cut/Copy/Paste/Select All als vordefinierte Einträge, damit Textfelder kopieren/einfügen können |
| 005 E13 | Quit fragt alle Fenster nacheinander (`QuitQueue` in Rust), Cancel bricht ab | macOS-Verhalten; kein Datenverlust beim Beenden |
| 005 E15 | Dokument-Commands serialisierbar: `toJSON()` → `CommandJson`, Registry `commandFromJson` (prüft feindliche Eingaben), `DocumentStore.runCommand(json)`, Aktion `edit.runCommand` | KI-Regel (001 E8): MCP (018) nutzt dieselben Commands wie das UI; Roundtrip-Test je Command |
| 006 E1/E2 | Baummodell rein aus dem Dokument (`buildTree` → `flatten`, `computed`), Asset-Wurzel ohne eigene Zeile (der Layer steht für sie), nicht darstellende Kinder unter „Definitions“; SVG-Nodes in Dokumentreihenfolge, Gruppen/Layer wie Icon Composer (erste = vorn); ab 500 Zeilen virtualisiert | eine Quelle der Wahrheit; feste Zeilenhöhe `--tree-row-height` |
| 006 E5 | Auswahl: `DocumentStore.selection` (Nodes, auch für den Canvas) + `items` (Root/Gruppen/Layer), schließen sich aus, gleichartig; Tastatur nach APG Tree als Aktionen im Kontext `hierarchy` | Auswahl beidseitig synchron; Tastatur nur über Aktionen (CLAUDE.md §4) |
| 006 E6 | Ein Command `reorder { sources, target, position: before/after/into }` (relative Position statt Index) mit den Regeln der Vorlage (`TreeReorderService`), dazu `moveLayer`, `groupNodes`, `ungroup` | Maus, Tastatur (Move Up/Down/Into/Out) und KI nutzen denselben serialisierbaren Weg |
| 006 E7 | Drag & Drop mit Zeigerereignissen statt HTML5-Drag-API | Tauri fängt Drag&Drop für Datei-Drops ab (v. a. Windows) |
| 006 E12 | Zwischenablage als SVG-Text über `ClipboardApi` (`navigator.clipboard`) plus DOM-Ereignisse `copy`/`cut`/`paste` (macOS-Menü) – kein Plugin, kein Rust | plattformübergreifend, zwischen Fenstern/Apps; Einfügen wird bereinigt, IDs eindeutig |
| 006 E13 | Ausrichten über `nodeBoundsInDocument` (BBox + Screen-CTMs), Verschiebung als vorangestelltes `translate(A⁻¹·d)` im System des Elternelements | „Der Browser ist die Grafik-Engine“ – keine eigene Transform-Kette |
| 006 E14 | Import/Paste legen neue Gruppen oben (Index 0) an | wie Icon Composer (004 E3) |
| 007 E1/E2 | Handles und Treffer nur über Browser-Matrizen: Punkte im Benutzerraum der Node, abgebildet mit `nodeToDocument`; Treffer über `isPointInFill`/`isPointInStroke` (Toleranz 4 Bildschirm-px) bzw. BBox je gerendertem Layer von oben | die Layer-Hosts nehmen keine Zeigerereignisse (004); keine eigene Transform-Kette, exakt bei verschachtelten transformierten Gruppen |
| 007 E3/E4 | Klick wählt das Kind des Gruppen-Kontexts (Standard: oberstes Element im Layer), Doppelklick geht hinein, Esc heraus; Selection Modes `point` (Punkt-Handles) / `boxed` (Box-Handles) / `none`; Rahmenauswahl schneidet Bounds im Dokumentraum | wie die Vorlage (`CanvasSelectionOverlay`) und gängige Editoren |
| 007 E5 | Overlay als eigenes SVG in Viewport-Pixeln (nie im Dokument-DOM), Handles in Bildschirmgröße | konstante Größe bei jedem Zoom, Handles sind die einzigen Ereignisziele |
| 007 E8 | Pfaddaten über einen kleinen Tokenizer (`path-data.ts`); unveränderte Segmente bleiben Zeichen für Zeichen, geänderte behalten relativ/absolut | Chromium und WebKit haben kein `getPathData`; minimale Änderung am Quelltext |
| 007 E9/E10 | Ziehen = Geste (`begin` ab 3 px, ein `update` je Frame, `commit`/`cancel`), Ergebnis ist **ein** Command `setAttributes { changes }` | KI-Regel: jede Geste als ein serialisierbarer Command; Esc stellt her |
| 007 E11 | Verschieben setzt ein `translate` vorn an `transform` (mit vorhandenem `translate`/`matrix` verrechnet), Box-Skalierung hängt `matrix(…)` an | einheitlich für alle Node-Arten, keine wachsende Kette beim Nudgen |
| 007 E12 | Pfeiltasten 1 / ⇧ 10 Dokumenteinheiten; eine Folge innerhalb 500 ms ist ein Undo-Schritt (`executeCoalescing`, faltet in den obersten Schritt, nie in den Save-Punkt) | kein offenes Gesten-Fenster, das fremde Befehle verschlucken könnte |
| 007 E13/E14 | Snapping rein (`snapping.ts`): Grid 10 (Ursprung `worldZero`/`svgCenter`), Magic Snap auf markante Punkte aller sichtbaren Nodes, 20 Bildschirm-px, Magic vor Grid; BoundsGuard klemmt Punkte/Verschiebungen auf die Leinwand (außer was schon draußen liegt) | Algorithmen der Vorlage (`SnappingService`, `BoundsGuard`) mit ihren Testfällen |
| 007 E15 | Esc (`canvas.escape`) und Entf (`canvas.deletePoint`) im Kontext `canvas` sind nur aktiv, wenn es etwas zu tun gibt, sonst fällt die Taste zu Deselect/Delete durch | bewusste Ausnahme im Keymap-Test „Kontext verdeckt kein globales Kürzel“ |
| 008 E1/E2 | „Add“ ohne neue Dokument-Commands: je Aktion ein `composite` aus `insertNode` bzw. `addAsset` + `addGroup` (Label „Add Circle“ …); Einfügeort rein (`insert-target.ts`): gewählter Container → hinein, Node → dahinter, Layer/Gruppe → Ende des Assets, Gruppen-Kontext, sonst erster Layer der ersten Gruppe, ohne Layer zuerst eine Icon-Gruppe (ein Undo-Schritt), ohne Dokument zuerst „New Document“ | ein Undo-Schritt, als JSON darstellbar; Regeln der Vorlage (`resolveTargetAssetAndContainer`) |
| 008 E3 | Zentrum = Mitte des Viewports im Dokumentraum (auf die Leinwand geklemmt) → `nodeToDocument(host, parent)⁻¹`; explizite KI-Geometrie gilt im Benutzerraum des Elternelements | exakt in transformierten Gruppen ohne eigene Transform-Kette |
| 008 E6 | Add-Aktionen mit serialisierbaren Argumenten (`core/actions/add-action-args.ts`: Geometrie je Form, `fill`/`stroke`/`strokeWidth`/`attributes`, `parent`, `index`; `add.image { href }`, `add.svgSnippet { markup }`) | KI-Regel: `add.circle { cx, cy, r, fill }` wie ein Menüklick |
| 008 E8 | Bilder: Rust prüft Art an den Magic Bytes (PNG/JPEG/WebP/SVG, ≤ 20 MiB) und liest die Größe aus dem Kopf; `<image href="data:…">`, nur verkleinert auf ≤ 512; `insertNode` bis 32 MiB Markup | fremde Dateien sind feindlich; die Endung entscheidet nichts |
| 008 E9 | SVG Snippet: bereinigt vor jedem DOM-Kontakt, Wurzel entpackt, `defs` mit, IDs eindeutig, Zentrieren über `getBBox` einer `<g>` in einem unsichtbaren Mess-SVG, Verschiebung vorn an `transform` | der Browser misst; wie 007 E11 |
| 009 E1/E2 | Properties-Panel aus **Property-Specs** (`property-spec.ts`, Typ/Einheit/Bereich/Default je Node-Typ, Abschnitte Geometry → Advanced) statt einer handgeschriebenen Komponente; Werte: `style` vor Attribut (wirkt im Browser), sonst berechnet (`getComputedStyle`) bzw. Default | Vorlage: 1 500 Zeilen `PropertiesPanel.swift`; der Browser löst Vererbung auf |
| 009 E3/E4 | Schreiben = Attribut, eine gleichnamige `style`-Eigenschaft fällt im selben `setAttributes` weg (`value: null` = entfernen); Text-Inhalt über den neuen Command `setText`; getippte Werte sind eine Geste je Feld (Ziele beim Start fest, `merge` → ein Command), Enter/Blur = commit, Esc = cancel | eine Änderung, die sichtbar wirkt; ein Undo-Schritt je getipptem Wert; serialisierbar (KI-Regel) |
| 009 E7 | Transform-Liste rein (`transform-list.ts`): strenge Grammatik, unveränderte Schritte behalten ihren Text, Matrix = Produkt der Schritte (in Playwright gegen `transform.baseVal.consolidate()` geprüft); „Use pivot“ = BBox-Mitte im Raum des `rotate` | Rohtext bleibt lesbar; der Browser bleibt Richter über die Bedeutung |
| 009 E8 | Reset entfernt Attribut + `style`-Eigenschaft (statt Defaults zu schreiben); Geometrie, ohne die die Form verschwindet, und `id` sind nicht zurücksetzbar | Defaults wie `fill="none"` hätten das Bild verändert; `url(#id)`-Verweise bleiben heil |
| 009 E10/E11 | Generische Editoren in `shared/controls/` (Zahl mit Stepped Slider, Farbe, Auswahl, Text, Schalter; Ausgaben `edited`/`committed`/`reverted`), Aktionen `properties.set/reset/resetAll` | wiederverwendbar für den Icon-Inspector (010); die KI setzt, was das Panel setzt |

## Schichten

```
Angular (WebView)                                   Rust
  features/*  ── Stores (Signals) ── core/*Api ──► invoke ──► commands.rs (dünn, async)
                                      (call.ts)                   │
  SVG-DOM = Dokument-Assets                                       ▼
  DocumentStore + UndoService (Commands)                     ai-core: icon/, export/, fonts/
```

- `invoke()` nur in `src/app/core/backend/call.ts`; jede Fähigkeit als typisierte Fassade `*Api` in `app/core/`.
- Fehler immer `FsError { code, message, path }` (Rust `ai-core/src/error.rs` ↔ `core/errors/fs-error.ts`).
- Commands sind `async` (Test `command_rules`), Blockierendes in `spawn_blocking`.

## Commands

| Command | Prompt | Zweck |
|---|---|---|
| `get_app_info` | 001 | Name, Version (aus `package.json`), OS, Architektur |
| `open_icon(path)` | 002 | `.icon` (Ordner oder ZIP) lesen → `IconDocumentDto { path, format, iconJson, assets, warnings }`, Sitzung anlegen |
| `new_icon()` | 002 | neues Dokument (eine Gruppe, ein Layer, leeres SVG), ohne Pfad |
| `save_icon(path, format, iconJson, assets, from?)` | 002 | speichern; unveränderte Assets aus der Sitzung von `from`/`path` → `SaveResult { path, format }` |
| `close_icon(path)` | 002 | Sitzung freigeben |
| `read_svg_file(path)` | 002 | SVG als Text (≤ 16 MiB) für „Import SVG…“ |
| `pick_open_icon(folder)`, `pick_save_icon(suggestedName, format)`, `pick_svg_file()` | 002 | native Dialoge (Rust-API), `null` bei Abbruch |
| `recent_files()`, `add_recent_file(path)`, `clear_recent_files()` | 003 | „Open Recent“: `recent.json` (max. 10, nur vorhandene) → `RecentFileDto[] { path, name }` |
| `set_window_title(title, edited, path?)` | 003 | Titel des aufrufenden Fensters (`• ` bzw. macOS `setDocumentEdited:`), merkt den gezeigten Pfad |
| `open_document_window(path?)`, `focus_document_window(path)` | 003 | neues Fenster `doc-<n>` (mit Startpfad) bzw. das Fenster, das `path` zeigt, nach vorn |
| `window_start_path()`, `take_over_close()`, `close_window()` | 003 | Start des Fensters, Schließknopf → Ereignis `close-requested`, Fenster schließen |
| `set_app_menu(spec)` | 005 | Menümodell des Fensters (geprüft in `ai-core::menu_spec`), auf macOS gesetzt, wenn das Fenster vorn ist; Klick → Ereignis `menu-action { id }` an das fokussierte Fenster |
| `load_keymap_overrides()` | 005 | `keymap.json` im Config-Ordner → `KeymapOverrides { bindings, warning }` |
| `quit_app()`, `cancel_quit()` | 005 | Quit-Folge über alle Fenster (`close-requested` nacheinander) bzw. Abbruch durch das gefragte Fenster |
| `window_start_action()` | 005 | Aktion, die ein ohne Fenster gewählter Menüeintrag (macOS) im neuen Fenster ausführt |
| `pick_image_file()` | 008 | nativer Dialog für ein Bild (PNG, JPEG, WebP, SVG), `null` bei Abbruch |
| `read_image_file(path)` | 008 | Bild ≤ 20 MiB → `ImageFileDto { name, mime, dataUrl, width?, height? }` (Art aus Magic Bytes, Größe aus dem Kopf); Fehler `too_large`, `invalid_image` |

DTO-Ergänzung 003: `IconDocumentDto.name`, `SaveResult.name` (Dateiname fürs UI). Fehlercode 005: `invalid_menu`.
006 bringt keinen Rust-Command: Hierarchie, Ausrichten und Zwischenablage laufen ganz im Frontend. 007 ebenso
(Auswahl, Handles, Snapping, BoundsGuard nur im Frontend; neuer Dokument-Command `setAttributes`). 008: keine
neuen Dokument-Commands (Add = `composite` aus `insertNode`/`addAsset`/`addGroup`), Fehlercode `invalid_image`,
keine neue Abhängigkeit (Bildköpfe von Hand, `base64` war schon da). 009: kein Rust-Command; Dokument-Commands `setAttributes` mit `value: null` (Attribut
entfernen) und neu `setText { changes: [{ ref, text }] }`; keine neue Abhängigkeit.

Geplante Commands (Signaturen werden im Design-Dokument des jeweiligen Prompts festgelegt): `export_svg`,
`export_png` (012), `list_fonts`, `text_to_path` (013), `load_settings`/`save_settings` (015).

## Abhängigkeiten

| Paket | Wo | Grund |
|---|---|---|
| `@angular/*` 22, `rxjs`, `tslib` | Frontend | UI (zoneless, Signals) |
| `@tauri-apps/api` | Frontend | `invoke`, `isTauri` – nur in `call.ts` |
| `vitest`, `jsdom` | Dev | Unit-Tests über `ng test` |
| `@playwright/test` 1.63.0 | Dev | E2E im Browser (001 E6) |
| `eslint`, `angular-eslint`, `typescript-eslint`, `prettier` | Dev | Lint/Format |
| `tauri` 2, `tauri-build` | Rust | Desktop-Hülle |
| `tauri-plugin-dialog` | Rust | Datei-Dialoge über die Rust-API (001 E4) |
| `tauri-plugin-window-state` | Rust | Fenstergröße/-position je Label (001 E4) |
| `serde`, `serde_json` (Feature `preserve_order`) | Rust | DTOs, `icon.json` mit stabiler Schlüsselreihenfolge (002 E4) |
| `zip` 8.6 (nur Deflate über `flate2`/zlib-rs) | Rust (`ai-core`) | `.icon` als ZIP lesen/schreiben (002); ersetzt `/usr/bin/zip` der Vorlage; ohne AES/bzip2/lzma/zstd → kleinere Angriffsfläche |
| `unicode-normalization` | Rust (`ai-core`) | Asset-Namen NFC vergleichen (HFS+ speichert NFD, 002 E11/E12) |
| `base64` | Rust (`ai-core`) | PNG-Assets als Data-URL ans Frontend (002 E9) |
| `objc2` 0.6 (nur macOS) | Rust | `-[NSWindow setDocumentEdited:]` für den Änderungspunkt im Schließknopf (003 E11); Tauri hat dafür keine API, die Crate ist über tao ohnehin im Baum |
| `tempfile` | Rust (Dev) | Dateisystem-Tests |
