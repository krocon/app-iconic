# Design 015: Einstellungen, Layout, i18n

Status: umgesetzt (27.10.2026). Vorbild: editlicious 009 (`settings.rs`, `core/i18n`, `core/settings`,
`features/settings`), files-and-folders 015 E5 (`translatable()`), legacy §9.

## Entscheidungen

| Nr. | Entscheidung | Begründung |
|---|---|---|
| E1 | `settings.json` im App-Config-Ordner, Logik in `ai-core::settings` (ohne Tauri), Laden über `config_file` (fehlt → Standard, kaputt → Standard + Datei als `.bad`, unlesbar → Standard, **nicht** überschreiben) | wie `recent.json`/`keymap.json`; testbar ohne GTK |
| E2 | **Nachsichtig je Feld**: die Datei wird als JSON-Wert gegen die Standardwerte gelegt (`merge`): bekannte Schlüssel mit passender Art (Bool/Zahl/Text/Liste; Ganzzahl-Felder nur mit Ganzzahl) gelten, alles andere fällt einzeln auf den Standard; danach `sanitize` (Bereiche, Aufzählungen, Listen gefiltert). Unbekannte Felder werden ignoriert | ein falsch geschriebener Wert soll nicht alle Einstellungen kosten (editlicious verwarf die ganze Datei bei einem Typfehler) |
| E3 | `schemaVersion` 1 (legacy §9). `migrate(value)` läuft die Schritte von der gelesenen Version bis zur aktuellen; fehlt die Version → 1; eine **neuere** Version (andere App-Version) wird nachsichtig gelesen und als 1 geschrieben (legacy: „unbekannte Version → Defaults/Anheben“). Tests je Version (fehlend, 1, neuer, kaputt) | es gibt noch keine ältere Version – die Kette steht, der erste Schritt kommt mit dem ersten Formatwechsel |
| E4 | Speichern als **Patch**: `save_settings(patch)` legt den Patch (Teilobjekt) auf die aktuellen Einstellungen in Rust (`apply_patch` = `merge` + `sanitize`), schreibt atomar und schickt das Ergebnis als Ereignis `settings-changed { settings, from }` an **alle** Fenster | zwei Fenster, die kurz nacheinander verschiedene Werte ändern, überschreiben sich nicht (jedes schickt nur seine Änderung); Rust hält den Stand im Speicher (`SettingsState`), neue Fenster bekommen ihn mit `load_settings` – auch wenn die Datei nicht schreibbar ist |
| E5 | Frontend `SettingsStore` (Root): Signal `settings`, `set(key, value)` / `update(patch)` wirken **sofort**, gesammelt gespeichert nach 400 ms (ein Patch je Bündel, `flush()` beim Schließen). Antworten/Ereignisse aus Rust ersetzen den Stand (Rust hat begrenzt) – eigene Ereignisse (`from` = eigenes Fenster) werden ignoriert, solange ein Bündel offen ist | wie editlicious 009 E2, plus Fenster-übergreifend |
| E6 | `SettingsSync` bindet die vorhandenen Stores **in beide Richtungen** (Effekte mit Gleichheitsprüfung, keine Schleifen): `LayoutStore` (Sichtbarkeit, Breiten), `CanvasViewStore.options` (Rulers … Maske, Grid-Abstand), Export-Wahl (`ExportService.choice`, ohne Format-Wechsel des Dialogs zu verlieren), Freehand-Optionen (`FreehandStore`), Debug-Flag der Undo-Gruppierung. Die Stores bleiben, wie sie sind (kein Umbau auf ein globales Settings-Objekt) | kleinster Eingriff; Menüs, Aktionen und Tests der Prompts 004–014 bleiben gültig |
| E7 | **Zoom**: gespeichert wird der zuletzt **gewählte** Zoom (`zoomTo`, Stufen, Pinch) bzw. `0` = „Fit“ (Start, „Zoom to Fit“). Neue Fenster starten damit (zentriert); Zoom wird **nicht** in andere offene Fenster übertragen. Standard `0` (Fit, höchstens 100 %) statt fest 100 % | 004 E9 hat „Fit ≤ 100 %“ als Start entschieden (bei großem Fenster = 100 %); fester 100 %-Start schneidet in kleinen Fenstern die Fläche ab. → Frage an Marc |
| E8 | **Appearance-Vorschau** `system`/`light`/`dark` (Standard `system` = wie das System beim Start, wie bisher); die Aktionen „Appearance: Light/Dark“ speichern die Wahl | bisheriges Verhalten bleibt der Standard |
| E9 | Defaults aus legacy §9 / Prompt: Seitenleisten an, Breiten 260/260/300, Bereich **160…480**; Rulers, Guides, Background, **Cross Cursor**, Show Handles an; Snap to Grid aus, Magic Snap an; Grid 10 (1…256) + Ursprung `worldZero`; Selection Mode `point`; Effects Preview an (010); Maske `squircle` (004 E8); Export wie 012 E15; Freehand wie 013 (Glättung 2,5, Breite 8, offen) | Cross Cursor war seit 004 aus – legacy §9 und der Prompt sagen „an“ |
| E10 | **Splitter** (`app-splitter`, APG „Window Splitter“): `role="separator"`, `aria-orientation="vertical"`, `aria-valuenow/min/max`, fokussierbar; Ziehen mit Pointer-Capture, ←/→ 10 px (⇧ 40 px), Home/End = Minimum/Maximum, Doppelklick oder Enter = Standardbreite. Breite rein in `panel-width.ts` (begrenzen, Schritte, Richtung je Seite). Die Pfeiltasten gehören dem Widget wie bei Schiebereglern (Dispatcher lässt sie für `[role=separator]` durch, 005 E4) | Tastatur-Bedienung wie ein Slider; kein globaler Kontext nur für zwei Tasten |
| E11 | Aktionen: `app.settings` (⌘, – Dialog), `settings.set { key, value }`, `settings.reset { confirm? }`, `view.panelWidth { panel, width? }` (ohne `width` = Standard). `key` ist ein Pfad (`canvas.rulers`, `panels.hierarchy.width`, `export.sizes`, `theme` …) aus `SETTING_KEYS`; Werte werden vor dem Anwenden geprüft und begrenzt (TS-Spiegel von `sanitize`, gemeinsame Fälle in `testdata/settings-cases.json`) | KI-Regel: dieselben Wege wie Dialog und Menü |
| E12 | **Settings-Dialog** (`DialogKind 'settings'`): Abschnitte General (Theme, Sprache, Seitenleisten), Canvas (Anzeige, Vorschau, Maske), Snapping (Grid, Magic, Abstand, Ursprung, Auswahlmodus), Export (Vorgaben der Exporte), Advanced („Log Undo Grouping“, „Reset to Default…“ mit Bestätigung „All persisted workspace settings will revert to their defaults.“). Jede Änderung wirkt sofort, nur „Close“ | wie editlicious 009 E2 |
| E13 | **i18n** aus editlicious `core/i18n/i18n.ts` (dort aus files-and-folders 015 E5): `translatable(name, en, { de })`, Sprach-Signal, `systemLanguage()`. **Erweitert:** der Proxy ist tief – auch ein gemerktes Teilobjekt (`const T = TOOLS_TEXTS.symbol`) folgt der Sprache. Phrasenbuch für Listen (Property-Namen). Alle `*-texts.ts`, `describeFsError`, About bekommen eine deutsche Fassung; Aktionsnamen in `action-catalog.de.ts`, `ActionService.label()` liest die Sprache. `catalogs.spec.ts` prüft gleiche Schlüssel und Signaturen, nicht-leere Texte und einen deutschen Namen je Aktion | Sprachwechsel ohne Neustart; Fehler im Katalog fallen im Test auf |
| E14 | Das native Menü (macOS) wird beim Sprachwechsel neu gesetzt: `MenuService.spec` ist ein `computed` über `ActionService.label()` und die Menütexte – beide lesen das Sprach-Signal, das bestehende Effekt schickt die neue Spec (005 E6) | kein eigener Mechanismus nötig; Test: Spec wechselt mit der Sprache |
| E15 | **Theme**: `data-theme` auf `<html>` (`light`/`dark`, bei `system` entfernt; Tokens in `styles.css` seit 001 vorbereitet); dazu `set_window_theme` (Rust, `WebviewWindow::set_theme`), damit Titelleiste und `prefers-color-scheme` der WebView folgen. Lineale zeichnen neu, wenn das Theme wechselt (`themeChange`-Signal) | Canvas-Tokens beider Schemata: Kontrast-Test `theme-contrast.spec.ts` |
| E16 | Debug „Log Undo Grouping“: `UndoService` schreibt bei gesetztem Flag jede Zusammenfassung (merge, Geste begin/commit) mit `console.debug('[undo] …')` | legacy §9; nur Diagnose |
| E17 | Undo-/Redo-Namen werden erst beim Lesen übersetzt (`UndoState` trägt den Schlüssel, nicht den Text) | ein Sprachwechsel ändert sofort auch „Undo Change Fill“ im Menü |
| E18 | Browser-Modus: `FakeSettingsApi` mit `localStorage` (Fake-Persistenz, „Neustart“ = Reload in Playwright); Unit-Tests ohne Speicher | E2E „Neustart stellt wieder her“ |

## Verträge

### Rust (`ai-core::settings`)

```rust
pub const FILE_NAME: &str = "settings.json";
pub const SCHEMA_VERSION: u32 = 1;
pub const PANEL_MIN: u32 = 160; pub const PANEL_MAX: u32 = 480;
pub struct Settings { schema_version, theme, language, panels: Panels, canvas: CanvasSettings,
                      export: ExportSettings, freehand: FreehandSettings, debug: DebugSettings }
pub fn merge(base: &Value, input: &Value) -> Value;      // E2
pub fn migrate(value: Value) -> Value;                  // E3
pub fn sanitize(s: Settings) -> Settings;
pub fn from_value(v: &Value) -> Settings;               // migrate + merge + sanitize
pub fn apply_patch(current: &Settings, patch: &Value) -> Settings;   // E4
pub fn load(dir: &Path) -> Loaded<Settings>;
pub fn save(dir: &Path, s: &Settings) -> Result<(), FsError>;
```

JSON (camelCase):

```json
{ "schemaVersion": 1, "theme": "system", "language": "system",
  "panels": { "commands": { "visible": true, "width": 260 }, "hierarchy": { … 260 }, "properties": { … 300 } },
  "canvas": { "rulers": true, "guides": true, "background": true, "effects": true, "crossCursor": true,
              "handles": true, "snapToGrid": false, "magicSnap": true, "gridSize": 10,
              "gridOrigin": "worldZero", "selectionMode": "point", "zoom": 0, "appearance": "system",
              "mask": "squircle" },
  "export": { "format": "png", "appearances": ["light", "dark"], "sizes": [1024], "mask": "none",
              "effects": false, "targetDir": null },
  "freehand": { "epsilon": 2.5, "strokeWidth": 8, "closed": false },
  "debug": { "logUndoGrouping": false } }
```

### Commands (`src-tauri/src/settings_commands.rs`)

| Command | Zweck |
|---|---|
| `load_settings()` → `LoadedSettings { value, warning }` | Stand im Speicher, sonst Datei (einmal je Prozess) |
| `save_settings(patch)` → `Settings` | Patch anwenden, atomar schreiben (außer die Datei war unlesbar), `settings-changed { settings, from }` an alle Fenster |
| `reset_settings()` → `Settings` | Standardwerte schreiben, Ereignis wie oben |
| `set_window_theme(theme)` | `system`/`light`/`dark` für das aufrufende Fenster |

### Frontend

```ts
// core/settings
abstract class SettingsApi { load(); save(patch): Promise<Settings>; reset(): Promise<Settings>;
  onChanged(fn: (e: { settings: Settings; from: string }) => void); setWindowTheme(theme) }
// features/settings
SettingsStore { settings; loaded; warning; load(); set(key, value): boolean; update(patch); reset(); flush() }
SettingsSync { start() }        // E6, Theme, Sprache, Undo-Flag
setting-keys.ts (rein): SETTING_KEYS, valueAt(s, key), patchFor(key, value), sanitizeSettings(s), mergeSettings(a, patch)
// features/shell
LayoutStore { panels; widths; toggle(id); setWidth(id, px); resetWidth(id) }
panel-width.ts (rein): clampWidth, stepWidth(width, key, side, shift)
Splitter (app-splitter) [panel] [side]
// core/i18n
translatable(), phrasebook(), language, setLanguage, systemLanguage, CATALOGS
```

## Tests

- Rust (`ai-core::settings`): Standardwerte = `testdata/settings-cases.json` `defaults`; jeder Fall der Tabelle
  (Begrenzen, falsche Arten je Feld, Listen); Migration je Version (fehlend, 1, neuer, Text); kaputte Datei →
  `.bad`; unlesbar → nicht überschrieben; Patch; Reset; Roundtrip. Command-Schicht: `command_rules` (async).
- Vitest: `setting-keys` (gleiche Tabelle, Pfade, Patch), `SettingsStore` (anwenden, entprellt gebündelt,
  fremde Ereignisse, Reset), `SettingsSync` (Stores ↔ Einstellungen, keine Schleife), `panel-width` (Grenzen,
  Schritte, Seiten), Splitter-Komponente (Tasten, Doppelklick, ARIA), Settings-Dialog, i18n (tiefer Proxy,
  Phrasenbuch, Systemsprache), `catalogs.spec.ts`, Menü-Spec wechselt mit der Sprache, Kontraste der
  Canvas-Tokens in beiden Schemata.
- Playwright (`e2e/settings.spec.ts`): Seitenleiste ziehen → 160…480; Tastatur am Splitter; Reload stellt
  Breite/Sichtbarkeit/Canvas-Optionen wieder her; Sprache umschalten ändert Menü und Texte ohne Neustart;
  Theme setzt `data-theme`; Reset mit Bestätigung; `settings.set` über den Test-Hook.

## Fragen an Marc

1. Start-Zoom: „Fit (≤ 100 %)“ als Standard statt fest 100 % (E7) – ok? Ein fester Wert wird gespeichert,
   sobald du zoomst.
2. Cross Cursor ist jetzt standardmäßig **an** (legacy §9, Prompt) – vorher aus. Passt das?
3. Das Export-Ziel (Ordner) wird mitgespeichert. Lieber nur je Sitzung?
4. Auf dem Mac prüfen: natives Menü wechselt die Sprache ohne Neustart; `set_window_theme` färbt die
   Titelleiste; ⌘, öffnet die Einstellungen (App-Menü „Settings…“).
5. Unbekannte Felder einer neueren `settings.json` gehen beim nächsten Speichern verloren (wie editlicious) –
   reicht das?

## Fortschritt

- [x] Design
- [x] Rust `ai-core::settings` + Commands (`settings_commands.rs`), `MenuSpec.app` (Texte des App-/Fenstermenüs)
- [x] i18n + Kataloge Deutsch + Aktionsnamen + Phrasenbuch der Property-Namen
- [x] SettingsStore/Sync, Splitter, Dialog, Aktionen, Theme, Undo-Log
- [x] E2E (`e2e/settings.spec.ts`), echte App unter Xvfb, Doku

## Abweichungen und Hinweise

- Bestehende Tests angepasst, weil der Cross Cursor jetzt standardmäßig an ist (E9): `canvas-view.spec`,
  `app.spec`, `e2e/canvas.spec` (Fadenkreuz erst sichtbar, dann aus); Pixel-Proben ziehen den Zeiger vorher aus
  der Fläche (`e2e/canvas-helpers.ts`), der Masken-Pixeltest vergleicht mit ±2 je Kanal (der zusätzliche
  Compositing-Layer der Splitter rundet einen Verlauf um eine Stufe anders).
- Lineal-Schrift hell `--ai-ruler-text` von `#7a7e86` auf `#62666e` (Kontrast 3,6 → ≥ 4,5:1, neuer Test).
- „Gebündelt speichern“ geschieht im Frontend (400 ms, außerdem beim Verlassen/Fokusverlust des Fensters); Rust
  schreibt jeden Patch sofort atomar.
- Die Fenstergröße/-position speicherte `tauri-plugin-window-state` schon seit 001 – unverändert.
- Ein Zoom aus einem anderen Fenster wird nicht übernommen (E7), alle anderen Werte schon.
- Echte App (Debug-Build, Xvfb, eigener `XDG_CONFIG_HOME`): eine `settings.json` mit `language: de`, `theme: dark`,
  Hierarchie 340 px und einem kaputten Wert (`rulers: "bad"`) startet deutsch, dunkel, 340 px, Lineale an; ⌘, öffnet
  den Dialog; ein Haken schreibt die Datei sofort (gebündelt); ein zweites Fenster startet mit dem Stand, ⌘1 dort
  blendet die Befehlsleiste in **beiden** Fenstern aus/ein.
