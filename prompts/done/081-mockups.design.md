# Design 081: Icon im Kontext – Mockup-Vorschau

> Prompt: [081-mockups.md](081-mockups.md) · Stand: 30.10.2026 · Baut auf 057 (Small Preview: Export-SVG, gedrosselt),
> 077 (Light/Dark/Tinted, `exportSvg`), 078 (macOS-Rahmen, PNG über Rust in die Zwischenablage), 033 (`settledComputed`)

## Belege (Pixelgrößen je Szene)

- **iPhone Home Screen 60 × 60 pt, Spotlight 40 × 40 pt, Mitteilung 20 × 20 pt** – Apple, „Asset Catalog Format
  Reference“, `AppIconType`, Tabelle `size` (developer.apple.com/library/ios/documentation/Xcode/Reference/
  xcode_ref-Asset_Catalog_Format/AppIconType.html): „60x60 – The main iPhone app icon for iOS 7 or later“, „40x40 –
  An iPhone or iPad Spotlight search results icon“, „20x20 – An iPhone or iPad notification icon“. Die aktuelle HIG
  „App icons“ nennt nur noch die 1024er-Vorlage („the system automatically scales your icon … for locations such as
  Settings and notifications“) – daher die Archiv-Referenz (Frage 1).
- **Dock 64 pt** – Dock-Payload `tilesize` „Size of Dock icons in points. Range: 16–128. Default: 64“ (Applivery,
  Dock configuration, nach Apples Device-Management-Schlüssel `com.apple.dock`; Apples eigene Seite
  developer.apple.com/documentation/devicemanagement/dock war im Container nicht lesbar – Frage 2). Die Kachel trägt
  das macOS-Bild der 1024er-Vorlage (824er-Körper, 100 Rand, Schatten – 078 E4).
- **Windows-Taskleiste 24 × 24 px bei 100 %** – Microsoft, „App icon construction“
  (learn.microsoft.com/windows/apps/design/iconography/app-icon-construction), Tabelle der Skalierungen: „Taskbar,
  search results, Start all apps list | 24px | 30px | 36px | 48px …“.
- Alles andere (Abstände, Leisten, Paneele, Hintergründe) ist **eigene, neutrale Gestaltung** ohne Anspruch auf
  Systemtreue.

## Entscheidungen

- **E1 Ort: Popover „Im Kontext“** (`view.mockups`, Menü Ansicht unter „Vorschau in kleinen Größen“): neue
  `DialogKind` `mockups` in `POPOVER_KINDS` (073 E3) – nicht modal, die Zeichenfläche bleibt bedienbar, Esc schließt,
  Fokus hinein und zurück wie bei den anderen Popovern. Ein eigenes Fenster bräuchte einen zweiten Dokumentzustand
  (jedes Fenster ist eine WebView mit einem Dokument, 003) – unverhältnismäßig.
- **E2 Szenen** (`features/mockups/mockup-scenes.ts`, rein): `dock` (520 × 120 pt, 7 Kacheln à 64 pt auf einer
  Leiste, eigene in der Mitte mit Laufpunkt und Namen), `homeLight` / `homeDark` (360 × 292 pt, Raster 4 × 3 à 60 pt
  mit Beschriftung, eigene in Reihe 2/Spalte 2), `spotlight` (360 × 220 pt: Suchfeld, Treffer 40 pt mit Namen,
  Mitteilung 20 pt), `taskbar` (480 × 96 px: 48 px Leiste, 7 Schaltflächen à 40 px mit 24-px-Icons, eigene aktiv).
  Maße in Punkten = CSS-Pixeln bei 100 % – auf Retina zeigt der Bildschirm die echte Gerätegröße. Layout-Daten:
  `Slot` (eigene Icons), `Placeholder` (Ton-Index), `Panel`, `Line` (Name oder abstrakter Balken), `marks`,
  `highlight`.
- **E3 Eigene neutrale Grafik**: Hintergründe = eigener Verlauf + zwei weiche Kreise (hell/dunkel), Paneele
  halbtransparent, Texte nur der Icon-Name (sonst Balken), Nachbar-Icons = abgerundete Quadrate in eigenen Tönen
  (`TONES`) mit abstrakten Formen (Kreis, Quadrat, Dreieck, Ring, Raute, Balken). Keine Apple-/Microsoft-Hintergründe,
  -Icons, -Logos, -Schriftzüge, Systemschrift „sans-serif“. Die Szenenfarben sind Bildinhalt (wie das Icon), nicht
  UI – daher Konstanten in `mockup-svg.ts`, nicht `styles.css`.
- **E4 Erscheinungsbild je Szene** (Sitzung): Light/Dark/Tinted (077) als Radiogruppe je Szene, Start: Dock/Spotlight/
  Taskleiste Light, Home hell Light, Home dunkel Dark. Der Hintergrund folgt `theme`: Home hell/dunkel fest, die
  anderen nach dem Erscheinungsbild (Light → hell, sonst dunkel). Platzhalter: Light farbig, Dark dunkle Fläche mit
  farbiger Form, Tinted grau.
- **E5 Icon-Quelle = Export-SVG** (`exportSvg` wie 057) je „Look“: Dock `frame: 'macos'` (wie `.icns`, 078 E4),
  iOS-Szenen `mask: 'squircle'` (das System maskiert), Taskleiste die Maske der Ansicht (wie `.ico`, 078). Effekte und
  Tönung aus der Ansicht. Je Look × Erscheinungsbild höchstens ein `exportSvg` pro Neuzeichnen.
- **E6 Eine Szene = ein SVG** (`mockup-svg.ts`, `sceneSvg`): das Icon als verschachtelte `data:image/svg+xml;base64`
  (`svgDataUrl`, UTF-8), eigenes Hintergrundbild als `<image preserveAspectRatio="xMidYMid slice">`. Jedes `href`
  ist eine Data-URL – im Browser als `<img>` (Bild-Sandbox, keine Skripte), in Rust ohne Nachladen (012 E9).
- **E7 Gedrosselt, nie während einer Geste**: nur bei offenem Popover; `settledComputed(store, revision)` hält
  während Ziehen/Live-Feldern still, danach 300 ms Entprellung, Sequenznummer verwirft veraltete Zeichnungen.
- **E8 PNG kopieren/sichern** (`mockups.copyPng` / `mockups.savePng { scene?, scale? }`, Standard: zuletzt benutzte
  Szene, Maßstab 2×): das Frontend baut das Szenen-SVG frisch (auch ohne offenes Popover), Rust rendert mit resvg im
  **eigenen Seitenverhältnis** (`ai-core::export::scene::render_scene`, Maßstab 1–4, längste Seite ≤ 4096 px) –
  `copy_png` (078) rendert nur Quadrate in Export-Größen. Kopieren über denselben `arboard`-Schreiber wie 078
  (`copy_scene_png`); Sichern mit **Speicherdialog in Rust** (`save_scene_png(svg, scale, suggestedName)`: Name
  bereinigt, `.png`), atomar geschrieben, als Export gemerkt (Im Ordner zeigen). Kein Pfad aus der WebView → keine
  `UserPaths`-Prüfung nötig. UI bietet 1×/2×/3× (`mockups.scale`).
- **E9 Eigenes Hintergrundbild** (`mockups.background`): nur über den pfadgeprüften Öffnen-Dialog `pick_image_file` →
  `read_image_file` (Größe, Magic Bytes in Rust); nur PNG/JPEG/WebP (resvg `raster-images` dekodiert sie), SVG wird
  abgelehnt (Hinweis). Gilt für alle Szenen, Sitzung; `mockups.clearBackground` entfernt es.
- **E10 Nachbar-Icons aus „Zuletzt benutzt“**: Vorschaubilder gibt es erst mit dem Thumbnail-Cache aus 082 – hier
  daher nur Platzhalter; **Folge für 082**: `recent`-Thumbnails als Quelle für die Platzhalter anbieten.
- **E11 KI**: `view.mockups`, `mockups.appearance`, `mockups.scale` erlaubt; `mockups.copyPng` (Zwischenablage),
  `mockups.savePng` und `mockups.background` (Dateidialoge) stehen auf der Sperrliste (`mcp-policy`), wie `file.*`.
- **E12 Barrierefreiheit**: Popover mit Überschrift, jede Szene ein `<section aria-labelledby>`, Bild-`alt` =
  „<Name> in <Szene>, <Erscheinungsbild>“, Erscheinungsbild als native Radiogruppe, alle Steuerelemente per Tab; der
  erste Fokus liegt auf dem Maßstab.

## Verträge

```ts
// core/export/export-api.ts
abstract copyScenePng(svg: string, scale: number): Promise<void>;                       // copy_scene_png
abstract saveScenePng(svg: string, scale: number, suggestedName: string): Promise<string | null>; // save_scene_png

// features/mockups
type SceneId = 'dock' | 'homeLight' | 'homeDark' | 'spotlight' | 'taskbar';
SCENES: SceneSpec[]; sceneLayout(id): SceneLayout; sceneTheme(spec, appearance)
sceneSvg(input: SceneInput): string; svgDataUrl(svg): string
MockupsService: visible, appearances, scale, current, background, scenes(): SceneView[],
  setAppearance(scene, a), copyPng(args), savePng(args), pickBackground(), clearBackground(), sceneSvgNow(id)
```

```rust
// ai-core::export::scene
pub const SCENE_SCALES: RangeInclusive<u32> = 1..=4; pub const MAX_SCENE_EDGE: u32 = 4096;
pub fn render_scene(svg, scale, fonts) -> Result<Pixmap, FsError>   // invalid_request, too_large, invalid_svg
pub fn copy_scene(svg, scale, fonts, sink: &mut impl ImageSink)
pub fn write_scene(svg, scale, path, fonts)                           // write_atomic
pub fn scene_file_name(name) -> String
// App: drop_files::copy_scene_png(svg, scale), export_commands::save_scene_png(svg, scale, suggested_name) -> Option<String>
```

## Tests

- Rust (`scene.rs`): Seitenverhältnis je Maßstab, verschachteltes Icon gezeichnet, Grenzen (Maßstab, 4096,
  ungültiges SVG), externe Verweise nie geladen, Kopieren = straight RGBA in Szenengröße, Sichern atomar (kein Rest
  bei Fehler), Dateinamen; `commands_are_async` zählt 7.
- Vitest: `mockup-scenes.spec` (Größen je Szene, alles innerhalb, keine Überlappung, Dock-Mitte, Raster gleichmäßig,
  Taskleiste zentriert, Themes), `mockup-svg.spec` (Größe, Titel, Slots, nur `data:`-Verweise in allen Szenen ×
  Erscheinungsbildern, hell ≠ dunkel, Hintergrundbild, Escaping, UTF-8), `mockup-assets.spec` (**keine fremden
  Assets**: `public/` nur `favicon.png` + `icon.svg`, keine Bilddatei unter `src/`, Mockup-Code ohne URLs/Bild-Importe,
  Szenen ohne Icon/Hintergrund rein vektoriell), `mockups.service.spec` (Kopieren/Sichern, Fehler, Dark-Variante =
  `exportSvg(…, 'dark', squircle)`, Hintergrund nur Raster, Zeichnen nach Änderung, **nicht während einer Geste**),
  `mockups-dialog.spec` (Popover nicht modal, Szenen beschriftet, Radios/Buttons → Aktionen).
- Playwright (`e2e/mockups.spec.ts`): Kreis hinzufügen → alle fünf Szenen tragen ihn (verschachteltes Icon) und das
  Pixel im Home-Icon ist blau; Dark-Szene zeigt die Dark-Variante (Export-Hintergrund `#3a3a3c`, Pixel dunkler als in
  der hellen Szene), per Tastatur auf Light umschaltbar; Kopieren/Sichern landen im Fake.
- Rust-Rendering echter Szenen aus dem Browser (einmalig von Hand): alle vier Arten mit resvg bei 2× gerendert,
  Icon, Text und Formen wie im Browser.

## Fragen an Marc

1. Mitteilungen: das Icon mit 20 pt aus der Archiv-Referenz – neuere iOS-Banner zeigen es sichtbar größer (≈ 38 pt?).
   Größer zeichnen, sobald es eine offizielle Quelle gibt?
2. Dock-Standardgröße 64 pt (Dock-Payload) – auf einem frischen Mac nachsehen (`defaults read com.apple.dock tilesize`).
3. **Mac**: Szene als PNG kopieren (2×) und in Keynote/Vorschau einfügen – kommt das Bild in Szenengröße an?
