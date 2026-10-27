# Release und Distribution

> Stand: Prompt 030 (Design `prompts/done/030-release-distribution.design.md`), übernommen aus editlicious
> (Design 012 + 014), dort aus comic-commander-tauri und files-and-folders-tauri. **Tags, Veröffentlichung und
> Signierung nur mit Marcs ausdrücklicher Freigabe** (CLAUDE.md §6). Lizenz: **MIT** (`LICENSE`, `license` in
> `Cargo.toml`/`package.json`, `bundle.license` in `tauri.conf.json`).

## Version – eine Quelle

| Datei                                | Version                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `package.json`                       | **Quelle** (`"version"`)                                                   |
| `src-tauri/tauri.conf.json`          | `"version": "../package.json"` – Tauri liest sie dort (App, Pakete, About) |
| `src-tauri/Cargo.toml`, `Cargo.lock` | Kopie des Crates `app-iconic`, gesetzt von `scripts/version.mjs`           |

```bash
pnpm version:set 0.2.0      # schreibt package.json, Cargo.toml, Cargo.lock (kein Commit, kein Tag)
pnpm version:check          # Teil von `pnpm check` und des Release-Workflows
```

## Die Pipeline (`.github/workflows/release.yml`)

| Job                                    | Was                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pre-flight**                         | Versionen gleich (und = Tag), alle `scripts/*.test.mjs`, Release Notes seit dem letzten Tag (Zusammenfassung des Laufs und Text des Entwurfs)                                                                                                                                                                                                                                                                                                                                                         |
| **Packages (macos / linux / windows)** | `pnpm notices:check`, optional Signierung, MCP-Sidecar (`scripts/mcp-sidecar.mjs`), Bauen mit `tauri-action` und `--config src-tauri/tauri.sidecar.conf.json`; dann `scripts/collect-packages.mjs` (alle Arten da, Größen, SHA-256). Linux: `.deb` enthält Programm, Sidecar, Lizenzhinweise, Mime-Typ, `.desktop` mit `%F`/`MimeType`, `postinst`. macOS: universal (x86_64 + arm64), Sidecar, Lizenzhinweise, `.icon` als Package-Dokument mit Rang `Alternate`. Artefakt `packages-<os>` (14 Tage) |
| **SHA256SUMS.txt**                     | eine Prüfsummendatei über alle Pakete, mit `sha256sum -c` geprüft                                                                                                                                                                                                                                                                                                                                                                                                                                     |

| Auslöser                                                             | Ergebnis                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Actions → **Release** → Run workflow, Modus **`dry-run`** (Standard) | nur Pakete + Prüfsummen als Artefakte – **kein Tag, kein Release** |
| Run workflow, Modus **`draft`**                                      | zusätzlich Release-**Entwurf** `vX.Y.Z`                            |
| Tag `vX.Y.Z` pushen                                                  | Entwurf zu diesem Tag (Tag muss zu `package.json` passen)          |

Veröffentlicht wird nie automatisch; Versionen `0.x` werden als Pre-release angelegt.

## Ablauf eines Releases

1. `main` ist grün (CI) und ein Probelauf (`dry-run`) war grün.
2. `pnpm version:set X.Y.Z`, `pnpm notices`, `pnpm licenses:report`, `pnpm check`, Commit `chore: release X.Y.Z`.
3. Release Notes ansehen: `pnpm release:notes`.
4. Tag pushen (`git tag vX.Y.Z && git push origin vX.Y.Z`) **oder** Run workflow mit Modus `draft`.
5. Pakete aus dem Entwurf installieren und prüfen (unten), Entwurf von Hand veröffentlichen.

## Pakete je OS (`tauri.conf.json` + `tauri.<os>.conf.json`)

| OS      | Pakete                      | Einstellungen                                                                                         |
| ------- | --------------------------- | ----------------------------------------------------------------------------------------------------- |
| macOS   | `.app`, `.dmg` (universal)  | `minimumSystemVersion` 12.0, Hardened Runtime, `entitlements.plist` (nur vom Nutzer gewählte Dateien) |
| Windows | `.msi`, `-setup.exe` (NSIS) | `installMode: currentUser`, Englisch/Deutsch, WebView2 per Bootstrapper                               |
| Linux   | `.deb`, `.rpm`, `.AppImage` | gebaut auf `ubuntu-22.04`; deb-Abschnitt `graphics`                                                   |

Lokal: `pnpm tauri:build:mac` (universal), `pnpm tauri:build:mac:local`, `pnpm tauri:build:linux`,
`pnpm tauri:build:windows`; mit Sidecar zusätzlich `node scripts/mcp-sidecar.mjs` und
`--config src-tauri/tauri.sidecar.conf.json`.

## Dateizuordnung `.icon`

| OS      | Wie                                                                                                                                                                                                 | Wirkung                                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| macOS   | `src-tauri/Info.plist` (von Tauri eingemischt): `CFBundleDocumentTypes` mit Endung `icon`, `LSTypeIsPackage`, Rolle Editor, Rang **Alternate**                                                      | „Öffnen mit › AppIconic“; Icon Composer bleibt Standard. Kein eigener UTI (Apples Bezeichner ist nicht dokumentiert) |
| Windows | `tauri.windows.conf.json` → `fileAssociations`                                                                                                                                                      | `.icon` öffnet mit AppIconic (dort kein anderer Besitzer)                                                            |
| Linux   | `tauri.linux.conf.json`: `MimeType=application/x-icon-composer` + `/usr/share/mime/packages/app-iconic.xml` (Glob `*.icon`, Unterklasse von ZIP), `postinst`/`postrm` aktualisieren die Datenbanken | im Dateimanager „Öffnen mit“ (deb/rpm; AppImage ohne Zuordnung)                                                      |

Dateien kommen so in die App: Kommandozeile beim ersten Start, ein zweiter Start (Windows/Linux) über
`tauri-plugin-single-instance`, der Finder (macOS) als `RunEvent::Opened` – auch bei laufender App. Das erste
Fenster nimmt die erste Datei, solange es noch startet; eine schon offene Datei holt ihr Fenster nach vorn; sonst
öffnet jede Datei ein neues Fenster (`src-tauri/src/open_files.rs`).

## „Im Ordner zeigen“

Nach einem Export zeigt der Export-Dialog **Im Ordner zeigen** (Aktion `file.revealExport`, File-Menü
„Show Last Export in Folder“). Rust zeigt nur Dateien, die dieser Prozess exportiert hat (`reveal.rs`):
`open -R` (macOS), `explorer /select,` (Windows), `xdg-open <Ordner>` (Linux). Ein Share-Sheet ist bewusst nicht
eingebaut (Design 030 E6).

## Lizenzhinweise und Lizenzbericht

- **`THIRD-PARTY-NOTICES.txt`** (`pnpm notices`): Lizenztexte aller ausgelieferten Teile – Rust-Crates über
  normale Abhängigkeiten aller Zielplattformen, npm-Laufzeitpakete (darunter Lucide aus `lucide-static`). Liegt in
  jedem Paket (`bundle.resources`) und im About-Dialog („Third-party licences…“). `pnpm notices:check` (in
  `pnpm check` und im Workflow) schlägt fehl, wenn sie veraltet ist – **nach jeder Abhängigkeitsänderung
  `pnpm notices` ausführen und mit committen**.
- **`docs/licenses.md`** (`pnpm licenses:report`): Übersicht aller Lizenzen; `pnpm licenses:check` prüft Aktualität
  und dass jede nicht rein permissive Lizenz geprüft ist (`REVIEWED`: MPL-2.0-Crates von Tauri, unverändert).

## Signierung und Notarisierung (vorbereitet, nicht eingerichtet)

Ohne Secrets baut der Workflow **unsigniert**: macOS – Rechtsklick → Öffnen; Windows – SmartScreen „Weitere
Informationen“ → „Trotzdem ausführen“. Secrets unter GitHub → Settings → Secrets and variables → Actions; dieselben
Zertifikate wie bei Files and Folders, Comic Commander und editlicious.

| Secret                                                       | Inhalt                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`            | `.p12` des Developer-ID-Application-Zertifikats (base64) und Passwort    |
| `APPLE_SIGNING_IDENTITY`                                     | z. B. `Developer ID Application: … (TEAMID)`                             |
| `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_PRIVATE_KEY` | empfohlen für die Notarisierung: App-Store-Connect-API-Schlüssel         |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`                | alternativ: Apple-ID, app-spezifisches Passwort, Team-ID                 |
| `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`        | `.pfx` (base64) und Passwort; der Workflow setzt `certificateThumbprint` |

Der MCP-Sidecar liegt im App-Bundle und wird mit ihr signiert.

## Prüfen (Akzeptanz)

| OS      | Was                                                                                         | Stand                                            |
| ------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Linux   | `.deb` bauen, Inhalt prüfen (Programm, Sidecar, Hinweise, Mime-XML, `.desktop`, `postinst`) | im Container gebaut (Prompt 030) und im Workflow |
| macOS   | `.dmg` installieren, starten; „Öffnen mit › AppIconic“ auf einem `.icon`                    | Marc (Mac)                                       |
| Windows | `-setup.exe` ohne Admin installieren, starten, `.icon` per Doppelklick                      | Workflow-Artefakt, Test offen                    |
