# Design 083: Automatische Sicherung und Wiederherstellung nach Absturz

> Prompt: [083-autosave-wiederherstellung.md](083-autosave-wiederherstellung.md) · Stand: 30.10.2026 · Baut auf 002
> (`assemble`, Bundle-Writer, `swap_into_place`), 003 (FilesService, Fenster, Schließen-Frage), 005 (Quit-Folge),
> 015 (Einstellungen), 033 (`UserPaths`), 080 (PNG-Assets als `dataUrl`), 082 (Startbildschirm, Muster
> `ai_core::thumbnails`)

## Belege

- Rust-Standardbibliothek `std::fs::File::try_lock` (stabil seit Rust 1.89, doc.rust-lang.org/std/fs/struct.File.html;
  der Abruf der Seite war in dieser Sitzung gesperrt – Angaben nach der Rust-Doku, das Verhalten im Container
  nachgeprüft): exklusive Sperre,
  auf Unix `flock(LOCK_EX | LOCK_NB)`, auf Windows `LockFileEx(LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY)`;
  die Sperre endet, wenn die Datei geschlossen wird – beim Prozessende (auch `kill -9`) schließt das Betriebssystem
  alle Dateien. Im Container geprüft: nach `kill -9` ist die Sperre frei, der Schnappschuss wird angeboten.
- Keine Plattform- oder `.icon`-Regel betroffen: der Schnappschuss ist ein gewöhnliches Bundle, wie Speichern es
  schreibt (002 E6), und liegt nie neben dem Original.

## Entscheidungen

- **E1 Ort und Namen** (`ai_core::recovery`): `<app_config_dir>/recovery/` – dasselbe Verzeichnis wie `settings.json`,
  `recent.json`, `thumbnails/` (082). Je Schnappschuss ein Ordner `<id>/` mit `snapshot.icon/` (Bundle) und
  `meta.json { version, id, path, format, window, savedAt, pid }`. Rust berechnet den Ordner; die WebView bekommt und
  schickt **nur Ids** (`<16 hex>-<n>`, streng geprüft), nie einen Pfad – daher auch kein `allow_tree` (die WebView liest
  nichts aus dem Ordner direkt; Lesen und Schreiben machen die Commands).
- **E2 Atomar** („Speichern ist heilig“): Schnappschuss in einem versteckten Nachbarordner `.<id>.tmp-<pid>-<n>` bauen –
  erst das Bundle (derselbe `write_bundle` wie Speichern), **`meta.json` zuletzt** –, dann mit `swap_into_place` an
  seinen Platz (altes daneben, neues hinein, altes löschen). Gezählt wird nur ein Ordner mit Id-Namen, lesbarer
  `meta.json` (deren `id` = Ordnername) und `snapshot.icon/icon.json`. Ein abgebrochener Schreibvorgang hinterlässt
  höchstens einen versteckten Rest, der nie gelistet und beim nächsten Listen aufgeräumt wird (Test mit Haken vor
  `meta.json`, auch über einen bestehenden Schnappschuss: der alte bleibt unverändert).
- **E3 Eigentum über Sperrdateien** (mehrere Fenster/Instanzen): jeder App-Prozess ist eine **Instanz** mit zufälliger
  Id und einer Sperrdatei `<instanz>.lock` (Inhalt: Prozess-Id, nur zur Information), die er mit `try_lock` hält,
  solange er lebt. Schnappschuss-Ids beginnen mit der Instanz-Id; jedes Fenster bekommt eigene Ids (Zähler je Instanz),
  `meta.window` nennt das Fenster. „Instanz lebt“ = Sperre nicht zu bekommen; fehlt die Datei oder ist die Sperre frei,
  ist sie weg (Absturz, `kill -9`, Stromausfall). Fremde lebende Instanzen werden nie angefasst (weder gelistet noch
  übernommen noch gelöscht). Die Sperre ist robuster als eine Prozess-Id allein (Wiederverwendung von Pids nach
  Neustart). Die Instanz entsteht erst mit dem ersten Schnappschuss (keine Datei, solange nichts zu sichern ist).
- **E4 Zeitsteuerung** (`RecoveryService`, je Fenster): solange das Dokument geändert ist, startet die **erste**
  Änderung nach dem letzten Schnappschuss einen Zeitgeber von `recovery.interval` Sekunden; weitere Änderungen
  fahren mit (kein Neustart – sonst gäbe es bei Dauerarbeit nie einen Schnappschuss). Läuft gerade eine Geste
  (Ziehen), wartet er 1 s weiter. Ändert sich das Dokument während des Schreibens, folgt der nächste Zeitgeber.
  Geschrieben wird wie Speichern: `IconDocument.saveRequest` (unveränderte Assets nur mit Namen aus der Sitzung des
  Pfads, geänderte SVGs als Text, PNGs als `dataUrl` – 080), Rust `assemble` → `recovery::write`. Fehler sind still
  (der nächste Zeitgeber versucht es wieder). Größe begrenzt auf 256 MiB (= `Limits::max_total`) → `too_large`.
- **E5 Angebot beim Start**: nach dem Start des Fensters (Datei, Startbildschirm oder leeres Dokument, 082 E1) fragt
  `list_recovery(atStart: true)` – nur das **erste Fenster des Prozesses** bekommt die Liste (Rust-Merker), weitere
  Fenster nicht. Gibt es Schnappschüsse verschwundener Instanzen, öffnet sich der Dialog `recovery` **über** dem
  Startbildschirm/Dokument (Modal: verträgt sich mit beiden Einstellungen von `startup`; der Startbildschirm
  verschwindet von selbst, sobald das wiederhergestellte Dokument im Fenster ist – 082 E2). Je Eintrag Name (oder
  „Unbenannt“), Ort (oder „Nie gesichert“), Zeit der letzten Kopie, „Wiederherstellen“ und „Verwerfen“; „Später“
  schließt (die Schnappschüsse bleiben für den nächsten Start und für **File › Recover Unsaved Documents…**,
  Aktion `file.recover`, für die KI gesperrt wie alle `file.`-Aktionen). Fokus auf dem ersten „Wiederherstellen“;
  nach „Verwerfen“ wandert er zum nächsten Knopf. Wiederherstellen öffnet in **diesem** Fenster (fragt wie „Neu“
  nach ungesicherten Änderungen; abgebrochen bleibt der Schnappschuss unberührt angeboten) und schließt den Dialog;
  für ein weiteres Dokument ein neues Fenster und dort File › Recover….
- **E6 Wiederherstellen** (`open_recovery(id)`): nur ein Schnappschuss einer verschwundenen Instanz; er wird per
  `rename` **übernommen** (neue Id dieser Instanz, `meta.json` neu) – ein zweites Fenster oder ein zweiter Prozess,
  der gleichzeitig greift, bekommt `recovery_unavailable`. So schützt er das wiederhergestellte Dokument weiter, bis
  es gesichert oder verworfen wird. Das Dokument öffnet mit dem **Originalpfad** als **geändertes** Dokument
  (`DocumentStore.markUnsaved`: Speicherpunkt unerreichbar; `forgetSaved`: beim Speichern gehen alle Assets mit
  Inhalt – die Datei auf der Platte kann älter sein); `pristine` ist dann `false` (Öffnen ersetzt es nicht still).
  Nie gesicherte Dokumente kommen „Unbenannt“ zurück. **Pfadfreigabe:** der Originalpfad wird mit
  `UserPaths::allow_str` freigegeben – er war ein offenes Dokument des Nutzers (beim Schreiben des Schnappschusses
  musste er bereits vertraut sein: `write_recovery` prüft ihn mit `allowed`, 033), und Speichern muss ihn ohne Dialog
  schreiben können. Der Schnappschuss wird Sitzung des Pfads (für Zusatzdateien des Bundles), außer die Datei ist in
  einem anderen Fenster offen.
- **E7 Aufräumen**: nach **Speichern** (das Dokument ist wieder sauber → `discard`), nach **„Nicht speichern“** und
  jedem anderen Schließen (`FilesService.onClosing`, abgewartet vor `closeWindow`; ein Schreibvorgang, der danach
  zurückkommt, wird verworfen), wenn ein **anderes Dokument** ins Fenster kommt (Neu, Öffnen, Vorlage,
  Wiederherstellen), beim **regulären Beenden** (`RunEvent::Exit`: alle Schnappschüsse und die Sperrdatei dieser
  Instanz). Beim Listen räumt `prune` Reste verschwundener Instanzen auf (versteckte Temp-/Alt-Ordner, Ordner ohne
  gültige `meta.json`, Sperrdateien); vollständige Schnappschüsse bleiben, bis der Nutzer sie verwirft oder übernimmt.
  Fremdes im Ordner bleibt liegen.
- **E8 Einstellung** `recovery.interval` (Sekunden, Standard 30, 0 = aus, höchstens 3600; Bruchzahlen, Negatives,
  Text → Standard): Rust `RecoverySettings` + `sanitize`, TS `settings-rules`, `testdata/settings-cases.json`,
  Einstellungen › Allgemein mit Hinweis. Aus = keine neuen Schnappschüsse; das Angebot beim Start bleibt.
  **Browser-Modus**: Schnappschüsse im `localStorage` (`FakeRecoveryApi`, jede Seite = neue Instanz, ein Reload = der
  Absturz); ohne gespeicherte Einstellungen `interval: 0`, damit bestehende E2E-Tests keine Angebote sehen.

## Verträge

Rust (`ai-core::recovery`, `recovery::instance`):

```rust
pub const DIR_NAME: &str = "recovery"; pub const META_FILE: &str = "meta.json";
pub const ICON_DIR: &str = "snapshot.icon"; pub const MAX_BYTES: u64 = 256 * 1024 * 1024;
pub struct Meta { version, id, path: Option<String>, format: IconFormat, window, saved_at: u64, pid: u32 }
pub struct Instance;  // acquire(dir), id(), next_id(), owns(id), release()
pub fn is_valid_id(id) -> bool; pub fn instance_of(id) -> Option<&str>;
pub fn alive(dir, instance, own: Option<&str>) -> bool;
pub fn write(dir, &Meta, IconFile) -> Result<(), FsError>;
pub fn read_meta(dir, id) -> Option<Meta>; pub fn list(dir, own) -> Vec<Meta>;   // nur Verschwundene, neueste zuerst
pub fn read(dir, id) -> Result<(Meta, IconFile), FsError>;
pub fn adopt(&Instance, id) -> Result<(Meta, IconFile), FsError>;            // rename auf eigene Id
pub fn discard(dir, id) -> Result<bool, FsError>; pub fn prune(dir, own) -> usize;
```

Commands (`src-tauri/src/recovery_commands.rs`, async, `spawn_blocking`; State `RecoveryState`):

- `write_recovery(id?, path?, from?, format, iconJson, assets) -> String` – `path` geprüft (`allowed`), `id` nur eine
  eigene (`not_allowed`), sonst neue; unveränderte Assets aus der Sitzung von `from`/`path`.
- `list_recovery(atStart) -> RecoveryEntryDto[] { id, path, name, location, savedAt }` – räumt auf (`prune`).
- `open_recovery(id) -> RecoveredDto { id, document: IconDocumentDto }` – übernimmt, Pfad freigegeben.
- `discard_recovery(id) -> bool` – eigene oder verschwundene Instanz, sonst `not_allowed`.
- Neuer Fehlercode `recovery_unavailable` (Rust `FsErrorCode`, TS `FsErrorCode`, `describeFsError` en/de).

Frontend:

- `RecoveryApi` (`core/recovery/`): `write(req)`, `list(atStart)`, `open(id)`, `discard(id)`; `TauriRecoveryApi`;
  Fake `FakeRecoveryApi(files, storage?)` mit den Regeln wie Rust (`alive`, `plant`, `writes`, `discards`).
- `RecoveryService` (`features/recovery/`): `sync(...)` (Effekt), `pending`, `currentId`, `stop()`, `offerAtStart()`,
  `show()`, `restore(id)`, `discard(id)`, `entries`; `RecoveryDialog` (`DialogKind` `recovery`),
  `registerRecoveryActions` (`file.recover`).
- `FilesService.restore(load)`, `onClosing(fn)`; `DocumentStore.markUnsaved()`, `UndoService.markUnsaved()`,
  `IconDocument.forgetSaved()`; `pristine` schließt geänderte Dokumente aus. Fragen der Datei-Aktionen in
  `files/file-questions.ts` (FilesService blieb unter 400 Zeilen).

## Tests

- Rust (`recovery/tests.rs`, `tempfile`): Id-Prüfung; Roundtrip beider Fixtures (Bundle byte-gleich, Format aus der
  Meta); PNG-Asset als `dataUrl` wie Speichern; abgebrochener Schreibvorgang (Haken vor `meta.json`) hinterlässt
  nichts Gelistetes und lässt einen bestehenden Schnappschuss unverändert, Reste eines toten Prozesses werden
  aufgeräumt; nur Verschwundene werden gelistet (zweite Instanz im selben Prozess = lebend), `release` beim Beenden;
  `adopt` einmalig, nicht für Lebende, nicht zweimal; Größengrenze; fremde Dateien bleiben, falsche Meta zählt nicht.
  `recovery_commands`: Angebot einmal je Prozess, Instanz lazy; Befehle async; `write_recovery` im Pfadtest.
  Settings-Fälle (gemeinsame Tabelle).
- Vitest: `RecoveryService` mit Fake-Timern (30 s nach der ersten Änderung, nicht vorher, nicht sauber, Mitfahrer,
  Ersetzen derselben Id, Intervall 0/5, Geste, Fehler still), Aufräumregeln (Speichern, „Nicht speichern“, Abbruch
  lässt ihn stehen, Dokumentwechsel, Schreibvorgang nach dem Speichern), Angebot (einmal je App, neueste zuerst,
  Lebende nicht, Wiederherstellen mit Pfad/Format/geändert/nicht `pristine`, Speichern mit allen Assets, unbenannt,
  Frage bei Änderungen, vergebener Schnappschuss → Fehler), `RecoveryDialog` (Rollen, Namen, Fokus, Knöpfe),
  `TauriRecoveryApi` (Argumentnamen), Settings-Fälle.
- Playwright (`e2e/recovery.spec.ts`): Datei ändern → Schnappschuss → Reload (= Absturz) → Angebot mit Fokus auf
  „Wiederherstellen“ → Änderung im Dokument und auf der Zeichenfläche, Pfad und „geändert“ → Speichern räumt auf;
  unbenanntes Dokument → „Später“ → File › Recover → Verwerfen, Fokus bleibt im Dialog.
- Echte App (Debug-Build, Xvfb): Kopie von `camscanner.icon` per argv öffnen, Knoten löschen, Schnappschuss nach 2 s,
  `kill -9`, Neustart → Angebot → Enter → Dokument „demo.icon •“ ohne den gelöschten Knoten; ⌘S schreibt die Datei
  und entfernt den Schnappschuss; erneut ändern, ⌘W → „Nicht speichern“ → Fenster zu, App beendet, Ordner leer.

## Fragen an Marc

1. Intervall-Standard 30 s „nach der ersten Änderung“ – passt das, oder lieber kürzer (z. B. 10 s)?
2. Mehrere Schnappschüsse nach einem Absturz: jetzt einer je Fenster per „Wiederherstellen“, weitere über ein neues
   Fenster und File › Recover…. Lieber „Alle wiederherstellen“ (je ein Fenster)?
3. Schnappschüsse verschwundener Instanzen bleiben, bis man sie verwirft – sollen sie nach einer Frist (z. B. 30 Tage)
   von selbst gehen?
4. **Mac/Windows**: Absturz-Test mit „Sofort beenden“ (Aktivitätsanzeige/Task-Manager) – Angebot beim Neustart, Ort
   `~/Library/Application Support/io.github.krocon.appiconic/recovery` bzw. `%APPDATA%\…\recovery`.
