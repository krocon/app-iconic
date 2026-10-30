# Design 082: Startbildschirm mit zuletzt benutzten Icons und Vorlagen

> Prompt: [082-startbildschirm-vorlagen.md](082-startbildschirm-vorlagen.md) · Stand: 30.10.2026 · Baut auf 003
> (FilesService, `recent.json`), 015 (Einstellungen), 030 (Startdatei aus argv/Finder/Zweitstart), 033 (`UserPaths`),
> 056 (Hilfslinien `data-guide`, Apple-Raster), 077/078 (`exportSvg`, resvg), 081 (Mockup-Szenen)

## Belege

- Apple HIG „App icons“ (developer.apple.com/design/human-interface-guidelines/app-icons, Stand 28.10.2026):
  „In iOS, iPadOS, and macOS, icons are square, and the system applies masking to produce rounded corners … In
  visionOS and watchOS, icons are square and the system applies circular masking.“ – „Produce appropriately shaped,
  unmasked layers … Providing layers with pre-defined masking negatively impacts specular highlight effects“ – „Keep
  primary content centered … Pay particular attention to centering content in visionOS and watchOS icons. To help
  with icon placement, use the grids in the app icon production templates“ – „Let the system handle blurring and
  other visual effects … there's no need to include … drop shadows“ – watchOS: „Avoid using black for your icon's
  background.“ – „Use your light app icon as the basis for your dark icon.“
- Daraus: Vorlagen haben **quadratische, unmaskierte Ebenen**; die Form (Squircle/Kreis) zeigt die Maske der Ansicht
  bzw. das System; der „Schatten“ der macOS-Vorlage ist der Gruppen-Schatten von `icon.json` (kein gemalter
  Schlagschatten); watchOS-Vorlage zentriert, kein schwarzer Hintergrund.
- `.icon`-Felder nur mit Beleg aus den Fixtures (`testdata/fixtures/camscanner.icon`, `all-fields.icon`) und
  `ai-core::icon::new_icon`: `fill` (`automatic`, `{ solid }`, `{ linear-gradient, orientation }`), `fill-specializations`
  (ohne/mit `appearance: dark`), `groups[].layers[]` (`image-name`, `name`), Layer-`fill-specializations`,
  `shadow { kind: neutral | layer-color, opacity }`, `translucency { enabled, value }`, `supported-platforms
  { circles: ["watchOS"], squares: "shared" }`; Farben als `srgb:r,g,b,a` mit fünf Nachkommastellen.

## Entscheidungen

- **E1 Startlogik** (`features/start/start-mode.ts`, rein): `startMode({ path, action, startup })` →
  `file` (Startpfad aus argv/Finder/Zweitstart/„Neues Fenster mit Datei“, 030) · `action` (das Fenster wurde für eine
  Aktion geöffnet, z. B. „Open Recent“/„Öffnen…“ ohne Fenster, 005 E6 – wie bisher leeres Dokument, dann die Aktion) ·
  `screen` (Einstellung `startup = startScreen`) · `empty` (`emptyDocument`). Schlägt das Laden der Startdatei fehl,
  folgt der Startbildschirm bzw. das leere Dokument. `FilesService.start(blank)` lädt die Datei oder legt – nur mit
  `blank` – ein leeres Dokument an und meldet, ob ein Dokument da ist; die App entscheidet und zeigt den Bildschirm.
- **E2 Startbildschirm im Fenster, kein Modal** (`StartScreen`, `StartService`): ersetzt die Arbeitsfläche (Seitenleisten
  + Canvas), Kopfzeile und Menü bleiben (⌘O, ⌘N, Einstellungen gehen weiter). `StartService.shownFor` merkt sich das
  Dokument, über dem er gezeigt wurde; `visible = shownFor !== undefined && files.store() === shownFor` – sobald ein
  anderes Dokument im Fenster ist (Öffnen, Drop, KI, Vorlage), verschwindet er von selbst. Esc schließt ihn nur, wenn
  ein Dokument dahinter liegt. Abschnitte: „Zuletzt benutzt“ (Vorschaubild, Name, Ort), „Vorlagen“ (Vorschau, Name,
  Beschreibung), Knöpfe „Leeres Icon“ und „Öffnen…“.
- **E3 Tastatur und Screenreader nach WAI-ARIA APG „Grid“** (www.w3.org/WAI/ARIA/apg/patterns/grid/): je Abschnitt ein
  `role="grid"` mit `aria-labelledby` (Überschrift), Zeilen `role="row"` zu je vier Zellen (`START_COLUMNS`),
  `role="gridcell"` mit `aria-label` (Name, Ort bzw. Beschreibung); **ein** Tab-Halt je Grid (roving `tabindex`),
  ←/→/↑/↓, Home/End, PageUp/PageDown (`gridMove` aus 013), Enter/Leertaste öffnet. Die Tasten behandelt das Grid
  selbst (wie die Symbolauswahl, 013 E20) mit `preventDefault` – der `KeyboardDispatcher` ignoriert sie dann; der
  Kontext-Provider gibt im Startbildschirm nur `global` frei (keine Canvas-Pfeile). Fokus beim Zeigen: erstes
  zuletzt benutztes Icon, sonst erste Vorlage (`file.newFromTemplate`: erste Vorlage). Kontraste über die Tokens.
- **E4 Vorschaubilder** (`ai-core::thumbnails`): **256 px** (Retina: 128 CSS-px scharf; Mockup-Nachbarn bis 3×)
  als PNG in `<app_config_dir>/thumbnails/<fnv1a64(path)>.png`, atomar (`write_atomic`), ≤ 512 KiB je Bild, nur für
  Pfade, die in `recent.json` stehen → höchstens `MAX_RECENT` Bilder. **Aufräumen synchron mit `recent.json`**: nach
  jedem `add_recent_file`/`save_thumbnail` werden Bilder ohne Eintrag gelöscht, „Clear Recent“ löscht alle (nur Dateien
  mit unserem Namensmuster, auch liegengebliebene Temp-Dateien). Nie im `.icon`. Das Verzeichnis berechnet Rust; die
  WebView bekommt **nie einen Pfad**, nur Data-URLs (`recent_entries`) – kein `allow_tree` nötig.
- **E5 Wann ein Vorschaubild entsteht**: nach jedem erfolgreichen **Speichern** und zusätzlich nach dem **Öffnen**
  (sonst hätten nie gespeicherte, nur geöffnete Icons keins). Das Frontend baut das Icon wie „Als PNG kopieren“
  (`exportSvg`, Erscheinungsbild Light, Maske und Effekte der Ansicht, 078 E7), Rust rendert mit resvg
  (`save_thumbnail(path, svg)`, Pfad geprüft mit `allowed`, 033). Fehler sind still (das Dokument ist gespeichert).
  `FilesService.onRecorded(fn)` meldet „Pfad steht jetzt in Recent“, der `ThumbnailService` hängt sich an – keine
  Abhängigkeit Files → Export.
- **E6 Ort** = Elternordner des Pfads, von Rust berechnet (`RecentEntryDto.location`) – Pfade bleiben im Frontend opak.
- **E7 Vorlagen aus TS** (`start-templates.ts` + `template-art.ts`, rein): `templateDocument(id)` liefert ein
  `IconDocumentDto` (`path: null`, `name: null`, Bundle) – kein Ressourcen-Bundle (kein Tauri-`resources`, keine
  Pfadfreigabe, im Browser-Modus gleich), testbar, übersetzbar. Neues Dokument aus Vorlage = **unbenannt**, unberührt
  (`pristine`), Speichern fragt nach dem Ort. Vier Vorlagen, eigene abstrakte Motive (keine fremden Logos):
  - `ios` – iOS-App-Icon mit **Keylines**: Verlauf (linear, Icon-Composer-Orientierung), eine Gruppe mit einem
    zentrierten Motiv; im Asset gesperrte **Hilfslinien** aus 056 (`guideMarkup`: Mitte 512, Keyline-Kreis 512 ⌀ →
    256/768, äußerer Rand 128/896 des Apple-Rasters) – in der Datei transparent, nicht im Export, fangen wie jede
    Konstruktionslinie; das Apple-Raster der Ansicht (056) liegt ohnehin darüber.
  - `macos` – macOS-Squircle mit Schatten: Verlauf, zwei Gruppen (Platte + Motiv), Gruppen-Schatten `layer-color`
    0.5 bzw. `neutral` 0.5; die Squircle-Form zeigt die Maske der Ansicht/des Systems (HIG: unmaskierte Ebenen).
  - `watchos` – rund: einfarbig (`solid`, nicht schwarz), zentriertes Motiv innerhalb des 820er-Kreises.
  - `lightDark` – Light/Dark-Paar: `fill-specializations` (Standard hell + `appearance: dark`), Layer-Fill dunkel per
    `fill-specializations` (Beleg `all-fields.icon`).
  `supported-platforms` überall wie `new_icon` (`circles: ["watchOS"], squares: "shared"`). Vorschauen im Startbildschirm
  = `exportSvg` der Vorlage als `data:image/svg+xml` (macOS mit `frame: 'macos'`, watchOS Kreis, sonst Squircle).
- **E8 Aktionen**: `file.newFromTemplate { template? }` (Menü File › New from Template…, ohne Argument: Startbildschirm
  mit Fokus auf den Vorlagen; mit Argument: direkt, fragt bei ungesicherten Änderungen wie „Neu“) und `file.startScreen`
  (Startbildschirm zeigen). Beide unter `file.` – für die KI gesperrt wie alle Datei-Aktionen (018 E12).
- **E9 Einstellung** `startup`: `startScreen` (Standard) | `emptyDocument`, Rust `Settings.startup` + `sanitize`, TS
  `settings-rules`, `settings-cases.json`, Einstellungen › Allgemein „Beim Start“. **Browser-Modus** (nur Dev/Playwright):
  ohne gespeicherte Einstellungen startet er mit `emptyDocument`, damit die bestehenden E2E-Tests auf dem leeren
  Dokument starten; der E2E-Test dieses Prompts setzt `startup` in den gespeicherten Einstellungen (Neustart = Reload,
  015 E18).
- **E10 Folge aus 081 – Mockup-Nachbarn**: `sceneSvg(…, neighbours)` zeichnet in die Platzhalter-Slots der Reihe nach
  die Vorschaubilder der zuletzt benutzten Icons (ohne das aktuelle Dokument) als `<image>` (Data-URL, in Rust ohne
  Nachladen, 012 E9); fehlen Bilder, bleiben die abstrakten Platzhalter. Das Vorschaubild ist bereits maskiert (Maske
  der Ansicht beim Speichern) – in der Szene wird es auf die Slot-Form beschnitten.

## Verträge

Rust (`ai-core::thumbnails`):

```rust
pub const DIR_NAME: &str = "thumbnails";
pub const SIZE: u32 = 256;
pub const MAX_BYTES: u64 = 512 * 1024;
pub fn file_name(path: &str) -> String;                       // "<16 hex>.png", FNV-1a 64
pub fn render(svg: &str, fonts: Arc<Database>) -> Result<Vec<u8>, FsError>;  // too_large über MAX_BYTES
pub fn store(dir: &Path, path: &str, png: &[u8]) -> Result<(), FsError>;
pub fn data_url(dir: &Path, path: &str) -> Option<String>;   // nur echte PNGs ≤ MAX_BYTES
pub fn prune(dir: &Path, keep: &[String]) -> usize;          // gelöschte Dateien
```

Commands (`src-tauri/src/thumbnail_commands.rs`, async, `spawn_blocking`):

- `save_thumbnail(path: String, svg: String) -> bool` – `allowed(path)`; `false`, wenn der Pfad nicht (mehr) in
  `recent.json` steht; unter `RecentLock`; danach `prune`.
- `recent_entries() -> RecentEntryDto[]` – `{ path, name, location, thumbnail: string | null }` der vorhandenen
  Einträge, neueste zuerst; Pfade als vertraut gemerkt wie `recent_files`.
- `add_recent_file`, `clear_recent_files` räumen die Vorschaubilder mit auf.

Frontend:

- `RecentFilesApi.entries(): Promise<RecentEntry[]>`, `saveThumbnail(path, svg): Promise<boolean>` (Fake: Regeln wie
  Rust – nur Pfade der Liste, aufräumen bei `add`/`clear`, Data-URL = das SVG).
- `FilesService.start(blank = true): Promise<boolean>`, `newFromTemplate(dto)`, `onRecorded(fn): () => void`.
- `StartService`: `visible`, `section`, `entries`, `templates`, `show(section?)`, `close()`, `openRecent(path)`,
  `openTemplate(id)`, `blank()`, `open()`.
- `ThumbnailService.record(path)`, `neighbours(exclude)`: Data-URLs für Mockups.
- `startMode(...)`, `TEMPLATE_IDS`, `templateDocument(id)`, `templatePreview(id)`, `START_COLUMNS`.

## Tests

- Rust: `thumbnails` – Name stabil/verschieden, Rendern 256 px + Grenze, `store` atomar + Grenze, `data_url` nur PNG,
  `prune` lässt Fremdes stehen, entfernt Verwaistes und Temp-Reste; `save_thumbnail` im Pfadtest; Settings-Fälle.
- Vitest: `startMode` (argv-Datei → kein Startbildschirm, Aktion → keiner, Einstellung), Vorlagenliste (vier, eigene
  Assets, nur belegte Felder, Keylines als gesperrte `data-guide`, Roundtrip über `IconDocument`), FilesService (Start
  ohne leeres Dokument, Vorlage unbenannt + `pristine`, `onRecorded` nach Öffnen/Speichern), StartService (sichtbar
  bis zum Dokumentwechsel), StartScreen (Grid-Rollen, Pfeiltasten, Enter), ThumbnailService, Settings-Fälle, Mockup-
  Nachbarn.
- Playwright (`e2e/start-screen.spec.ts`): Start im Browser-Modus mit `startup = startScreen` zeigt den Bildschirm;
  Tastatur im Grid; Vorlage iOS öffnen → Titel „Untitled“ mit Keylines (`[data-guide]`); Öffnen + Speichern →
  Vorschaubild unter „Zuletzt benutzt“.

## Fragen an Marc

1. Standard „Beim Start: Startbildschirm“ – oder lieber wie bisher ein leeres Dokument und den Startbildschirm nur auf
   Wunsch (File › New from Template…)?
2. Vorschaubilder auch beim **Öffnen** (nicht nur beim Speichern), damit jede Datei in „Zuletzt benutzt“ ein Bild hat –
   so gelassen?
3. Vorlagen-Inhalte sind bewusst schlicht (eigene Formen). Sollen es mehr/andere werden (z. B. Monogramm mit Text als
   Pfad, Tinted-Variante)?
4. **Mac**: VoiceOver im Startbildschirm und der Cache-Ort der Vorschaubilder (`app_config_dir`) prüfen.
