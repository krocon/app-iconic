# Prompt 012: Export (SVG und PNG)

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 004, 010 · Meilenstein 7 aus `000-init.md` ·
> legacy §3

## Ziel

Das Icon als flaches SVG und als PNG exportieren – je Appearance (Light/Dark), in mehreren Größen, optional mit
Plattform-Maske. Die Vorlage exportierte PNG nur in einer Größe und ignorierte Layer-Opacity und Maske.

## Umfang

- **SVG-Export** (Frontend, rein: `export-svg.ts`): ein vollständiges SVG 1024 × 1024 je Appearance (`<name>-light.svg`,
  `<name>-dark.svg`): Hintergrund aus dem Fill (Verläufe als `linearGradient`/`radialGradient`, Auto-Verlauf wie
  legacy §3 als Annäherung), alle Gruppen/Layer in richtiger Reihenfolge mit Layer-Opacity, Assets eingebettet
  (IDs je Asset mit Präfix eindeutig machen, `url(#…)` umschreiben), interne `data-ai-*` entfernt, optional
  Plattform-Maske (`clipPath` Squircle/Kreis) und Schatten-Annäherung (Schalter, Default aus).
- **PNG-Export** in Rust (`ai-core/export/`): Crates `resvg`/`usvg`/`tiny-skia` (Begründung in
  `docs/architecture.md`); Eingabe = SVG-Text aus dem SVG-Export; Größen-Set **1024, 512, 256, 128, 64, 32, 16**
  (Auswahl im Dialog, Default 1024), Dateinamen `<name>-<appearance>-<size>.png`; Schriften für `<text>` über
  `fontdb` (Systemschriften laden). Ausgabe in einen gewählten Ordner, atomar je Datei, nie überschreiben ohne
  Rückfrage. Fortschritt über `tauri::ipc::Channel`, Abbruch.
- Command `export_png(svgByVariant, sizes, targetDir, options) -> ExportReport`, `pick_export_dir`;
  `write_text_file(path, text)` für den SVG-Export (über Save-Dialog).
- Export-Dialog (`features/export/`): Format (SVG/PNG), Appearances, Größen, Maske, Ziel; merkt sich die letzte Wahl
  (015). Menü File › Export SVG…/Export PNG…
- Apple-Hinweis aus der Vorlage (`docs/notes.txt`): App-Icons ohne Transparenz → Warnung, wenn das exportierte PNG
  transparente Pixel hat und keine Maske gewählt ist.

## Tests

- Vitest: Export-SVG für `camscanner.icon` (Snapshot), ID-Präfixe/`url()`-Umschreibung, Layer-Opacity, Maske.
- Rust: PNG-Größen, Abmessungen, ein Pixel-Test je Fill-Art (Farbe an bekannter Stelle), Text mit Systemschrift,
  Abbruch, Grenzen (riesige SVGs, externe Referenzen werden nicht geladen – `usvg`-Optionen ohne Dateizugriff).
- Playwright: Dialog-Ablauf mit Fake-Fassade.

## Akzeptanz

- `docs/FEATURES.md` §11 (ohne Share) abgehakt; exportierte PNGs aller Fixtures im Bericht (Kontaktbogen).
  `pnpm check` + `pnpm e2e` grün.
