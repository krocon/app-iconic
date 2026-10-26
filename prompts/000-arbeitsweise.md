# Prompt 000: Gemeinsame Arbeitsweise für alle Feature-Prompts

> Gilt für alle Prompts in `prompts/` (Index und Reihenfolge: `prompts/README.md`). Jeder Feature-Prompt verweist
> hierher und beschreibt nur, was für sein Feature dazukommt. **Zuerst diese Datei lesen, dann den Feature-Prompt.**
> Übernommen und angepasst aus editlicious (`prompts/000-arbeitsweise.md`).

---

## 1. Vor dem Start

- `CLAUDE.md` lesen, dazu `docs/architecture.md` und die im Prompt genannten Abschnitte aus
  `docs/legacy-analysis.md` („legacy §N“). Der Quellcode der Vorlage liegt auf Marcs Mac unter
  `~/WebstormProjects/AppIconic/AppIconic` (in Remote-Sitzungen per `device_bash` lesen, nie schreiben).
- Code aus **editlicious**, **comic-commander-tauri** oder **files-and-folders-tauri** (öffentlich, MIT, gleicher
  Autor) darf übernommen werden – mit Herkunftsvermerk im Modulkopf und den zugehörigen Tests.
- Abhängigkeiten prüfen: jeder Prompt nennt, welche Prompts vorher fertig sein müssen (`prompts/README.md`).
- Toolchain: `node -v` ≥ 22.22.3, `pnpm -v`, `cargo -V`; `pnpm install`; einmal `pnpm check`.

## 2. Phasen

| Phase | Ergebnis |
|---|---|
| 1 | Design-Dokument `prompts/NNN-<slug>.design.md` (Entscheidungen E1…, Verträge: Commands mit Signaturen, DTOs, Store-APIs; Tests) |
| 2 | Rust: Tests zuerst, dann Implementierung |
| 3 | Frontend: Tests zuerst, dann Implementierung |
| 4 | Ende-zu-Ende: Playwright gegen den Dev-Server; echte App (im Container: Debug-Build + Xvfb, CLAUDE.md §8) |
| 5 | Doku: `docs/architecture.md`, `docs/FEATURES.md` (Checkboxen abhaken), README, CLAUDE.md, Prompt-Status |
| 6 | `pnpm check` + `pnpm e2e` grün, Commit + Push auf `main`, Prompt nach `prompts/done/` |

**Freigaben:** Der erste Entwurf (`000-init.md`) verlangte vor dem ersten Code einen Architekturplan mit den
Rust-Commands zur Freigabe. Dieser Plan steht in `docs/architecture.md` und im Design-Dokument des jeweiligen
Prompts. Hat Marc nichts anderes gesagt, werden offene Entscheidungen im Design-Dokument **mit Empfehlung
entschieden** und im Abschlussbericht genannt. Ausnahme `.icon`-Format: Unklares wird konservativ gelöst (Daten
erhalten) und als Frage im Bericht aufgeführt.

### Regeln je Phase

- **Rust:** Logik in `ai-core` ohne Tauri (testbar), Command-Schicht dünn, Commands `async` (Test `command_rules`),
  Blockierendes in `spawn_blocking`. `cargo fmt`, `cargo clippy --all-targets -D warnings`, `cargo test`.
- **Frontend:** Backend nur über typisierte Fassaden (`app/core/...Api`), Fakes in `src/testing/`. Signals, `OnPush`,
  zoneless. Tastatur nur über das Aktionssystem (ab 005). Texte zentral in `*-texts.ts`. Styling nur über Tokens aus
  `src/styles.css`. Barrierefreiheit: sichtbarer Fokus, alles per Tastatur, Dialoge mit Fokusfalle.
- **Dokument-Mutationen** nur über benannte Commands im `DocumentStore` (ab 003) – nie das SVG-DOM direkt ändern.
  Jeder Command ist **serialisierbar** (`{ type, …args }`, Test: JSON hin und zurück ergibt dasselbe Ergebnis) und
  jede Funktion eine Aktion mit Id – Grundlage für die KI-Steuerung über MCP (018).
- **Geometrie** immer über `DOMMatrix`/CTM des echten DOM (CLAUDE.md §4); reine Rechnungen in `shared/geometry/`
  mit Unit-Tests, alles mit Layout in Playwright.
- Dateien höchstens ~400 Zeilen; wächst etwas darüber, wird es geteilt.
- Nie in echten Nutzerdaten schreiben; Testdateien per Generator oder aus `testdata/`.

## 3. Definition of Done

- [ ] Design-Dokument geschrieben (Entscheidungen, Verträge, Tests)
- [ ] Rust- und Frontend-Tests grün, `pnpm check` und `pnpm e2e` grün, Debug-Build gebaut
- [ ] Akzeptanzkriterien Ende-zu-Ende geprüft (soweit im Container möglich; Rest im Bericht)
- [ ] `docs/FEATURES.md` gepflegt, Doku aktuell, Prompt + Design nach `done/` verschoben (`git mv`)
- [ ] Commit(s) auf `main`, gepusht
