# Prompt 002: `.icon`-Dateiformat in Rust (verlustfrei)

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 001 · Meilenstein 2 aus `000-init.md` ·
> legacy §2, §3

## Ziel

Das Modul `ai-core/src/icon/` liest und schreibt Apple-Icon-Composer-Dateien (`.icon`) **verlustfrei**: als
Ordner-Bundle und als ZIP, mit allen unbekannten Feldern von `icon.json`, mit unveränderten Asset-Bytes, solange ein
Asset nicht bearbeitet wurde. Die Vorlage hat hier zwei schwere Fehler, die nicht übernommen werden: Sie verliert
unbekannte Felder und die Layer-`opacity` und schreibt `fill` in einem eigenen, nicht Apple-kompatiblen Schema
zurück; außerdem schreibt sie immer ZIP über `/usr/bin/zip` (legacy §2, §3).

## Umfang

### Rust (`ai-core`)
- `icon/model.rs`: `IconJson` als typisierte **Sicht** über `serde_json::Value` (bzw. Structs mit
  `#[serde(flatten)] extra: Map<String, Value>` auf **jeder** Ebene: Dokument, Gruppe, Layer, Shadow, Translucency,
  Plattformen). Bekannte Felder: `fill`, `groups[].layers[].{image-name, name, opacity}`, `groups[].shadow{kind,
  opacity}`, `groups[].translucency{enabled, value}`, `supported-platforms{circles, squares}`. `fill` bleibt ein
  `Value` (String oder Objekt) – Auslegung erst in 010. Schlüsselreihenfolge beim Schreiben stabil (Feature
  `preserve_order` von serde_json) und Ausgabe wie Icon Composer (2 Leerzeichen, `" : "`-Stil prüfen an
  `testdata/fixtures/camscanner.icon/icon.json`).
- `icon/bundle.rs`: Bundle lesen (`icon.json`, `Assets/*`), ZIP lesen (Crate `zip`, Einträge ≤ 2 000, Gesamtgröße
  ≤ 256 MiB, je Datei ≤ 64 MiB, Zip-Slip-Schutz, nur `icon.json` und `Assets/…` übernehmen, Rest als „extra files“
  aufbewahren und zurückschreiben). Ein ZIP mit Wurzelordner `X.icon/` wird erkannt.
- Schreiben **im Format der Quelle** (Bundle → Bundle, ZIP → ZIP; „Speichern unter“ wählt). Bundle atomar: neues
  Bundle als Geschwister-Ordner `.<name>.tmp-…` schreiben, dann tauschen (alter Ordner → Papierkorb-freies
  Löschen erst nach erfolgreichem Rename). ZIP über `fs_atomic::write_atomic`.
- Assets: `IconAsset { name, bytes, kind: Svg|Png|Other }`; unveränderte Assets werden byte-genau geschrieben.
- `unique_asset_name(base, existing)` und `unique_layer_name(base, existing)` wie legacy §3 (`name 2.svg` …;
  leer → `layer`), Unicode/NFC-NFD bedenken, Groß-/Kleinschreibung (macOS-Dateisystem!) beim Vergleich ignorieren.
- `new_icon()` für ein neues Dokument: eine Gruppe, ein Layer, leeres 1024er-SVG; Plattformen wie Icon Composer
  (`squares: "shared"`, `circles: ["watchOS"]` – **nicht** die Legacy-Werte iOS/macOS; im Bericht als Frage nennen).
- Neue Fehlercodes: `invalid_icon` (kein/kaputtes `icon.json`), `unsupported_icon` (z. B. verschlüsseltes ZIP),
  `too_large`, `missing_asset` (Warnung, kein Abbruch: fehlende Assets werden gemeldet, Dokument öffnet trotzdem).

### Commands (App-Crate, dünn)
- `open_icon(path) -> IconDocumentDto { path, format: "bundle"|"zip", iconJson: Value, assets: [{ name, kind, text?
  (SVG als UTF-8), dataUrl? (PNG) }], warnings }`
- `save_icon(path, format, iconJson: Value, assets: [{ name, text? , unchanged: bool }]) -> SaveResult` – unveränderte
  Assets kommen nicht über die Brücke, Rust nimmt die Bytes der zuletzt geöffneten Version (Sitzung je Pfad).
- `read_svg_file(path) -> { name, text }` (≤ 16 MiB, UTF-8/BOM), für „Import SVG…“.
- Dateidialoge über `tauri-plugin-dialog` in Rust: `pick_open_icon`, `pick_save_icon(suggestedName, format)`,
  `pick_svg_file`. Unter macOS sind `.icon`-Bundles Pakete: der Öffnen-Dialog muss sie als Datei wählbar machen.

### Frontend
- `core/icon-file/` mit `IconFileApi` (Fassade), DTOs = Rust, `FakeIconFileApi` in `src/testing/` (In-Memory, nutzt
  die Fixtures), damit 003 im Browser-Modus arbeiten kann.

## Entscheidungen, die das Design-Dokument treffen muss

- Wie genau die Ausgabe von Icon Composer formatiert ist (Einrückung, `" : "`), und ob wir sie byte-genau
  nachbilden (Empfehlung: ja für unveränderte Dokumente → `icon.json` unverändert zurückschreiben, wenn nichts
  geändert wurde).
- Bundle-Tausch auf Windows (Ordner-Rename über bestehenden Ordner) – Strategie und Test.
- Liste der bekannten Felder aus echten Icon-Composer-Dateien belegen; Unklares nur durchreichen, nie raten.

## Tests

- Roundtrip jedes Fixtures (`testdata/fixtures/camscanner.icon` als Bundle und als ZIP): lesen → schreiben →
  byte-gleich (bzw. JSON-gleich mit gleicher Schlüsselreihenfolge) inkl. Layer-`opacity` und erfundener Zusatzfelder
  (`"x-future": {…}` auf jeder Ebene).
- ZIP-Grenzen (Bombe, zu viele Einträge, Zip-Slip `../`, absolute Pfade), kaputtes JSON, fehlendes Asset,
  Asset-Namen mit Leerzeichen/Umlauten/Emoji, NFD-Namen, Groß-/Kleinschreibung.
- `unique_*`-Fälle als datengetriebene Tabelle; atomares Speichern (Abbruch in der Mitte lässt das Original heil).
- `command_rules` (alle Commands async).

## Akzeptanz

- `camscanner.icon` öffnen und unverändert speichern ergibt identische Dateien; mit geändertem Asset nur dieses
  Asset geändert. `pnpm check` grün.
