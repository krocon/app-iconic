# Design 001: Grundgerüst

Status: umgesetzt · Datum: 26.10.2026

## Entscheidungen

- **E1 Gerüst aus editlicious übernommen** (Stand Prompt 001, statt `create-tauri-app`): gleiche Skripte, Lint-/
  Format-Regeln, `call.ts`, `FsError`, `Modal`/`DialogService`, `fs_atomic.rs`, `config_file.rs`, CI (mit den
  späteren Linux-Fixes). Versionen wie dort (Angular 22.2, TS ~6.0, Tauri 2.12) – geprüft am 26.10.2026: TypeScript 7
  und Tauri 3 alpha werden bewusst noch nicht genommen.
- **E2 Workspace mit Engine-Crate `ai-core`** ohne Tauri von Anfang an (wie `ed-core`): `error`, `fs_atomic`,
  `config_file` liegen dort; die App-Crate re-exportiert `error`.
- **E3 Port 1450**, Crate `app-iconic`, Lib `ai_lib`, Identifier `io.github.krocon.appiconic`; Capability gilt für
  `main` und `doc-*` (mehrere Dokumentfenster ab 003).
- **E4 Plugins:** nur `dialog` (Rust-API) und `window-state` (Backend). `fs`, `store`, `shell`, `clipboard-manager`
  aus dem ersten Entwurf entfallen (Sicherheitsregel der Schwesterprojekte; `docs/architecture.md` 001 E4).
- **E5 Playwright 1.63.0** gepinnt (passt zum Chromium der Cloud-Umgebung); E2E gegen `pnpm start`.
- **E6 Fensterhülle statt Willkommensseite:** die drei Seitenleisten mit den Legacy-Breiten 260/260/300 px und eine
  Platzhalter-Zeichenfläche mit den Apple-Guides (`iconGuides()`), damit die Struktur von Anfang an sichtbar ist.
- **E7 App-Icon neu gezeichnet:** drei isometrische Ebenen auf dunklem macOS-Körper (824 px, Radius 185.4).
- **E8 Fixtures** unverändert aus `AppIconic/docs/` nach `testdata/fixtures/` (Repo-Wurzel, damit Rust und
  Playwright sie teilen).

## Verträge

- Command `get_app_info() -> AppInfo { name, version, os, arch }`.
- Fehlercodes: `not_found`, `permission_denied`, `not_a_directory`, `is_a_directory`, `invalid_path`, `io`
  (+ Frontend `backend_unavailable`, `unknown`).

## Tests

- Rust: `error`, `about`, `command_rules`, übernommene `fs_atomic`/`config_file`-Tests.
- Frontend: `fs-error.spec.ts`, `icon-guides.spec.ts`, `app.spec.ts` (Panels, Guides, About mit Fake-Version).
- E2E: `e2e/shell.spec.ts` (Panels, Canvas, About ohne Backend, Esc schließt).

## Fortschritt

- [x] Gerüst, Icon, Fixtures, Doku, CI · `pnpm check` + `pnpm e2e` grün · Debug-Build unter Xvfb gestartet
