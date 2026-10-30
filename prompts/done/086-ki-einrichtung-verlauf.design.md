# Design 086: KI-Anbindung mit einem Klick und KI-Verlauf

> Prompt: [086-ki-einrichtung-verlauf.md](086-ki-einrichtung-verlauf.md) · Stand: 30.10.2026 · baut auf 018
> (Sidecar `app-iconic-mcp`, Brücke, `McpStore`/`McpTools`, Undo-Gruppe je Aufruf), 015 (Einstellungen), 033
> (Pfadschutz), 073 (nicht-modales Popover `DialogService.popover/anchor`)

## Belege

- **Claude Desktop** – modelcontextprotocol.io, „Connect to local MCP servers“
  (https://modelcontextprotocol.io/docs/develop/connect-local-servers): Settings › Developer › Edit Config; Datei
  `claude_desktop_config.json` unter **macOS** `~/Library/Application Support/Claude/`, **Windows**
  `%APPDATA%\Claude\`, **Linux** `~/.config/Claude/`. Format `{ "mcpServers": { "<name>": { "command": "…",
  "args": […], "env": {…} } } }`; Pfade absolut; nach dem Speichern Claude Desktop **ganz beenden und neu starten**.
- **Cursor** – cursor.com/docs, „Model Context Protocol (MCP)“ (https://cursor.com/docs/context/mcp): global
  `~/.cursor/mcp.json` (alle Systeme, `~` = Benutzerordner), je Projekt `.cursor/mcp.json`. Format
  `{ "mcpServers": { "<name>": { "type": "stdio", "command": "…", "args": […], "env": {…} } } }`; `command` muss im
  `PATH` liegen oder ein voller Pfad sein; `type` ist für stdio als nötig beschrieben (die Beispiele lassen es weg).
- **MCP-Handshake** – Spezifikation „Lifecycle“: Client `initialize` → Server antwortet mit `protocolVersion`,
  `capabilities`, `serverInfo` → Client `notifications/initialized` → danach z. B. `tools/list`. Das Sidecar spricht
  2025-06-18, 2025-03-26, 2024-11-05 (018 E2).

## Entscheidungen

- **E1 Ziele = feste Liste in Rust** (`ai_core::mcp_clients`): `McpClient::ClaudeDesktop` (`"claudeDesktop"`) und
  `McpClient::Cursor` (`"cursor"`). Der Pfad wird **nur in Rust** aus Betriebssystem + Benutzerordner (+ `%APPDATA%`
  unter Windows) berechnet (`config_path(client, os, dirs)`, rein, getestet je OS). Die WebView schickt nur das Ziel
  (`target`), nie einen Pfad; die Commands nehmen kein Pfad-Argument an (Pfadschutz 033: nichts zu erlauben, nichts
  in `UserPaths`). Der berechnete Pfad wird zur Anzeige als opaker String zurückgegeben. Nur der globale Cursor-Ort
  (kein Projekt-Ordner – den kennt die App nicht).
- **E2 Eintrag:** Name **`app-iconic`** unter `mcpServers`; Claude Desktop `{ "command": "<sidecar>" }`, Cursor
  `{ "type": "stdio", "command": "<sidecar>" }` (Doku: `type` nötig). Gibt es den Eintrag schon, werden nur
  `command` (und bei Cursor `type`) gesetzt, **seine übrigen Felder** (`args`, `env`, eigene) bleiben.
- **E3 Zusammenführen** (rein, `merged(text, client, sidecar)` / `removed(text)`): Datei als JSON lesen
  (`serde_json` mit `preserve_order` wie `icon.json`, 002 E4) → **andere Server, unbekannte Felder und die
  Reihenfolge bleiben**; neue Schlüssel kommen ans Ende. Ausgabe mit zwei Leerzeichen eingerückt + Zeilenende (wie
  Claude Desktop sie schreibt) – die Einrückung einer anders formatierten Datei ändert sich, das zeigt die Vorschau.
  Leere/fehlende Datei = `{}`. **Kommentare, ungültiges JSON, kein Objekt oben, `mcpServers` kein Objekt →
  neuer Fehlercode `invalid_config`, nichts wird geschrieben** (JSONC wäre ein eigener Parser; Claude Desktop liest
  ohnehin strenges JSON). Ist die Datei schon so, wie sie sein soll → „nichts zu tun“ (`after = null`), kein
  Schreiben. Entfernen nimmt nur `mcpServers.app-iconic` heraus; ein danach leeres `mcpServers` bleibt als `{}`.
  Grenze: Konfig-Datei ≤ 1 MiB (`too_large`).
- **E4 Vorschau → Bestätigung → Schreiben:** `mcp_setup_preview { target, remove }` liefert `before`/`after` (Text)
  und den Pfad; das UI zeigt ein **Zeilen-Diff** (rein, `line-diff.ts`, LCS) und erst „Apply“ ruft
  `mcp_install { target, expected }` bzw. `mcp_uninstall { target, expected }`. `expected` = der `before`-Text der
  Vorschau; weicht die Datei inzwischen ab → **neuer Fehlercode `config_changed`** (die Vorschau wird neu geholt) –
  geschrieben wird nur, was der Nutzer gesehen hat.
- **E5 Schreiben ist heilig:** Ordner anlegen, wenn er fehlt (`create_dir_all`); vorhandene Datei vorher als
  **Sicherungskopie** `<name>.app-iconic-<Unix-Sekunden>.bak` daneben kopieren (je Schreiben eine, keine wird
  überschrieben), dann **atomar** (`fs_atomic::write_atomic`: Temp + rename). Das Ergebnis nennt den Pfad der
  Sicherung. Unix: Rechte der alten Datei werden übernommen (die Datei kann Schlüssel in `env` anderer Server
  enthalten); neue Dateien 0600.
- **E6 Sidecar-Pfad (wie 018 E17):** `current_exe().parent()/app-iconic-mcp[.exe]`. Im Release legt
  `bundle.externalBin` es genau dorthin (macOS `…/Contents/MacOS/`, Linux `/usr/bin/`, Windows Programmordner); im
  Dev/Debug (`pnpm tauri dev`, `tauri build --debug`) ist die App `src-tauri/target/debug/app-iconic`, und
  `pnpm mcp:sidecar:dev` baut das Sidecar daneben – **eine Regel für beides**, kein Pfad aus der WebView, keine
  Umgebungsvariable. Fehlt es → **neuer Fehlercode `sidecar_missing`**; Einrichten und Test sind dann gesperrt, der
  Hinweis nennt im Debug-Build `pnpm mcp:sidecar:dev`, im Release „neu installieren“ (`McpInfo.debug`).
- **E7 Status je Ziel** (`mcp_clients()` → `McpClientStatus[]`): `path`, `state` = `absent` (keine Datei), `missing`
  (Datei ohne Eintrag), `installed` (Eintrag zeigt auf dieses Sidecar), `other` (Eintrag zeigt woanders hin, z. B.
  alte Installation), `invalid` (E3-Fehler). Der Tab zeigt das als Satz und passt die Knöpfe an
  („Set up…“/„Update…“, „Remove…“ nur mit Eintrag).
- **E8 Verbindungstest** (`mcp_test()` → `McpTestResult`, Logik in `ai_mcp::probe`, ohne Tauri): Sidecar als
  Kindprozess mit stdin/stdout-Rohren starten, `initialize` (2025-06-18) → `notifications/initialized` →
  `tools/list` → `tools/call list_documents` (prüft die Brücke zur App: `not_running` heißt „AI control aus“). Lesen
  in einem Thread mit **Zeitlimit 5 s** je Schritt, danach Kind beenden (`kill` + `wait`). Ergebnis: `ok`, erreichter
  Schritt (`start`/`initialize`/`tools`/`app`), Fehlercode, Server-Name/-Version, Protokoll, Anzahl Tools, ob die
  App antwortet und wie viele Dokumente. Das UI zeigt einen Satz („Connection works: app-iconic 0.1.0, 20 tools, 1
  document.“ / „The helper program works, but AI control is off.“ / „The helper program did not answer in time.“).
- **E9 KI-Verlauf nur im Speicher** (`McpStore.history`, rein: `mcp-history.ts`): die letzten **50** Aufrufe des
  Fensters (Root-Service je Fenster) mit Zeit, Werkzeug (Name im Fenster: `run_action`, `insert_svg`, `get_tree` …),
  Kurzbeschreibung (Aktion-Id, Command-Typ, Länge des Markups, Format, Pfad als opaker String …), Ergebnis
  (`ok`/Fehlercode), Dauer und – bei Schreibaufrufen – die **Id des Undo-Schritts** (`UndoService` bekommt
  `topId` im Zustand, `DocumentStore.undoTopId`). Aufgezeichnet wird in `McpStore.execute` (Brücke **und**
  Test-Hook): Store + `undoTopId` vorher/nachher; neue Id im selben Store = Eintrag mit Undo-Gruppe. Nichts wird
  gespeichert oder geloggt; Inhalte (Markup, Commands) erscheinen nicht, nur ihre Art.
- **E10 „Rückgängig“ im Verlauf** nur für den Eintrag, dessen Undo-Schritt **gerade oben** liegt (gleicher Store,
  `undoTopId === entry.undoId`) – dann führt der Knopf `edit.undo` aus (eine Undo-Gruppe = ein Schritt, 018 E10).
  Ältere Einträge zeigen keinen Knopf (sonst würde man Nutzer-Schritte dazwischen mit zurücknehmen). Nach dem Undo
  rückt ggf. der nächste KI-Eintrag nach oben und bekommt den Knopf.
- **E11 Popover am Badge:** Der „AI“-Badge erscheint, solange verbunden **oder** der Verlauf Einträge hat (dann
  gedämpft, „AI history“); Klick öffnet/schließt den Verlauf (Aktion `mcp.history`, Dialog-Art `aiHistory` in
  `POPOVER_KINDS`, Anker = Badge, 073). Im Popover: Liste (neueste oben, `role="list"`, Zeit `HH:MM:SS`),
  „Disconnect AI“ (wie bisher, wenn verbunden), „Clear“ (`mcp.clearHistory`). Esc schließt, Fokus zurück zum Badge.
  Bisher trennte ein Klick auf den Badge sofort – das steht jetzt im Popover (eine Trennung aus Versehen fällt weg).
- **E12 Aktionen:** `mcp.history` (Popover), `mcp.clearHistory`, `mcp.test` (Verbindungstest, Ergebnis im Tab
  bzw. als Rückgabe). Einrichten/Entfernen haben **keine** Aktion: sie brauchen die Bestätigung des Diffs im UI.
  Alle `mcp.*` sind für die KI gesperrt (018 E12, Präfix).
- **E13 UI:** Der Abschnitt „AI control“ der Einstellungen wird eine eigene Komponente `McpSetup`
  (`features/mcp/mcp-setup.ts` + `.html`, Logik `McpSetupStore` je Komponente); `settings-dialog.html` wird kürzer.
  Ziel als Radiogruppe, Status-Satz, Pfad als `<code>`, Knöpfe; Vorschau als `<pre>` mit `+`/`−`-Zeilen
  (Farbe **und** Zeichen, nicht nur Farbe), „Apply“/„Cancel“. Ergebnis als `role="status"` inkl. „Restart Claude
  Desktop“/„Cursor lädt neu“-Hinweis und Sicherungspfad.

- **E14 Folgefehler aus 082 (im Ende-zu-Ende-Lauf gefunden):** Mit dem Startbildschirm (Standard `startup:
  startScreen`) hat ein Fenster zunächst **kein** Dokument; `new_document` öffnete dann ein neues Fenster, das
  ebenfalls nur den Startbildschirm zeigte, und scheiterte mit `unknown_document` – `scripts/mcp-e2e.mjs` lief nicht
  durch. Jetzt gilt ein Fenster ohne Dokument als wiederverwendbar (`pristine_window`), und `new_document` ruft im
  Fenster das neue Fenster-Werkzeug `ensure_document` (leeres Dokument, wenn keins da ist; der Startbildschirm geht
  wie bei „New“ zu). Router-Test mit Fake + Vitest. Außerdem erwartete das Skript noch 19 Tools (seit 084: 20).

## Verträge

```rust
// ai-core::mcp_clients (rein + Datei)
#[serde(rename_all = "camelCase")] pub enum McpClient { ClaudeDesktop, Cursor }
pub enum Os { Mac, Windows, Linux }  pub fn current_os() -> Os;
pub struct Dirs { pub home: PathBuf, pub appdata: Option<PathBuf> }
pub const SERVER_NAME: &str = "app-iconic";  pub const MAX_CONFIG: u64 = 1 << 20;
pub fn config_path(c: McpClient, os: Os, d: &Dirs) -> PathBuf;
pub fn read(path) -> Result<Option<String>, FsError>;               // None = keine Datei; > 1 MiB → too_large
pub fn state(text: Option<&str>, sidecar: Option<&str>) -> ClientState; // absent|missing|installed|other|invalid
pub fn merged(text: Option<&str>, c, sidecar: &str) -> Result<Option<String>, FsError>; // None = schon so
pub fn removed(text: Option<&str>) -> Result<Option<String>, FsError>;               // None = nichts da
pub fn write(path, expected: Option<&str>, text: &str) -> Result<Option<PathBuf>, FsError>; // Sicherung
// error.rs: InvalidConfig, ConfigChanged, SidecarMissing
// ai-mcp::probe
pub struct Probe { ok, step: ProbeStep, code: Option<String>, server: Option<String>, version: Option<String>,
                   protocol: Option<String>, tools: usize, app: bool, documents: Option<usize> }
pub fn probe(program: &Path, step_timeout: Duration) -> Probe;
// app: mcp_setup_commands.rs (async + spawn_blocking)
mcp_clients() -> Vec<McpClientStatus { target, path, state }>
mcp_setup_preview(target, remove: bool) -> McpSetupPlan { target, path, before: Option<String>, after: Option<String> }
mcp_install(target, expected: Option<String>) -> McpSetupDone { path, backup: Option<String> }
mcp_uninstall(target, expected: Option<String>) -> McpSetupDone
mcp_test() -> Probe
McpInfo += debug: bool
```

```ts
// core/mcp: McpApi += clients(), preview(target, remove), install(target, expected), uninstall(target, expected), test()
type McpTarget = 'claudeDesktop' | 'cursor';
// features/mcp/mcp-history.ts (rein)
interface McpHistoryEntry { seq; at; tool; detail: string; ok: boolean; code: string | null; ms; undoId: number | null }
describeCall(tool, args): string; pushEntry(list, e, max = 50); canUndo(e, topId): boolean
// features/mcp/line-diff.ts (rein): lineDiff(a, b): { kind: 'same' | 'add' | 'del'; text }[]
// McpStore += history: Signal<entries>, clearHistory(), undoable(entry), undoEntry(entry)
// DocumentStore += undoTopId: Signal<number>
```

## Tests

- Rust `mcp_clients`: Pfade je OS (Claude: mac/Windows mit und ohne `%APPDATA%`/Linux; Cursor), Zusammenführen in
  eine Datei mit fremden Servern + unbekannten Feldern + eigener Reihenfolge (alles bleibt, Reihenfolge gleich),
  bestehender Eintrag mit `args`/`env` behält sie, Cursor mit `type`, schon eingerichtet → `None`, Kommentare /
  ungültig / Array oben / `mcpServers` als String → `invalid_config` und Datei unverändert, Entfernen (anderer Server
  bleibt, nichts da → `None`), `write`: Ordner neu, Sicherung mit altem Inhalt, `expected` abweichend →
  `config_changed`, Unix-Rechte; Status-Fälle.
- Rust `ai_mcp::probe` (Integrationstest gegen das echte Binary `CARGO_BIN_EXE_app-iconic-mcp` mit Endpunkt-Datei,
  die es nicht gibt): Handshake ok, 20 Tools, App nicht erreichbar (`not_running`); Programm fehlt → Schritt
  `start`; `/bin/cat` (Unix) → falsche Antwort; stummes Programm (`sleep`) → `timeout` nach dem Zeitlimit.
- Command-Regel (async) für die neue Datei.
- Vitest: `mcp-history` (Beschreibung je Tool, Kappung, Undo nur oben), `line-diff`, `McpStore` (Verlauf aus
  Brückenaufrufen, Fehler, Undo-Id nur bei neuem Schritt, Undo-Knopf wandert), `McpHistoryPopover` (Liste, Undo,
  Clear, Disconnect), `McpSetup` mit Fake (Status, Vorschau-Diff, Apply schreibt, `invalid_config`-Meldung,
  `config_changed` → neue Vorschau, Entfernen, Test-Ergebnis, Sidecar fehlt), `fs-error` neue Codes, Katalog.
- Playwright `e2e/mcp-history.spec.ts` (Browser-Modus): KI-Aufrufe über den Test-Hook → Badge → Popover listet sie,
  „Undo“ nimmt den letzten zurück; Einrichten im Settings-Tab mit Fake (Diff sichtbar, Apply).
- Echte App (Xvfb): Debug-Build + `pnpm mcp:sidecar:dev`, temporäres `HOME`/`XDG_CONFIG_HOME`, AI control an,
  `scripts/mcp-e2e.mjs` → Verlauf zeigt die Aufrufe (Screenshot); Einrichten/Test im temporären HOME.

## Fragen an Marc

1. **Windows/Claude Desktop aus dem Microsoft Store (MSIX)**: solche Installationen lesen die Konfiguration
   möglicherweise aus einem virtualisierten Ordner statt `%APPDATA%\Claude`. Die App schreibt nach der offiziellen
   Doku (`%APPDATA%`) – bitte auf einem Windows-Rechner prüfen, ob Claude Desktop den Eintrag sieht.
2. **macOS**: Einrichten für Claude Desktop und Cursor einmal echt durchspielen (Pfad
   `/Applications/AppIconic.app/Contents/MacOS/app-iconic-mcp`, Neustart von Claude Desktop) – im Container nicht
   prüfbar.
3. Cursor nur global (`~/.cursor/mcp.json`) – auch je Projekt (`.cursor/mcp.json`, Ordner per Dialog) gewünscht?
4. Weitere Ziele (z. B. Windsurf, VS Code `mcp.json` mit `servers` statt `mcpServers`, Claude Code `~/.claude.json`)?
   Claude Code bleibt bei der kopierbaren Zeile `claude mcp add …`.

## Fortschritt

- [x] Design
- [x] Rust: `ai_core::mcp_clients` (11 Tests), `ai_mcp::probe` (4 Unit-Tests + Integrationstest gegen das echte
      Binary), `mcp_setup_commands.rs` (5 Commands, Regel-Test: async, kein Pfad-Argument), Fehlercodes
      `invalid_config`/`config_changed`/`sidecar_missing`, `McpInfo.debug`, Router E14
- [x] Frontend: `McpApi` + Fake (Regeln wie Rust), `mcp-history`, `line-diff`, `McpStore` (Verlauf, Undo-Sprung,
      Test), `UndoState.topId`/`DocumentStore.undoTopId`, `McpBadge` (aus `app.ts`, 400 → 387 Zeilen),
      `McpHistoryPopover`, `McpSetup` + `McpSetupStore` (aus `settings-dialog.html`), Aktionen `mcp.history`,
      `mcp.clearHistory`, `mcp.test`, `ensure_document`
- [x] Playwright `e2e/mcp-history.spec.ts` (2 Tests); echte App unter Xvfb mit temporärem `HOME`: Debug-Build +
      `pnpm mcp:sidecar:dev`, `scripts/mcp-e2e.mjs` komplett grün (nach E14), danach zeigt der Badge-Popover alle
      Aufrufe (Zeit, Werkzeug, Aktion, Ergebnis), „Undo“ nahm den letzten KI-Schritt zurück und wanderte zum vorigen;
      Settings › AI control: Claude-Desktop-Konfiguration mit fremdem Server und eigenem Feld → Diff, Apply schrieb
      zusammengeführt (Reihenfolge, Rechte 644 erhalten) + `.bak`; „Remove…“-Vorschau; „Test Connection“ →
      „Connection works: app-iconic 0.1.0, 20 tools, 1 document.“ Gefunden und behoben: lange Pfade verbreiterten das
      Panel (CSS), Undo-Knopf an einem `edit.undo`-Eintrag (jetzt nur neue Schritte, `id > top`)
- [x] Doku

## Abweichungen und Grenzen

- Der Badge öffnet jetzt den Verlauf; „Disconnect AI“ steht im Popover und weiter in den Einstellungen (vorher trennte
  ein Klick auf den Badge sofort).
- Einrichten/Entfernen haben keine Aktion (E12) – sie brauchen die Bestätigung des Diffs; die KI darf `mcp.*` ohnehin
  nicht.
- Die Ausgabe wird mit zwei Leerzeichen eingerückt; eine anders formatierte Datei ändert dadurch ihre Einrückung (die
  Vorschau zeigt das). Inhalte, Reihenfolge und fremde Felder bleiben.
- Echt geprüft nur unter Linux (Xvfb, temporäres `HOME`); macOS/Windows-Pfade sind aus der Doku belegt und getestet,
  aber nicht auf echten Rechnern (Fragen 1, 2).
