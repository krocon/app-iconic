# Design 078: Export für Xcode, macOS und Windows; PNG in die Zwischenablage

> Prompt: [078-export-apple-windows.md](078-export-apple-windows.md) · Stand: 30.10.2026 · Baut auf 012 (Export),
> 033 (Pfadschutz), 071 (`arboard`), 077 (`exportVariants`, Tinted-Rechnung)

## Belege (Plattform-Regeln)

- **Xcode, Asset-Katalog** – Apple, „Configuring your app icon using an asset catalog“
  (developer.apple.com/documentation/xcode/configuring-your-app-icon): iOS/iPadOS/watchOS „Single Size“ aus **einem
  1024 × 1024**-Bild; **macOS braucht jede Größe**; iOS kennt **Light, Dark, Tinted** („Provide your tinted app icon
  as a grayscale image. Provide your dark app icon with a transparent background so the system-provided background
  can show through.“); Hinweis auf Icon Composer (Xcode 26 nimmt `.icon` direkt).
- **Contents.json** – Apple, „Asset Catalog Format Reference“ (Documentation Archive, `AppIconType`,
  `ImageSetType`): `images[]` mit `filename`, `idiom`, `size`, `scale`; `info { author, version: 1 }`; Idiome u. a.
  `universal`, `mac`, `ios-marketing`, `watch`; macOS-Größen 16, 32, 128, 256, 512. **`appearances` /
  `luminosity` mit `dark`/`tinted` und `platform: ios|watchos`** stehen in keiner Apple-Referenz, sondern sind das
  Format, das Xcode 15/16 für die Wells „Any/Dark/Tinted“ und „Single Size“ schreibt (vielfach in Projekten zu sehen) –
  übernommen, Prüfung in Xcode = Frage 1.
- **App-Store-Icon ohne Alpha**: App Store Connect lehnt ein Marketing-Icon mit Alphakanal ab („can't be transparent
  nor contain an alpha channel“) – daher RGB-PNG ohne Alphakanal (nicht nur „alle Pixel deckend“).
- **macOS-Raster** (vor macOS 26): 1024er-Fläche, Körper 824 × 824 mit Eckradius 185,4, 100 Einheiten Rand, Schatten
  28 px Unschärfe, 12 px nach unten, Schwarz 50 % (Apple Developer Forums, Thread 670578, nach Apples Vorlage aus
  „Apple Design Resources“); HIG „App icons“: macOS-Icons in eigener Form liefern (Mac Catalyst ausgenommen). Seit
  macOS 26 maskiert das System selbst – Frage 2.
- **`.icns`** – Apple, „Optimizing for High Resolution“ (Archiv): Iconset `icon_16x16.png` … `icon_512x512@2x.png`,
  `iconutil -c icns`. OSTypes (`icp4`, `icp5`, `ic07`–`ic14`) nach der verbreiteten Formatbeschreibung (Wikipedia
  „Apple Icon Image format“ – im Container nicht abrufbar, daher aus der Literatur übernommen; Frage 3).
- **`.ico`** – Microsoft, „Icons in Win32“ (`ICONDIR`/`ICONDIRENTRY`: reserved, type 1, count; Breite/Höhe als Byte,
  0 = 256 nach Konvention), „App icon construction“: „at the bare minimum: 16x16, 24x24, 32x32, 48x48, and 256x256“
  (+ 64 aus dem Prompt). PNG-kodierte Einträge seit Windows Vista.

## Entscheidungen

- **E1 Paket-Infrastruktur** (`ai-core::export::package`): `PackageKind` (serde, Tag `kind`: `appIconSet { ios,
  appearances, macos, watchos }`, `icns`, `ico`) → `PackagePlan { folder?, files: [PlannedFile { path, content }] }`;
  `Content` = `Text` | `Png { source, size, background? }` | `Icns { source }` | `Ico { source }`. Ein Writer für
  alle Arten: Quellen (`PackageSource { id, svg }`) prüfen (eindeutig, jede benutzt, keine fehlt, ≤ 8, Größengrenze),
  jede Quelle einmal parsen, jede Größe einmal rendern, Fortschritt nach jeder Datei, Abbruch vor jedem Rendering.
  **Ordner** (`AppIcon.appiconset`) wird daneben gebaut (`.<name>.tmp-…`) und mit `bundle::swap_into_place`
  getauscht wie ein `.icon`-Bundle – er erscheint ganz oder gar nicht; ein abgebrochener Satz hinterlässt nichts.
  Einzeldateien (`.icns`, `.ico`) je `write_atomic`. Überschreiben nur mit `overwrite` (der Ordner zählt als ein
  Ziel). Quellen baut das Frontend (`features/export/export-packages.ts`: Id → Appearance, Maske, Rahmen, Tönung),
  weil das Export-SVG im Browser entsteht (012 E1).
  **Erweiterung (079):** neue `PackageKind`-Variante + ihr Plan (eigenes Modul wie `appiconset.rs`, liefert Ordner,
  Text-Dateien wie XML/Manifest und PNGs mit Quelle/Größe) + Quellentabelle und Dateinamen in `export-packages.ts`;
  Writer, Command, Fortschritt, Abbruch, Fake, Dialog-Zählung, `export_package` (MCP) bleiben. Unterordner gehen
  schon (`mipmap-xxhdpi/ic_launcher.png`: Pfade mit `/`, geprüft ohne `..`).
- **E2 Xcode-Satz**: Ordner `AppIcon.appiconset` (Xcodes Standardname – ersetzt den der Vorlage), `Contents.json`
  im Xcode-Stil (`"key" : value`, zwei Leerzeichen, Schlüssel alphabetisch, `info.author = xcode`), Dateien
  `ios-1024.png`, `ios-1024-dark.png`, `ios-1024-tinted.png`, `mac-<pt>x<pt>@<s>x.png`, `watchos-1024.png`.
  Referenz `testdata/export/AppIcon.appiconset.Contents.json` (unabhängig erzeugt), Rust vergleicht wörtlich, TS
  (`packageFiles`) die Dateiliste.
- **E3 iOS**: keine Maske (das System maskiert). Standardbild = App-Store-Icon: auf **Weiß** flach gerechnet, als
  **RGB-PNG ohne Alphakanal**; Light ist immer dabei. Dark und Tinted behalten Transparenz (Apple). Tinted mit der
  Tönung **Weiß** = Graustufen (077 E2 `tintedMatrix('#ffffff')`), die Tönung der Ansicht gilt hier nicht.
- **E4 macOS**: Quelle mit Apple-Rahmen (`exportSvg(…, { frame: 'macos' })`): Inhalt auf 824 skaliert, 100 Rand,
  Squircle-Clip (004 E8), Schatten `feDropShadow` dy 12, stdDeviation 14 (≈ Radius 28), Schwarz 50 %; nur Light
  (macOS-Asset-Kataloge kennen keine Dark-Variante). 16–512 pt je @1x/@2x (10 Bilder, 7 Renderings).
- **E5 watchOS** (optional, Standard aus): ein 1024er `platform: watchos`, ohne Maske, auf **Schwarz** flach (wie das
  Uhr-Display um den Kreis), RGB ohne Alpha.
- **E6 `.icns`/`.ico`: eigene Writer** (`export/containers.rs`, je ~30 Zeilen + Leser für Tests) statt der Crates
  `icns`/`ico`: beide Formate sind Kopf + Tabelle, die PNG-Bytes liefert tiny-skia schon; die Crates brächten
  eigene PNG-Codecs/Bildtypen mit und eine Abhängigkeit mehr im Lizenzbericht. Tests lesen mit eigenem Parser zurück
  und prüfen jede PNG-Größe über `image_file::detect`. `.icns` = macOS-Quelle (Rahmen), `.ico` = Light mit der Maske
  der Wahl. Für RGB-PNG ohne Alpha (E3) wird `png` (der Encoder von tiny-skia, gleiche Version) direkte Abhängigkeit.
- **E7 Als PNG kopieren** (`file.copyPng { size?, appearance? }`, ⇧⌘C / Strg+Umschalt+C – war frei): das Frontend
  baut das Export-SVG wie die Zeichenfläche es zeigt (Appearance, Maske, Effekte, Tönung der Ansicht), Rust
  (`copy_png`) rendert mit resvg (Standard 1024, nur Export-Größen) und legt **straight RGBA** über `arboard` in die
  Zwischenablage (`ai-core::clipboard_image::copy_svg` + Trait `ImageSink`, testbar ohne System). Der schreibende
  `Clipboard` bleibt in einer `static` am Leben (X11/Wayland: der Besitzer liefert die Daten aus). Browser-Modus:
  `FakeExportApi.clipboard`. Kein `navigator.clipboard.write` (in WebKitGTK/WKWebView unzuverlässig, 071).
- **E8 Erneut exportieren** (`file.exportAgain`, Menü Datei): die letzte **erfolgreiche** Wahl je Dokument
  (`WeakMap<DocumentStore, ExportRequest>`, nur Sitzung) mit Ordner; existiert das Ziel (meist der eigene letzte
  Export), fragt `AskService` „Ersetzen?“ – Überschreiben nie stillschweigend (012 E11). Ohne Kürzel (⇧⌘E bleibt
  frei für später).
- **E9 Dialog**: Formate PNG, SVG, Xcode-Icon-Satz, macOS `.icns`, Windows `.ico` (Radio, umbrechend) mit Hinweis je
  Paketformat (Xcode-26-Hinweis beim Satz); Satz: Plattformen (iOS, macOS, watchOS) und „Erscheinungsbilder (iOS)“
  (Light fest an, Tönung ausgeblendet); `.icns`/`.ico`: keine Appearances; Maske nur bei PNG/SVG/`.ico`; Größen nur
  PNG; Dateizahl aus `packageFiles`. Styles in `export-dialog.css` (Datei sonst > 400 Zeilen).
- **E10 KI**: Aktionen `file.exportAppIconSet`/`file.exportIcns`/`file.exportIco` mit `EXPORT_ARGS` + `platforms`;
  `COPY_PNG_ARGS`. Für Assistenten (die `file.*` nicht ausführen dürfen, 018 E12) neues MCP-Tool
  **`export_package(id?, dir, format, platforms?, appearances?, mask?, effects?, overwrite?)`** mit Pfadfreigabe und
  Rückfrage wie `export_png` (Schnappschuss `tools.snapshot.json`, 19 Tools).
- **E11 Fehlercodes**: keine neuen – `invalid_request` (Quelle fehlt/zu viel, keine Plattform, Größe), `already_exists`,
  `too_large`, `invalid_svg`, `unavailable` (Zwischenablage), `not_allowed` (Pfad, 033); alle mit Text in
  `describeFsError`. `ExportReport.folder` (neu, optional) → „Im Ordner zeigen“ zeigt den Ordner (`reveal_export`
  nimmt jetzt auch Ordner, die dieser Prozess exportiert hat).
- **E11a Einstellungen**: `export.format` auch `appiconset`/`icns`/`ico`, neu `export.platforms` (Standard
  `["ios", "macos"]`) – beidseitig (Rust `settings`, TS `settings-rules`, `testdata/settings-cases.json`).

## Verträge

- Rust `ai-core::export::package`: `PackageKind`, `PackageSource`, `PackagePlan`, `PlannedFile`, `Content`,
  `export_package(kind, sources, dir, opts, fonts, cancel, progress) -> ExportReport`, `encode_opaque(pixmap, bg)`,
  `source::{IOS_LIGHT, IOS_DARK, IOS_TINTED, MACOS, WATCHOS, WINDOWS}`; `appiconset::{plan, xcode_json, FOLDER,
  MAC_POINTS}`; `containers::{write_icns, write_ico, read_icns, read_ico, ICNS_TYPES, ICO_SIZES}`;
  `clipboard_image::{ImageSink, copy_svg, straight_rgba}`.
- Commands: `export_package(kind, sources, targetDir, options, onProgress: Channel<ExportProgress>) -> ExportReport`
  (Pfad über `allowed`, Abbruch über `cancel_export`), `copy_png(svg, size) -> ()`.
- TS: `ExportApi.exportPackage(...)`, `ExportApi.copyPng(svg, size)`; `PackageKind`, `PackageSource`,
  `ExportReport.folder`; `export-packages.ts`: `isPackage`, `packageKind(choice)`, `packageSources(kind, choice)`,
  `packageFiles(kind, base)`, `PACKAGE_SOURCE`, `GREY_TINT`; `ExportChoice.platforms`; `ExportSvgOptions.frame`,
  `MACOS_FRAME`; `ExportService.exportAgain()`, `copyPng(args)`, `canExportAgain`, `packageSources(doc, kind, req)`.

## Tests

- Rust: `Contents.json` wörtlich gegen die Referenz, Dateiliste = Einträge; Plan (Größen @1x/@2x, Quellen,
  Hintergründe); Paket auf Platte: jede PNG-Größe = Punkte × Skala, Farbtyp RGB (iOS/watchOS) vs. RGBA (Dark, macOS),
  Ecke weiß/schwarz geflacht, kein Temp-Ordner übrig; Überschreiben ersetzt den Ordner ganz; Abbruch hinterlässt
  nichts; `.icns`/`.ico` zurücklesen (Typen, Größen, PNG); Quellen-Prüfungen; serde-Tag; Pfadprüfung;
  `encode_opaque` (vormultipliziert über Weiß); `copy_svg` (straight RGBA, Größe, Grenze); Command-Regeln (async,
  Pfadprüfung), MCP-Tool-Schnappschuss, `file_paths`.
- Vitest: `export-packages` (Art, Quellen, Dateinamen gegen die Referenz-Fixture), Optionen (`platforms`, Bereitschaft,
  Dateizahl), Service (Quellen-SVGs: graue Tönung, macOS-Rahmen, iOS ohne Maske; Ordner-Bericht; `.ico` mit Maske;
  Erneut exportieren mit Rückfrage, je Dokument; Kopieren), Dialog (Plattformen, Hinweise, Felder je Format), MCP
  `export_package`, Einstellungsfälle.
- Playwright (`e2e/export-packages.spec.ts`, Fake-Export): Dialog mit Satz/Plattformen/Hinweis, Dateien des Satzes,
  `.ico`-Felder; macOS-Rahmen vom Browser gemalt (Rand transparent, Ecke abgeschnitten, Mitte deckend); Erneut
  exportieren über das Menü mit Rückfrage; Strg+Umschalt+C.
- Ende-zu-Ende (echte App unter Xvfb, Sidecar): `scripts/mcp-e2e.mjs` erzeugt Satz, `.icns`, `.ico` und prüft Struktur.

## Ende-zu-Ende (30.10.2026, Container, Debug-App unter Xvfb)

- `scripts/mcp-e2e.mjs` gegen die echte App (Sidecar über stdio, 19 Tools): `export_package appiconset` (iOS +
  Dark + Tinted, macOS, watchOS) → 14 Bilder, jede PNG-Größe passt zu `Contents.json`, `ios-1024.png` RGB ohne
  Alpha, Dark mit Alpha, Tinted-Eintrag vorhanden; `.icns` (10 Elemente, 16…1024) und `.ico` (ImageMagick
  `identify`: 16, 24, 32, 48, 64, 256 als PNG). Sichtprüfung: macOS mit Rand, Squircle und Schatten, iOS
  vollflächig, Tinted grau.
- Datei-Menü mit den neuen Einträgen; „Als PNG kopieren“ (Menü) → Statuszeile „PNG (1024 px) copied …“; danach
  Strg+V in derselben App fügt das Icon als Bild ein (Rundweg über die echte X11-Zwischenablage, `arboard`).

## Fragen an Marc

1. **Mac/Xcode**: Den erzeugten `AppIcon.appiconset` in `Assets.xcassets` ziehen – erkennt Xcode 16/26 Light/Dark/
   Tinted (iOS), alle macOS-Größen und watchOS ohne Warnung? Geht ein Archive/Upload ohne Alpha-Fehler durch?
2. macOS-Bilder mit Maske, Rand und Schatten (Big-Sur-Vorlage, wie im Prompt) – oder für macOS 26 lieber
   unmaskiert-vollflächig (das System maskiert dort selbst und setzt „fremde“ Icons in einen grauen Rahmen)?
3. **Mac**: `iconutil -c iconset AppIcon.icns` und Finder/Vorschau mit dem `.icns` – werden alle zehn Größen
   gelesen (insbesondere `icp4`/`icp5` als PNG für 16/32 px)?
4. Windows: `.ico` mit Explorer/Ressourcen-Compiler prüfen (PNG auch für 16–64 px; ältere Werkzeuge erwarten dort
   BMP).

## Abweichungen und Hinweise

- „Erneut exportieren“ ohne Kürzel (der Prompt nennt keins).
- Tinted im Satz ist bewusst grau (Apple-Vorgabe), unabhängig von der Tönung der Ansicht; lose Tinted-PNGs behalten
  die Tönung (077).
