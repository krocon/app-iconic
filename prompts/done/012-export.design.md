# Design 012: Export (SVG und PNG)

Status: umgesetzt · Datum: 27.10.2026

## Ausgangslage

004 malt das Icon im Canvas (Hintergrund-Fill, Gruppen/Layer in Shadow Roots, Squircle/Kreis als `clip-path`),
010 ergänzt Werte je Appearance und die Effekt-Annäherung (`stackOf`, `groupEffects`). Die Aktionen
`file.exportSvg`/`file.exportPng` stehen seit 005 im Katalog und im Menü File, ohne Handler. 012 baut daraus ein
flaches SVG je Appearance (Frontend) und rendert es in Rust mit resvg zu PNGs.

Vorab (eigener `fix:`-Commit): WebKit zeigte bei „Effects Preview“ keine Layer – siehe Nachtrag in
`done/010-icon-eigenschaften.design.md`.

## Entscheidungen

- **E1 Export-SVG im Frontend aus derselben Quelle wie der Canvas.** `features/export/export-svg.ts` nimmt
  `stackOf(doc, appearance, effects)` (004 E3, 010 E13) und `fillPreview` (004 E7) und baut mit dem DOM ein
  eigenständiges SVG 1024 × 1024: `<defs>` (Verlauf, Maske, Filter, Transluzenz-Masken) → `<g clip-path>` (nur mit
  Maske) → Hintergrund-`<rect>` → je Gruppe `<g opacity …>` → je Layer `<g opacity transform filter>` →
  Platzierungs-`<svg x y width height>` (004 E4) → Kopie der Asset-Wurzel. Gleiche Struktur wie der Canvas = gleiche
  Geometrie, ohne eigene Transform-Kette. Serialisiert mit `XMLSerializer`.
- **E2 IDs je Layer mit Präfix.** Jede eingebettete Asset-Kopie bekommt das Präfix `l<n>-` (n = Malreihenfolge ab 1)
  vor jeder `id`; `url(#…)` in Attributen und `style`, `href`/`xlink:href="#…"` (`rewriteReferences`, 006) und
  `url(#…)` in `<style>`-Texten folgen. Je Layer statt je Asset, weil dasselbe Asset in mehreren Layern sonst
  doppelte IDs hätte. Eigene Export-IDs beginnen mit `ai-export-` (kollidieren nicht mit `l<n>-`).
  `data-ai-*` werden entfernt (`stripInternal`).
- **E3 Farben für resvg.** CSS `color(display-p3 …)` versteht resvg nicht. Der Export schreibt Farben als
  `#rrggbb` + `stop-opacity`/`fill-opacity`; Display-P3 wird nach sRGB umgerechnet (lineare Matrix, Gamma),
  Werte außerhalb 0…1 werden geklemmt (8 Bit). `fill-preview.ts` wird dafür generisch (`previewOf(fill, appearance,
color)`): Canvas → CSS-Farbe, Export → `SvgColor { hex, opacity }`.
- **E4 Auto-Verlauf** wie legacy §3 und Canvas (Basis +16 % → −14 %, oben → unten) – Annäherung an Icon Composer.
  `automatic`/`system-*` wie der Canvas (004 E7).
- **E5 Maske** optional (`none` | `squircle` | `circle`, Default `none` – Apple maskiert App-Icons selbst):
  `<clipPath>` mit `squirclePath()` (004 E8) bzw. `<circle r=512>` um Hintergrund und Layer.
- **E6 Effekte** als ein Schalter „Shadow & effects (approximation)“, Default **aus**: Schatten je Layer als SVG-Filter
  (wie Canvas, `feDropShadow` bzw. Weichzeichnung + Farbmatrix), Transluzenz als `<mask mask-type="alpha">` mit
  Verlauf (statt CSS `mask-image`), Blend-Modes als `mix-blend-mode` mit `isolation` an der Gruppe. Alles versteht
  auch resvg. Aus = nur Fill, Gruppen/Layer, Opacity (Opacity gilt immer – Fehler der Vorlage behoben).
- **E7 PNG-Assets** als `<image href="data:…">` in natürlicher Größe, zentriert (wie Canvas). Die Größe ermittelt
  der Dienst vorher asynchron (`Image.decode()`); ohne Ergebnis volle Fläche (wie der Canvas vor dem Dekodieren).
- **E8 PNG in Rust** (`ai-core/export/`): `resvg` 0.48.1 (exakt gepinnt; 0.49.0 ist erst drei Tage alt) mit
  `usvg`, `tiny-skia` und `fontdb` über dessen Re-Exporte (keine Versionskonflikte, eine Zeile in `Cargo.toml`).
  Features `text`, `system-fonts`, `memmap-fonts`, `raster-images`; ohne `svgz`. Systemschriften einmal je Prozess
  geladen (`LazyLock<Arc<Database>>`).
- **E9 Keine externen Referenzen beim Rendern.** `usvg::Options`: `resources_dir = None`, Bild-Resolver nur für
  Data-URLs (Dateipfade/URLs → `None`), verschachtelte SVG-Data-URLs nutzen dieselben Optionen. Grenzen: SVG-Text
  ≤ 64 MiB je Variante (`too_large`), höchstens 2 Varianten, Größen nur aus dem Set.
- **E10 Dateien und Ziel.** Beide Formate schreiben in einen **Ordner** (`pick_export_dir`), Namen
  `<name>-<appearance>.svg` bzw. `<name>-<appearance>-<size>.png` (`<name>` = Dokumentname ohne `.icon`, sonst
  „Untitled“). Rust bildet die Namen (Pfade bleiben opak) und prüft sie (keine Trenner/Steuerzeichen). Abweichung
  vom Prompt: **`export_svg` statt `write_text_file` über einen Save-Dialog** – zwei Dateien je Export passen nicht
  in einen Save-Dialog, und das Frontend darf keine Pfade ableiten. Jede Datei atomar (`write_atomic`).
- **E11 Nie überschreiben ohne Rückfrage.** `overwrite: false` → Rust prüft **vor** dem ersten Schreiben alle Ziele;
  existiert eines, Fehler `already_exists` (Pfad = erste Datei), nichts wird geschrieben. Der Dialog fragt dann
  (inline, ohne Dialogwechsel) und wiederholt mit `overwrite: true`.
- **E12 Fortschritt und Abbruch.** `export_png` sendet je Datei `ExportProgress { done, total, name }` über
  `tauri::ipc::Channel`; `cancel_export()` setzt ein Abbruch-Flag des aufrufenden Fensters. Abbruch nach der
  laufenden Datei: geschriebene Dateien bleiben (vollständig), Bericht `cancelled: true`.
- **E13 Apple-Hinweis** (Vorlage `docs/notes.txt`: App-Icons ohne Transparenz): Rust meldet je PNG
  `transparent` (ein Pixel mit Alpha < 255). Ohne Maske und mit transparenten Pixeln zeigt der Dialog eine Warnung.
- **E14 Aktionen mit Argumenten (KI-Regel).** `file.exportSvg`/`file.exportPng` ohne Argumente → Dialog (Format
  vorgewählt). Mit Argumenten `{ appearances?, sizes?, mask?, effects?, targetDir?, overwrite? }` → direkt (fehlt
  `targetDir`, fragt der Ordner-Dialog); Ergebnis/Fehler als Statuszeilen-Hinweis (`files.notice`). Arrays als
  `json`-Argumente, geprüft in `exportArgs()` (rein).
- **E15 Letzte Wahl** merkt sich der Root-Dienst `ExportService` für die Sitzung (Format, Appearances, Größen, Maske,
  Effekte, Ordner); dauerhaft mit `settings.json` in 015.
- **E16 Dialog** `ExportDialog` (`features/export/`): Format (Radio SVG/PNG), Appearances (Light/Dark), Größen
  (Checkboxen, nur PNG), Maske (Auswahl), Effekte (Schalter), Ziel (Ordner + „Choose…“), Fortschrittsbalken
  (`<progress>`), Abbrechen. Ergebnis im Dialog (Anzahl, Warnung E13), Fehler über `describeFsError`.

## Verträge

### Rust (`ai-core/src/export/`)

```rust
pub const PNG_SIZES: [u32; 7] = [1024, 512, 256, 128, 64, 32, 16];
pub const MAX_SVG_BYTES: usize = 64 << 20;
pub struct Variant { pub appearance: String, pub svg: String }          // appearance: "light" | "dark"
pub struct ExportOptions { pub base_name: String, pub overwrite: bool }
pub struct ExportedFile { pub name: String, pub path: String, pub transparent: Option<bool> }
pub struct ExportReport { pub files: Vec<ExportedFile>, pub cancelled: bool }
pub struct ExportProgress { pub done: u32, pub total: u32, pub name: String }
pub fn render_png(svg: &str, size: u32, fonts: &Arc<Database>) -> Result<Pixmap, FsError>; // png.rs
pub fn system_fonts() -> Arc<Database>;                                                       // fonts.rs
pub fn export_png(variants, sizes, dir, opts, cancel: &AtomicBool, progress: impl FnMut(ExportProgress))
    -> Result<ExportReport, FsError>;                                                         // files.rs
pub fn export_svg(variants, dir, opts) -> Result<ExportReport, FsError>;
pub fn file_base_name(name: &str) -> Result<String, FsError>;  // bereinigt, `invalid_path` wenn leer
```

Neuer Fehlercode `already_exists` (Rust `error.rs`, TS `fs-error.ts`, `describeFsError`).

### Commands (`src-tauri/src/export_commands.rs`, alle `async`)

| Command                                                                                                | Zweck                                        |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `pick_export_dir() -> Option<String>`                                                                  | nativer Ordner-Dialog                        |
| `export_svg(variants, targetDir, options) -> ExportReport`                                             | SVG-Texte als Dateien                        |
| `export_png(variants, sizes, targetDir, options, onProgress: Channel<ExportProgress>) -> ExportReport` | resvg                                        |
| `cancel_export()`                                                                                      | Abbruch-Flag des aufrufenden Fensters setzen |

### Frontend

- `core/export/export-api.ts`: `ExportApi { pickExportDir(), exportSvg(variants, dir, options),
exportPng(variants, sizes, dir, options, onProgress), cancelExport() }`, DTOs `export.models.ts`; `TauriExportApi`
  (Channel aus `@tauri-apps/api/core`, `invoke` weiter nur in `call.ts`); `FakeExportApi` in `testing/`.
- `features/export/export-svg.ts`: `exportSvg(doc, appearance, opts: { mask, effects }, rasterSizes?) → string`.
- `features/export/export-options.ts` (rein): `ExportChoice`, Defaults, `exportArgs(args)`, `fileBaseName(docName)`.
- `features/export/export.service.ts`: `choice` (Signal, E15), `run(choice, { overwrite })` → `ExportOutcome`,
  `progress`, `cancel()`; `export-actions.ts`; `export-dialog.ts`; `export-texts.ts`.

## Tests

- Vitest: Export-SVG von `camscanner.icon` (Snapshot, light/dark), ID-Präfixe und `url()`-/`href`-Umschreibung
  (zwei Assets mit gleicher ID, Asset zweimal), Layer-/Gruppen-Opacity, Maske Squircle/Kreis, Farben (P3 → sRGB,
  Alpha), Effekte an/aus, keine `data-ai-*`; `exportArgs`, Dateiname; Service mit Fake (Fortschritt, Überschreiben,
  Abbruch, Warnung); Dialog.
- Rust: Größen und Abmessungen, Pixel je Fill-Art (Farbe, linear, radial an bekannten Stellen), Text mit
  Systemschrift (wenn Schriften vorhanden), Abbruch, Grenzen (zu groß, falsche Größe, Namen), externe Referenzen
  (Datei neben dem Test wird nicht geladen), Data-URL-Bild wird gezeichnet, Überschreiben/`already_exists`,
  `transparent`, SVG-Export schreibt Dateien.
- Playwright: Dialog-Ablauf mit Fake-Fassade (PNG mit Fortschritt, Überschreiben-Rückfrage, SVG), Aktion mit
  Argumenten (KI).

## Fragen an Marc

1. Ziel ist ein Ordner für beide Formate (statt Save-Dialog für SVG, E10) – passt das?
2. Maske Default „none“ (App Store) – oder lieber wie der Canvas (Squircle)?
3. Transluzenz/Blend im Export nur mit dem Effekte-Schalter (Default aus) – ok?
4. Auf dem Mac prüfen: Ordner-Dialog, Fortschritt, Systemschriften (SF Pro u. a.) im PNG.

## Abweichungen und Grenzen

- **Ziel-Ordner statt Save-Dialog** für SVG (E10): `export_svg` ersetzt das im Prompt genannte `write_text_file`.
- **Letzte Wahl** nur für die Sitzung (E15); dauerhaft mit `settings.json` in 015.
- `<style>`-Elemente eines Assets wirken im Export-SVG dokumentweit (Klassen-Selektoren könnten andere Layer treffen);
  `#id`-Selektoren und `url()` werden umgeschrieben. Import löst Stile ohnehin auf (003 E5), daher selten.
- Display P3 außerhalb sRGB wird geklemmt (8-Bit-PNG ohne Farbprofil).
- Effekte bleiben Annäherungen (010 E13); Blend `multiply` mit weißen Layern ist im Export (wie im Canvas) unsichtbar
  (`all-fields.icon`, Kontaktbogen).
- Playwright-WebKit ist im Container nicht installiert; die echte App (WebKitGTK) wurde unter Xvfb geprüft: Dialog,
  GTK-Ordnerwahl, Export von 4 PNGs (1024/512, light/dark).

## Fortschritt

- [x] Design
- [x] Rust: `ai-core/export`, Commands, Tests
- [x] Frontend: export-svg, Fassade, Service, Dialog, Aktionen, Tests
- [x] Playwright, echte App unter Xvfb
- [x] Doku, Checks, Commit
