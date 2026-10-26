# Prompt 001: Grundgerüst (Walking Skeleton)

> Lies zuerst [000-arbeitsweise.md](../000-arbeitsweise.md). Braucht: – · Meilenstein 1 aus `000-init.md`

## Ziel

Ein lauffähiges, geprüftes Grundgerüst wie bei editlicious: **Tauri 2 + Angular 22 (zoneless, Signals, Standalone,
OnPush) + Rust**, pnpm 10, Vitest, Playwright, ESLint, Prettier, `pnpm check`, GitHub-CI. Das Fenster zeigt die
Fensterhülle (Toolbar, Command Sidebar, Hierarchy, Canvas mit leerer 1024er-Zeichenfläche und Icon-Guides,
Properties) und einen About-Dialog mit Version aus dem Backend.

## Umfang

- Projektdateien aus editlicious (Prompt 001): `package.json` (Skripte inkl. `check`, `e2e`), `angular.json`
  (Port **1450**), `tsconfig*.json`, `eslint.config.js`, `.prettierrc`, `.editorconfig`, `.gitattributes`, `.gitignore`,
  `playwright.config.ts`.
- Rust-Workspace: App-Crate `app-iconic` (Lib `ai_lib`: `lib.rs`, `commands.rs` mit `command_rules`, `about.rs`,
  `model.rs`), Engine-Crate `ai-core` (`error.rs`, `fs_atomic.rs`, `config_file.rs`), `tauri.conf.json`
  (Identifier `io.github.krocon.appiconic`, strenge CSP), `capabilities/default.json` (nur `core:default`).
- Frontend: `core/backend/call.ts`, `core/errors/fs-error.ts`, `core/about/`, `styles.css` mit Tokens hell/dunkel
  und Canvas-Tokens `--ai-*`, `shared/dialog/`, `shared/geometry/icon-guides.ts`, `features/shell`, `features/canvas`,
  `testing/`.
- App-Icon (SVG-Quelle, alle Größen erzeugt), Test-Fixtures der Vorlage unter `testdata/fixtures/`.
- Doku: `CLAUDE.md`, `README.md`, `docs/architecture.md`, `docs/legacy-analysis.md`, `docs/FEATURES.md`, `LICENSE`.
- CI: `.github/workflows/ci.yml` (Frontend, E2E, Rust auf 3 OS).

## Akzeptanz

- `pnpm check` und `pnpm e2e` grün, `pnpm tauri build --debug --no-bundle` baut, App startet unter Xvfb.
- `pnpm start` im Browser zeigt die Oberfläche; About meldet „desktop backend not available“ statt eines Fehlers.
