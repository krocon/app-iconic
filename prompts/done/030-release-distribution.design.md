# Design 030: Release und Distribution

Status: umgesetzt · Datum: 27.10.2026 · Vorbild: editlicious Design 012 + 014 (dort aus comic-commander-tauri und
files-and-folders-tauri übernommen, MIT, gleicher Autor). Abläufe für Menschen in `docs/release.md`.

## Entscheidungen

- **E1 Eine Version, Lizenzen** (Skripte aus editlicious, je mit Herkunftsvermerk und `node --test`):
  `package.json` ist die Quelle, `tauri.conf.json` verweist darauf, `scripts/version.mjs` hält
  `src-tauri/Cargo.toml`/`Cargo.lock` gleich (`pnpm version:set|check`). `scripts/release-notes.mjs` (Conventional
  Commits seit dem letzten Tag). `scripts/notices.mjs` erzeugt `THIRD-PARTY-NOTICES.txt` aus `cargo metadata`
  (normale Abhängigkeiten aller Zielplattformen) und `pnpm licenses list --prod` – ersetzt die Handfassung aus 013
  (Lucide kommt als npm-Paket `lucide-static` mit, die Testschrift Caladea ist nicht Teil der App). Die Datei liegt
  im Paket (`bundle.resources`). `scripts/licenses.mjs` schreibt `docs/licenses.md` und prüft mit `--check` auf
  ungeprüfte nicht-permissive Lizenzen (MPL-2.0 der Tauri-Crates als geprüft). `version:check`, `notices:check`,
  `licenses:check` sind Teil von `pnpm check`.
- **E2 Pipeline** `.github/workflows/release.yml` wie editlicious 014: Auslöser Tag `v*` (Entwurf) oder
  `workflow_dispatch` mit Modus `dry-run` (Standard, nur Artefakte, **kein Tag, kein Release**) | `draft`.
  Jobs: Pre-flight (Versionen, Skript-Tests, Release Notes) → Pakete je OS (macOS universal dmg/app, Windows
  msi/NSIS, Linux deb/rpm/AppImage auf ubuntu-22.04) mit `scripts/collect-packages.mjs` (erwartete Arten, SHA-256,
  Zusammenfassung) und OS-Prüfungen → `SHA256SUMS.txt`. Der MCP-Sidecar (018 E18) wird vor `tauri-action` mit
  `scripts/mcp-sidecar.mjs` gebaut und über `--config src-tauri/tauri.sidecar.conf.json` gebündelt.
- **E3 Signierung vorbereitet**: macOS-Secrets `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` (Notarisierung über `tauri-action`), Windows
  `WINDOWS_CERTIFICATE` + `WINDOWS_CERTIFICATE_PASSWORD` – alle optional, ohne baut der Workflow unsigniert.
  `src-tauri/entitlements.plist`: Hardened Runtime, `com.apple.security.files.user-selected.read-write`, sonst
  nichts (kein Netz außer der lokalen KI-Brücke 127.0.0.1 – App ohne Sandbox, wie bisher).
- **E4 Dateizuordnung `.icon`** – AppIconic ist **Editor mit Rang `Alternate`**, Icon Composer bleibt Standard:
  - macOS: `.icon` ist ein Ordner-Bundle. Tauri kennt kein `LSTypeIsPackage`, daher steht der Dokumenttyp in
    `src-tauri/Info.plist` (Tauri mischt sie in die erzeugte): `CFBundleTypeExtensions = [icon]`,
    `LSTypeIsPackage = true`, `CFBundleTypeRole = Editor`, `LSHandlerRank = Alternate`. **Kein** eigener
    UTI (`UTExportedTypeDeclarations`/`UTImportedTypeDeclarations`): Apples Bezeichner für `.icon` ist nicht
    öffentlich belegt (Suche ergab nur die App-Kennung `com.apple.iconcomposer`), ein geratener UTI könnte den von
    Icon Composer stören – konservativ wie beim Format (CLAUDE.md §4). Frage an Marc: `mdls -name
    kMDItemContentType x.icon` auf dem Mac, dann ggf. `LSItemContentTypes` nachtragen.
  - Windows: `bundle.fileAssociations` (`ext: icon`, Beschreibung „Icon Composer icon“) – `.icon` hat dort keinen
    anderen Besitzer, die Zuordnung darf Standard sein; MSI und NSIS tragen sie ein.
  - Linux: `MimeType=application/x-icon-composer` in der `.desktop`-Datei plus Mime-Definition
    `src-tauri/linux/app-iconic-mime.xml` (Glob `*.icon`, Unterklasse von `application/zip`) in deb/rpm, nach der
    Installation `update-mime-database`/`update-desktop-database` (Post-Install-Skripte). AppImage: keine Zuordnung.
- **E5 Dateien zur laufenden App**: macOS liefert Finder-Dateien als `RunEvent::Opened` (auch an die laufende App),
  Windows/Linux starten ein zweites Mal – `tauri-plugin-single-instance` (neue Abhängigkeit, offizielles Plugin,
  wie editlicious) reicht argv an die erste Instanz. Rein: `open_files::paths_from_args(args, cwd)` (Optionen und
  Nicht-`.icon` raus, relative Pfade gegen `cwd`, nur vorhandene). Verteilung: Hat das Startfenster `main` seinen
  Startpfad noch nicht abgeholt, bekommt es die erste Datei (Doppelklick startet die App: kein leeres Extra-Fenster),
  sonst je Datei ein neues Dokumentfenster; eine schon offene Datei holt ihr Fenster nach vorn (`showing`).
  Zweitstart ohne Datei holt nur das vorderste Fenster nach vorn.
- **E6 „Im Ordner zeigen“ statt Share**: Ein Share-Sheet bräuchte `NSSharingServicePicker` über objc2 und eine
  Fensterposition – zu viel für „optional“. Stattdessen nach dem Export ein Knopf **Show in Finder / Explorer /
  Files** in der Statuszeile (Aktion `file.revealExport`): Rust-Command `reveal_export(path)` zeigt nur einen
  Pfad, den **dieser Prozess gerade exportiert hat** (Liste in `ExportJobs`), mit `open -R` (macOS),
  `explorer /select,` (Windows) bzw. `xdg-open <Ordner>` (Linux) – keine beliebigen Pfade aus der WebView.
- **E7 About**: Version (aus `package.json` über Tauri), Repo-Link, Lizenz MIT, „Third-party licences“ öffnet
  den Text der mitgelieferten `THIRD-PARTY-NOTICES.txt` in einem Dialog (Rust liest die Ressource, Command
  `third_party_notices`). Das Icon-Set aus 013 bleibt mit eigener Zeile.

## Tests

- `scripts/*.test.mjs` (Version, Release Notes, Lizenzhinweise, Lizenzbericht, Paketsammlung).
- Rust: `paths_from_args` (Optionen, relative Pfade, Nicht-`.icon`, fehlende, Ordner-Bundle), Verteilung auf
  Startfenster/neue Fenster (`DocWindows::offer_start_path`), `reveal_export` nur für exportierte Pfade,
  `command_rules`.
- Angular: Export-Hinweis mit Knopf, `file.revealExport` nur nach einem Export aktiv; About zeigt die Hinweise.
- Ende-zu-Ende: Workflow `dry-run` auf GitHub für alle drei OS (Link im Bericht), dort `.deb`-Inhalt mit
  `.desktop` + Mime-XML und `Info.plist` mit `LSTypeIsPackage`/`Alternate` geprüft; Doppelklick auf dem Mac prüft
  Marc.

## Ergebnis

- Probelauf `dry-run` (Run 40492570092, https://github.com/krocon/app-iconic/actions/runs/40492570092): Pre-flight,
  Pakete für macOS, Windows und Linux und `SHA256SUMS.txt` grün. Der erste Linux-Versuch hing am apt-Spiegel
  (Schritt „Linux system dependencies“, Zeitlimit greift) – „Re-run failed jobs“ lief durch.
- Geprüft in der echten App (Xvfb, Linux): `.icon` aus argv öffnet im Startfenster; ein Zweitstart reicht seine Datei
  an die laufende Instanz (zwei Fenster, ein Prozess).

## Fragen an Marc

1. **Mac**: `mdls -name kMDItemContentType <datei>.icon` – welcher UTI steht dort? (Dann `LSItemContentTypes`.)
2. **Mac**: Nach Installation des dmg: „Öffnen mit › AppIconic“ für ein `.icon`, Icon Composer bleibt Standard?
3. Signier-Secrets anlegen, wenn signiert werden soll (Liste in `docs/release.md`).
