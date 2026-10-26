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

Geplante Commands (Signaturen werden im Design-Dokument des jeweiligen Prompts festgelegt):
`open_icon`, `save_icon`, `read_svg_file`, `pick_*` (Dialoge), `recent_files_*` (002/003), `export_svg`,
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
| `serde`, `serde_json` | Rust | DTOs, `icon.json` |
| `tempfile` | Rust (Dev) | Dateisystem-Tests |
