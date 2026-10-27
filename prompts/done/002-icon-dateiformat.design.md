# Design 002: `.icon`-Dateiformat in Rust (verlustfrei)

Status: umgesetzt · Datum: 26.10.2026

## Belege für das Format

- `testdata/fixtures/camscanner.icon/icon.json` (echte Icon-Composer-Datei).
- Icon-Composer-Datei aus einem öffentlichen Patch (pve_flutter_frontend, Proxmox-Mailingliste, 2025): zusätzlich
  `blur-material: null`, `specular` (Gruppe), `glass`, `hidden`, `position { scale, translation-in-points }`,
  `image-name-specializations [{ appearance?, value }]`, `blend-mode-specializations` (Layer), `shadow.kind`
  `layer-color`, `fill: "system-light"`. **Ohne** `image-name` – der Name steht dort nur in der Specialization.
- Beide Dateien: Schlüssel alphabetisch sortiert, 2 Leerzeichen Einrückung, `"key" : value`, kein Zeilenumbruch am
  Dateiende – das ist `JSONEncoder` mit `.prettyPrinted` + `.sortedKeys`.

## Entscheidungen

- **E1 `serde_json::Value` ist die Wahrheit, `IconJson` eine typisierte Sicht.** Structs mit
  `#[serde(flatten)] extra` auf jeder Ebene (Dokument, Gruppe, Layer, Shadow, Translucency, Plattformen). Typisiert
  sind nur belegte Felder: `fill` (bleibt `Value`), `groups`, `layers[].{image-name?, name?, opacity?}`,
  `shadow {kind?, opacity?}`, `translucency {enabled?, value?}`, `supported-platforms {circles?, squares?}`
  (`circles`/`squares` als `PlatformSet` = String **oder** Liste, weil nur `"shared"` und `["watchOS"]` belegt
  sind). Alles Weitere (Specializations, `glass`, `hidden`, `position`, `specular`, `blur-material` …) wird nur
  durchgereicht. Geschrieben wird immer der `Value`, nie die Sicht (die Sicht würde die Schlüsselreihenfolge ändern).
  Die Sicht prüft beim Öffnen die Struktur (falsche Typen bekannter Felder → `invalid_icon`) und liefert die
  `image-name`s für die Asset-Prüfung.
- **E2 Ausgabeformat = Icon Composer.** Eigener `serde_json::ser::Formatter` (`icon/json_format.rs`): 2 Leerzeichen,
  `" : "`, ganzzahlige Floats ohne `.0` (`1.0` → `1`), kein Zeilenumbruch am Ende, leere Container `[]`/`{}`
  (unbelegt). Test: Formatieren von `camscanner.icon/icon.json` ergibt die Datei byte-genau.
- **E3 Unverändert = byte-genau.** `save_icon` vergleicht das übergebene `iconJson` mit dem der Sitzung
  (`Value`-Gleichheit); ist es gleich, werden die Originalbytes geschrieben (auch wenn die Quelle anders formatiert
  war). Sonst wird der `Value` in seiner Reihenfolge formatiert (`preserve_order`).
- **E4 Schlüsselreihenfolge:** wie übergeben (Feature `preserve_order`); das Frontend behält die Reihenfolge des
  gelesenen Objekts. Neue Dokumente (`new_icon`) werden alphabetisch sortiert wie Icon Composer. Frage an Marc unten.
- **E5 Sitzungen je Pfad** im App-State (`IconSessions`, `Mutex<HashMap<String, IconFile>>`): `open_icon` legt die
  gelesene Datei ab, `save_icon` nimmt unveränderte Assets aus der Sitzung von `from` (Standard: `path`) und legt das
  Ergebnis unter `path` ab. „Speichern unter“ übergibt `from` = alter Pfad. `close_icon(path)` gibt die Sitzung frei.
  Die Zusammenführung (`icon::save::assemble`) liegt testbar in `ai-core`.
- **E6 Bundle-Tausch ohne Rename über einen bestehenden Ordner** (geht weder unter Windows noch unter Unix bei nicht
  leerem Ziel): neues Bundle als `.<name>.tmp-<pid>-<n>` daneben schreiben und `fsync`en → altes Ziel nach
  `.<name>.old-<pid>-<n>` umbenennen → neues an den Zielnamen → altes löschen. Scheitert der zweite Rename, wird das
  alte zurückbenannt. Damit gilt dieselbe Strategie auf allen Systemen (CI testet macOS, Windows, Linux). Zwischen
  den beiden Renames existiert der Zielname kurz nicht (kein echtes atomares Tauschen; macOS `renamex_np(RENAME_SWAP)`
  wäre möglich – Frage an Marc). Ein ZIP-Ziel, das bisher ein Ordner war (oder umgekehrt), läuft über denselben Weg;
  ZIP über bestehende Datei über `fs_atomic::write_atomic`.
- **E7 Grenzen** (`Limits`, für ZIP und Bundle-Ordner): ≤ 2 000 Einträge, ≤ 64 MiB je Datei, ≤ 256 MiB gesamt,
  Ordnertiefe ≤ 16. Geprüft werden die deklarierte **und** die tatsächlich gelesene Größe (`take(limit + 1)`, gegen
  ZIP-Bomben mit gelogenen Headern). Verstoß → `too_large`.
- **E8 Feindliche Einträge:** ZIP-Namen mit `..`, absoluten Pfaden oder Laufwerksbuchstaben (`enclosed_name() ==
  None`) → ganze Datei abgelehnt (`invalid_icon`); verschlüsselte Einträge oder unbekannte Kompression →
  `unsupported_icon`. Symlinks im Bundle werden nicht verfolgt, nicht übernommen und als Warnung `ignored_entry`
  gemeldet. Asset-Namen müssen ein einzelner Pfadbestandteil sein (kein `/`, `\`, NUL, `.`, `..`).
- **E9 Was ist ein Asset?** Direkte Kinder von `Assets/`, die nicht mit `.` beginnen. Alles andere (z. B.
  `Assets/.DS_Store`, `Assets/sub/x`, weitere Dateien im Bundle) ist eine „extra file“ und wird unverändert
  zurückgeschrieben. Leere Ordner gehen verloren. Art nach Endung (`.svg` → `svg`, `.png` → `png`, sonst `other`,
  Groß-/Kleinschreibung egal). SVG kommt als UTF-8-Text (BOM entfernt), PNG als `data:image/png;base64,…`,
  `other` ohne Inhalt. SVG, das kein UTF-8 ist → Warnung `unreadable_asset`, Text fehlt, Bytes bleiben erhalten.
- **E10 ZIP-Wurzelordner:** liegt `icon.json` nicht oben, aber genau einmal als `<X>.icon/icon.json`, ist
  `<X>.icon/` die Wurzel. Einträge außerhalb der Wurzel (z. B. `__MACOSX/`) bleiben beim ZIP→ZIP-Speichern erhalten,
  entfallen beim Wechsel ZIP→Bundle. Geschrieben wird mit derselben Wurzel; ein Bundle als ZIP bekommt keine Wurzel.
  Kompression Deflate; die Bytes der Einträge sind gleich, das ZIP selbst nicht byte-gleich (Zeitstempel).
- **E11 Fehlende Assets** (`image-name` ohne Datei; Vergleich NFC-normalisiert, weil HFS+ NFD speichert) → Warnung
  `missing_asset`, das Dokument öffnet. Das Frontend sucht Assets mit `findAsset()` ebenfalls NFC-normalisiert.
- **E12 Eindeutige Namen** wie legacy §3 (`name.svg` → `name 2.svg`, ohne Endung → `.svg`; Layer `name 2`, leer →
  `layer`; Asset leer → `layer.svg`). Vergleich NFC + Kleinschreibung (macOS/Windows unterscheiden nicht).
  Ungültige Zeichen im Asset-Namen (`/ \ :` NUL, Steuerzeichen) werden zu `-`. Die Fälle stehen als Tabelle in
  `testdata/unique-names.json` – dieselbe Tabelle kann ein TS-Gegenstück (003/008) prüfen.
- **E13 `new_icon()`:** eine Gruppe (`shadow {neutral, 0.5}`, `translucency {true, 0.5}`), ein Layer `layer` mit
  `layer.svg` (leeres 1024er-SVG), `fill: "automatic"`, `supported-platforms {circles: ["watchOS"], squares:
  "shared"}` wie Icon Composer (nicht die Legacy-Werte iOS/macOS). Als Command `new_icon` (Pfad `null`).
- **E14 Dateidialoge:** `pick_open_icon(folder)` – Datei-Dialog mit Filter `icon`/`zip`; unter macOS erscheinen
  `.icon`-Bundles als Datei, wenn der Typ als Paket bekannt ist (Icon Composer installiert bzw. Dateizuordnung mit
  `LSTypeIsPackage` in 030). Linux/Windows können Ordner im Datei-Dialog nicht wählen → `folder: true` öffnet den
  Ordner-Dialog („Bundle-Ordner öffnen…“, 003 entscheidet über den Menüpunkt). `pick_save_icon(suggestedName,
  format)`, `pick_svg_file()`. Alle `None` bei Abbruch.
- **E15 `read_svg_file`:** ≤ 16 MiB (`too_large`), UTF-8 mit/ohne BOM; anderes → neuer Code `invalid_svg`. Das
  Bereinigen (Skripte, Event-Handler) macht das Frontend beim Import (003).
- **E16 Fixture im Frontend:** `scripts/fixtures.mjs` erzeugt `src/testing/fixtures/camscanner-icon.ts` (Text von
  `icon.json` und SVG-Assets, mit Prettier formatiert); `pnpm fixtures:check` (in `pnpm check`) und
  `scripts/fixtures.test.mjs` prüfen, dass das Modul aktuell ist. Kein `?raw`/Loader-Trick: die Fixtures liegen
  außerhalb von `src/` und der Weg muss in `ng test`, `ng serve` und Playwright gleich funktionieren.
- **E17 Abhängigkeiten:** `zip` 8.6.0 (ohne Default-Features, nur Deflate über `flate2`/zlib-rs: kein AES, kein
  bzip2/lzma/zstd – solche Einträge → `unsupported_icon`; 9.x ist jünger als zwei Wochen), `unicode-normalization`
  0.1.25 (NFC), `base64` 0.23 (Data-URL; ohnehin im Lockfile).

## Verträge

### Rust `ai-core::icon`

```rust
pub enum IconFormat { Bundle, Zip }                       // serde "bundle" | "zip"
pub enum AssetKind { Svg, Png, Other }
pub struct IconAsset { pub name: String, pub bytes: Vec<u8>, pub kind: AssetKind }
pub struct ExtraFile { pub path: String /* '/'-getrennt, relativ */, pub bytes: Vec<u8> }
pub enum IconWarningCode { MissingAsset, IgnoredEntry, UnreadableAsset }
pub struct IconWarning { pub code: IconWarningCode, pub name: String }
pub struct IconFile {
    pub format: IconFormat, pub json_bytes: Vec<u8>, pub json: Value,
    pub assets: Vec<IconAsset>, pub extra_files: Vec<ExtraFile>,
    pub zip_root: String, pub outside_root: Vec<ExtraFile>, pub warnings: Vec<IconWarning>,
}
pub fn read_icon(path: &Path, limits: &Limits) -> Result<IconFile, FsError>;     // Ordner → Bundle, Datei → ZIP
pub fn write_icon(path: &Path, file: &IconFile) -> Result<(), FsError>;          // im Format von file.format
pub fn new_icon() -> IconFile;
pub fn format_icon_json(v: &Value) -> Vec<u8>;
pub fn assemble(base: Option<&IconFile>, format, json: Value, assets: Vec<AssetInput>) -> Result<IconFile, FsError>;
pub fn unique_asset_name(base: &str, existing: &[String]) -> String;
pub fn unique_layer_name(base: &str, existing: &[String]) -> String;
pub fn read_svg_file(path: &Path) -> Result<SvgFile, FsError>;
```

### Commands (alle `async`, Logik in `ai-core`)

| Command | Signatur |
|---|---|
| `open_icon` | `(path) -> IconDocumentDto { path, format, iconJson, assets: [{ name, kind, text?, dataUrl? }], warnings: [{ code, name }] }` |
| `new_icon` | `() -> IconDocumentDto` (path `null`) |
| `save_icon` | `(path, format, iconJson, assets: [{ name, text?, unchanged }], from?) -> SaveResult { path, format }` |
| `close_icon` | `(path) -> ()` – Sitzung freigeben |
| `read_svg_file` | `(path) -> { name, text }` |
| `pick_open_icon` | `(folder: bool) -> string \| null` |
| `pick_save_icon` | `(suggestedName, format) -> string \| null` |
| `pick_svg_file` | `() -> string \| null` |

Neue Fehlercodes: `invalid_icon`, `unsupported_icon`, `too_large`, `missing_asset` (beim Speichern: Asset als
`unchanged` gemeldet, aber nicht in der Sitzung), `invalid_svg`.

### Frontend `core/icon-file/`

- `icon-file.models.ts` (DTOs = Rust), `IconJson`-Typen mit Index-Signatur (unbekannte Felder).
- `IconFileApi` (abstrakt) / `TauriIconFileApi`: `openIcon`, `newIcon`, `saveIcon(request)`, `closeIcon`,
  `readSvgFile`, `pickOpenIcon(folder)`, `pickSaveIcon(name, format)`, `pickSvgFile()`.
- `findAsset(assets, imageName)` (NFC-Vergleich).
- `src/testing/fake-icon-file-api.ts`: In-Memory-Dateien, vorbelegt mit `/fixtures/camscanner.icon`; merkt sich
  gespeicherte Stände (`files`, `saved`), `picks` steuert die Dialoge, `failNext` erzeugt Fehler. Ein geändertes
  `icon.json` schreibt der Fake mit `JSON.stringify(…, 2)` (nicht im Icon-Composer-Stil – das prüft Rust).

## Tests

- Rust `icon::*`: Formatter byte-genau; Sicht-Roundtrip mit `x-future` auf jeder Ebene; Bundle-Roundtrip
  (Ordnervergleich byte-genau), ZIP-Roundtrip (aus dem Bundle erzeugt, auch mit Wurzelordner und `__MACOSX`),
  geändertes Asset → nur dieses anders; ZIP-Grenzen (Bombe mit gelogener Größe, zu viele Einträge, `../`, absoluter
  Pfad, verschlüsselt), kaputtes JSON, kein `icon.json`, fehlendes Asset (Warnung), Namen mit Leerzeichen/Umlauten/
  Emoji/NFD, Groß-/Kleinschreibung; `unique_*` aus `testdata/unique-names.json`; Abbruch vor dem Tausch lässt das
  Original heil und hinterlässt keinen Temp-Ordner; Bundle ↔ ZIP am selben Pfad; Symlink wird ignoriert.
- Rust App: `command_rules`, Sitzungen (`sessions.rs`), DTO-Abbildung.
- Frontend: `icon-file-api.spec.ts` (Fake: öffnen, speichern, unveränderte Assets, Fehler), `asset-names.spec.ts`,
  `fs-error.spec.ts` (neue Codes). `scripts/fixtures.test.mjs` (Modul aktuell).
- E2E: kein neues UI in 002 – die bestehenden Playwright-Tests laufen weiter; Öffnen/Speichern im UI testet 003.

## Fragen an Marc

1. Neue Dokumente: `supported-platforms` wie Icon Composer `circles: ["watchOS"], squares: "shared"` statt der
   Legacy-Werte `circles: [iOS, macOS]` – passt das?
2. Geänderte Dokumente: Schlüsselreihenfolge wie gelesen (so umgesetzt) oder immer alphabetisch wie Icon Composer?
3. Leere Arrays schreibt Icon Composer evtl. als `[\n\n]` und `/` evtl. als `\/` (JSONEncoder-Standard) – mangels
   Beleg schreiben wir `[]` und `/`. Hast du eine Datei mit leerem Array oder `/` im Namen?
4. Bundle-Tausch: unter macOS echtes atomares Tauschen mit `renamex_np(RENAME_SWAP)` nachrüsten (030/031)?
5. Auf dem Mac prüfen: Öffnen-Dialog zeigt `.icon`-Bundles als Datei (nur wenn der Typ als Paket registriert ist).

## Fortschritt

- [x] Design · [x] Rust `ai-core::icon` + Tests · [x] Commands · [x] Frontend-Fassade, Fake, Fixture-Modul
- [x] Doku · [x] `pnpm check` + `pnpm e2e` grün · [x] Debug-Build unter Xvfb gestartet (Fensterhülle unverändert)
- Abweichungen: kein neues Playwright-Szenario (002 hat kein UI); die Commands sind in der echten App registriert,
  aber erst mit 003 über das UI erreichbar. `unique_*` gibt es nur in Rust (TS-Gegenstück mit derselben Tabelle in
  003/008, falls das Frontend synchron Namen braucht).
