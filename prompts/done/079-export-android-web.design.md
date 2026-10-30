# Design 079: Export für Android (Adaptive Icons) und Web/PWA

> Prompt: [079-export-android-web.md](079-export-android-web.md) · Stand: 30.10.2026 · Baut auf 078 (Paket-
> Infrastruktur `PackageKind` → `PackagePlan`, Writer, `export_package`), 077 (Tinted-Rechnung `tinted.ts`), 033
> (Pfadschutz), 012 (Export-SVG im Browser)

## Belege (Plattform-Regeln)

- **Adaptive Icon** – Android Developers, „Adaptive icons“
  (developer.android.com/develop/ui/views/launch/icon_design_adaptive): „Size all layers to 108x108 dp“; „The outer
  18 dp on each of the four sides of the layers is reserved for masking and to create visual effects such as parallax
  or pulsing“ (→ sichtbarer Ausschnitt 72 dp); „The 66x66 safe zone … is never clipped by a shaped mask defined by an
  OEM“; Logo „at least 48x48 dp … must not exceed 66x66 dp“. XML in `res/mipmap-anydpi-v26/ic_launcher.xml` mit
  `<background>`, `<foreground>`, `<monochrome android:drawable=…>`; Themed Icons ab Android 13 (API 33), ab Android 16
  QPR 2 themt das System auch Apps ohne eigene Monochrom-Ebene. `android:roundIcon="@mipmap/ic_launcher_round"`
  optional für runde Launcher.
- **Dichten** – Android Developers, „Support different pixel densities“ (mdpi 1×, hdpi 1,5×, xhdpi 2×, xxhdpi 3×,
  xxxhdpi 4×; Launcher-Icons in `mipmap-*`). Die Seite war im Container nicht abrufbar (Freigabe-Sperre); die Faktoren
  sind die seit Jahren dokumentierten und stimmen mit den Ordnern von Android Studios Image Asset Studio überein.
  Legacy-Icon 48 dp → 48/72/96/144/192 px, Ebenen 108 dp → 108/162/216/324/432 px.
- **Google Play** – „Google Play icon design specifications“
  (developer.android.com/google-play/resources/icon-design-specifications, deutsche Fassung gelesen): 512 × 512 px,
  32-Bit-PNG, sRGB, max. 1024 KB, „Form: Volles Quadrat – Google Play erzeugt automatisch Maskierungen“, keine
  Schatten; Hintergrund „möglichst … keine Transparenz“ (sonst scheint die Oberfläche durch).
- **Maskable** – web.dev, „Adaptive icon support in PWAs with maskable icons“: sichere Zone = „a circular area in the
  center of the icon with a radius equal to 40% of the icon width“; das Bild soll deckend sein („supply an opaque
  image with some padding“); `"purpose": "maskable"` als eigenes Icon, nicht mit `any` kombinieren.
- **Favicon-SVG** – web.dev, „Building an adaptive favicon“: `@media (prefers-color-scheme: dark)` im `<style>` des
  SVG, `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`.
- **apple-touch-icon** – Apple, Safari Web Content Guide, „Configuring Web Applications“: `apple-touch-icon.png` im
  Wurzelverzeichnis bzw. `<link rel="apple-touch-icon" …>`, Beispiel `sizes="180x180"` (iPhone Retina). Zur
  Transparenz sagt die Seite nichts; transparente Bereiche erscheinen auf dem Home-Bildschirm in einer vom System
  gewählten Farbe (verbreitete Beobachtung, nicht belegt) – daher deckend, flach auf Weiß (E6).
- **Manifest** – W3C Web App Manifest, `icons[]` mit `src`, `sizes`, `type`, `purpose`; 192 und 512 sind die Größen,
  die Chromium für die Installierbarkeit verlangt.
- `favicon.ico` 16/32/48 aus dem Prompt; `<link rel="icon" href="/favicon.ico" sizes="32x32">` nach verbreiteter
  Praxis (sonst bevorzugt Chromium das ICO vor dem SVG) – keine offizielle Quelle, Frage 3.

## Entscheidungen

- **E1 Infrastruktur**: zwei neue `PackageKind`-Varianten `android { monochrome }` und `web` mit eigenen Plänen
  (`ai-core::export::android`, `export::web`), sonst alles aus 078 (Writer, Ordner daneben bauen und tauschen,
  Fortschritt, Abbruch, Command, Fake, MCP-Tool). Neu im Plan: `Content::Svg { source }` (Quelle wird – nach einem
  Probe-Parse mit usvg – unverändert geschrieben, für `favicon.svg`) und `Content::Ico { source, sizes }` (Größen je
  Plan, `.ico` weiter mit `ICO_SIZES`). Der Renderer zog nach `export/package_render.rs` (package.rs blieb < 400
  Zeilen).
- **E2 Android-Ordner** `android/` (zum Einfügen in `app/src/main/`): `res/mipmap-anydpi-v26/ic_launcher.xml` und
  `ic_launcher_round.xml` (gleicher Inhalt), je Dichte `ic_launcher.png` (Legacy, Squircle), `ic_launcher_round.png`
  (Legacy, Kreis), `ic_launcher_foreground.png`, `ic_launcher_background.png` (flach auf Weiß, RGB ohne Alpha),
  optional `ic_launcher_monochrome.png`; dazu `ic_launcher-playstore.png` (512, volles Quadrat, flach auf Weiß).
  Ebenen als PNG in `mipmap-*` (wie Image Asset Studio bei Bild-Quellen), Verweise `@mipmap/…`. Referenz-XML
  `testdata/export/android/ic_launcher.xml`. 28 Dateien mit Monochrom, 23 ohne.
- **E3 Abbildung der Fläche**: Die 1024er `.icon`-Fläche wird der **72-dp-Ausschnitt** der 108-dp-Ebene (Skala 2/3,
  18 dp Rand je Seite) – Android zeigt dann denselben Bildausschnitt wie iOS im Squircle. Die Füllung des Icons läuft
  bis an den Rand der Ebene (Rechteck vergrößert, Verlauf per `gradientTransform` in Flächen-Koordinaten gehalten);
  Gruppen bleiben in der Fläche. Folge: Inhalt in den Ecken der Fläche liegt außerhalb der 66-dp-Zone und kann von
  runden Masken beschnitten werden – wie unter watchOS. Alternative (Fläche = 66 dp, alles sicher, aber kleiner):
  Frage 1.
- **E4 Gruppen → Ebenen** (rein, `androidLayers(groupCount, backgroundGroups)`): Empfehlung des Prompts – Hintergrund =
  Füllung des Icons, Vordergrund = alle Gruppen; im Dialog je Gruppe „Vordergrund/Hintergrund“ wählbar, KI-Argument
  `backgroundGroups` (icon.json-Indizes). Die Wahl gehört zum Dokument und landet nicht in den Einstellungen; unbekannte
  Indizes werden übergangen.
- **E5 Monochrom**: die Vordergrund-Gruppen durch die Tinted-Rechnung von 077 (`tintFilter`, Luminanz × Weiß = Grau,
  `GREY_TINT`), mit den `tinted`-Spezialisierungen des Dokuments, ohne Füllung. Android färbt die Ebene beim Themen
  selbst ein; maßgeblich ist ihre Form (Alpha). Standard an (`monochrome: true`).
- **E6 Web-Ordner** `web/` (für das Wurzelverzeichnis): `favicon.ico` (16/32/48, Maske der Wahl), `favicon.svg`,
  `apple-touch-icon.png` (180, ohne Maske, flach auf Weiß – iOS maskiert selbst), `icon-192.png`/`icon-512.png`
  (`purpose: any`, Maske der Wahl, Transparenz bleibt), `icon-maskable-512.png`, `manifest.webmanifest` (nur `icons`,
  zum Einfügen ins eigene Manifest) und `snippet.html` (`<link>`-Tags). Pfade absolut zur Wurzel (`/favicon.svg`).
  Referenzen `testdata/export/web/` (Rust und TS vergleichen wörtlich).
- **E7 Maskable**: Fläche auf **80 %** skaliert – ihr Inkreis ist genau die sichere Zone (Radius 40 %); die Füllung
  läuft bis an den Rand, flach auf Weiß (deckend). Außerhalb der sicheren Zone liegt so nur Füllung, solange der Inhalt
  im Inkreis der Fläche bleibt (Apples Raster empfiehlt das ohnehin).
- **E8 `favicon.svg`** (`favicon-svg.ts`): Light- und Dark-Export-SVG (Maske der Wahl) in einer Datei, je Hälfte eine
  Gruppe `.ai-light`/`.ai-dark` mit eigenem Id-Präfix (`prefixIds`), dazu
  `<style>.ai-dark{display:none}@media (prefers-color-scheme: dark){…}</style>`. Gleiche Hälften → nur Light.
- **E9 Dialog**: Formate „Android“ und „Web / PWA“ (Radio) mit Hinweis; Android: Monochrom-Schalter und je Gruppe eine
  Auswahl Vordergrund/Hintergrund (Gruppenname wie im Ebenenbaum); Web: Maske, HTML-Snippet und Manifest-Ausschnitt
  als `<pre>` mit „Kopieren“ (Text über `ClipboardApi.writeText`, Statuszeile „Kopiert“). Eigene Komponente
  `ExportPackageFields` (Dialog bleibt < 400 Zeilen). Keine Appearances, keine Größen.
- **E10 KI**: Aktionen `file.exportAndroid` / `file.exportWeb` (Menü Datei, `EXPORT_ARGS` + `monochrome`,
  `backgroundGroups`), MCP-Tool `export_package` mit `format: android|web`, `monochrome`, `background_groups`
  (Schnappschuss neu). Keine neuen Fehlercodes, keine neuen Abhängigkeiten.
- **E11 Einstellungen**: `export.format` kennt `android`/`web` (Rust `settings`, TS `settings-rules`,
  `testdata/settings-cases.json`). Monochrom und Ebenenwahl bleiben Sitzungswerte.

## Verträge

- Rust `ai-core::export`: `PackageKind::{Android { monochrome }, Web}`, `Content::{Svg { source }, Ico { source,
  sizes }}`, `package::source::{ANDROID_FOREGROUND, ANDROID_BACKGROUND, ANDROID_MONOCHROME, ANDROID_LEGACY,
  ANDROID_ROUND, ANDROID_PLAY, WEB_ANY, WEB_FAVICON, WEB_TOUCH, WEB_MASKABLE}`; `android::{plan, adaptive_xml, px,
  DENSITIES, FOLDER, LAYER_DP, LEGACY_DP, PLAY_SIZE}`; `web::{plan, MANIFEST, SNIPPET, FAVICON_SIZES, TOUCH_SIZE,
  FOLDER}`.
- TS: `PackageKind` `{ kind: 'android'; monochrome } | { kind: 'web' }`; `ExportChoice.monochrome`,
  `.backgroundGroups`; `PackageSourceSpec.groups/fill/scale/colorScheme`; `packageSources(kind, choice, groupCount)`;
  `ExportSvgOptions.groups/fill/scale`; `export-android-web.ts`: `androidLayers`, `parseGroupIndexes`,
  `androidFiles`, `WEB_FILES`, `WEB_MANIFEST`, `WEB_SNIPPET`, `ANDROID_CANVAS_SCALE`, `WEB_MASKABLE_SCALE`;
  `favicon-svg.ts`: `colorSchemeSvg`, `SCHEME_CLASS`; `ExportService.groupChoices`.

## Tests

- Rust: XML gegen Schnappschuss (mit/ohne Monochrom), Größen je Dichte, Quellen/Hintergründe des Plans; Manifest und
  Snippet gegen die Referenzdateien, Manifest gültiges JSON, jede genannte Datei geplant; auf Platte: Ordnerstruktur,
  jede PNG-Größe, RGB (Hintergrund, Play, Touch, Maskable) vs. RGBA (Vordergrund, icon-192/512), `favicon.ico` 16/32/48,
  `favicon.svg` byte-gleich, ungültiges Favicon → `invalid_svg` und nichts geschrieben, sichere Zone (Maskable-Quelle
  wie im Frontend: außerhalb des 80-%-Quadrats nur Füllung, innen der Inhalt), serde-Tags; MCP-Schnappschuss.
- Vitest: `androidLayers`, `parseGroupIndexes`, Optionen/Argumente/Dateizahl, Arten und Dateinamen, Texte gegen
  Fixtures, Quellen je Art (Vordergrund ohne Füllung, Monochrom grau, Legacy/Round-Masken, Maskable 0,8),
  `exportSvg` mit `scale`/`groups`/`fill` (+ Verlauf), `colorSchemeSvg`; Service (Quellen-SVGs), Dialog (Ebenen,
  Monochrom, Kopieren inkl. Fehler), MCP `export_package android/web`, Einstellungsfälle.
- Playwright (`e2e/export-android-web.spec.ts`): Android über das Menü (Ebenenwahl, 28 Dateien, Vordergrund lässt den
  18-dp-Rand frei); Web: Snippet/Manifest in die echte Zwischenablage, `favicon.svg` mit
  `page.emulateMedia({ colorScheme })` hell/dunkel gemalt, Maskable: außerhalb der sicheren Zone pixelgleich mit dem
  Bild ohne Gruppen, innen nicht.
- Ende-zu-Ende: `scripts/mcp-e2e.mjs` gegen die echte App (Debug-Build, Xvfb) mit `android` und `web`.

## Ende-zu-Ende (30.10.2026, Container, Debug-App unter Xvfb)

- `scripts/mcp-e2e.mjs` gegen die echte App (Sidecar über stdio): `export_package android` → 28 Dateien, XML mit
  `<monochrome>`, Vordergrund xxxhdpi 432 px, Legacy mdpi 48 px, Play-Icon 512 als RGB; `export_package web` → 8
  Dateien, `favicon.ico` mit 16/32/48 (ImageMagick `identify`: PNG-Einträge), Touch-Icon 180, Maskable RGB, Manifest mit
  drei Icons. Das Testdokument hat gleiche Light/Dark-Hälften → `favicon.svg` ist (wie entschieden) nur Light.
  Sichtprüfung (Montage): Vordergrund mit freiem 18-dp-Rand, Hintergrund vollflächig, Monochrom grau, Legacy im
  Squircle/Kreis, Maskable mit Füllung bis zum Rand.

## Fragen an Marc

1. Android-Abbildung: Fläche = 72-dp-Ausschnitt (wie umgesetzt, gleicher Bildausschnitt wie iOS, Ecken können von runden
   Masken beschnitten werden) – oder Fläche = 66-dp-Zone (alles sicher sichtbar, Motiv etwas kleiner)?
2. **Gerät/Emulator**: Den Ordner `android/` in ein Projekt kopieren – zeigt der Launcher Vordergrund/Hintergrund mit
   Parallaxe, Themed Icon (Android 13+) und die Legacy-Icons auf API < 26 wie erwartet?
3. `favicon.ico` mit `sizes="32x32"` im Snippet (Praxis gegen Chromiums ICO-Vorliebe) – oder `sizes="any"`?
4. Monochrom = Form der Vordergrund-Gruppen (Alpha) aus der Tinted-Rechnung – oder lieber Luminanz → Alpha (helle
   Stellen deckend, dunkle durchsichtig)?
