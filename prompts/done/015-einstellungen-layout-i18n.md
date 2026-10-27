# Prompt 015: Einstellungen, Layout, i18n

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 005 · Meilenstein 9 aus `000-init.md` · legacy §9 ·
> Vorbild: editlicious 009 / files-and-folders 015

## Ziel

Die Arbeitsumgebung merkt sich, wie Marc sie eingerichtet hat: sichtbare Seitenleisten und ihre Breiten,
Canvas-Optionen, Zoom, Snapping, Auswahlmodus, Export-Vorgaben. Dazu ein Einstellungsdialog, Hell/Dunkel und
Deutsch/Englisch zur Laufzeit.

## Umfang

- Rust `settings.rs`: `settings.json` im Config-Ordner über `config_file` (nachsichtig laden, Werte begrenzen,
  kaputte Datei → `.bad`), `schemaVersion` mit Migration (Test je Version), atomar speichern, gebündelt (entprellt).
  Commands `load_settings`, `save_settings`, `reset_settings`.
- Inhalt (Defaults aus legacy §9): Sichtbarkeit Command Sidebar / Hierarchy / Properties (an), Breiten 260 / 260 /
  300 (Bereich **160…480**), Rulers, Guides, Background, Cross Cursor, Show Handles (an), Snap to Grid (aus), Magic
  Snap (an), Grid-Abstand 10 + Ursprung, Selection Mode `point`, Zoom 100 %, Appearance-Vorschau, Plattform-Maske,
  Theme (System/Hell/Dunkel), Sprache (System/Deutsch/Englisch), Export-Vorgaben (012), Debug „Log Undo Grouping“.
- **Layout:** Seitenleisten per Splitter in der Breite ziehbar (Tastatur: Splitter fokussierbar, ←/→), ⌘1/⌘2/⌘3
  blenden aus/ein, Doppelklick auf Splitter = Default-Breite; Fenstergröße/-position über `tauri-plugin-window-state`.
- **Settings-Dialog** (⌘,): Abschnitte General, Canvas, Snapping, Export, Advanced; „Reset to Default“ mit
  Bestätigung („All persisted workspace settings will revert to their defaults.“); Änderungen wirken sofort.
- **i18n:** `core/i18n` aus editlicious (`translatable()`, Sprach-Signal, System-Sprache), alle `*-texts.ts` mit
  deutscher Fassung, Aktionsnamen deutsch, `catalogs.spec.ts` prüft Vollständigkeit; natives Menü wird bei
  Sprachwechsel neu gesetzt.
- **Theme:** `data-theme` auf `<html>`; Canvas-Tokens in beiden Schemata geprüft (Kontraste).

## Tests

- Rust: Laden/Begrenzen/Migration/kaputte Datei/Reset.
- Vitest: SettingsStore (anwenden, entprellt speichern), Splitter-Logik (Grenzen), Katalog-Vollständigkeit.
- Playwright: Seitenleiste ziehen → Breite begrenzt auf 160…480; Neustart (Fake-Persistenz) stellt wieder her;
  Sprache umschalten ändert Texte ohne Neustart.

## Akzeptanz

- `docs/FEATURES.md` §2 abgehakt. `pnpm check` + `pnpm e2e` grün.
