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

DTO-Ergänzung 003: `IconDocumentDto.name`, `SaveResult.name` (Dateiname fürs UI).

Geplante Commands (Signaturen werden im Design-Dokument des jeweiligen Prompts festgelegt): `export_svg`,
`export_png` (012), `list_fonts`, `text_to_path` (013), `set_app_menu` (005), `load_settings`/`save_settings` (015).

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
