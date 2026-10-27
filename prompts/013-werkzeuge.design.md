# Design 013: Werkzeuge – Freihand, Text → Pfad, Symbole

Status: in Arbeit · Datum: 27.10.2026

## Ausgangslage

008 hat die Einträge „Freehand“, „Text to Path…“ und „Symbol…“ im Katalog (`add.freehand`, `add.textToPath`,
`add.symbol`), im Menü „Add“ und in der Command Sidebar – ohne Handler, also deaktiviert. Vorhanden sind:
`AddService` (Einfügeort `insert-target.ts`, Zentrum `insert-center.ts`, ein `composite` aus `insertNode` je Einfügen,
Auswahl danach), die Gesten/Overlay-Infrastruktur aus 007 (`CanvasEditStore`, `SelectionOverlay` in
Viewport-Pixeln, `canvas.escape`), der Pfad-Tokenizer (`path-data.ts`, `path-write.ts`) aus 007/011 und aus 012 die
Systemschriften als `fontdb::Database` einmal je Prozess (`export::fonts::system_fonts`) mit resvg, das intern
**harfrust** (HarfBuzz-Port, Shaping) und **skrifa** (Glyphen-Umrisse) benutzt.

## Entscheidungen

### Freehand

- **E1 Pipeline rein** (`shared/geometry/freehand.ts`, übertragen aus `PathFitter.swift`/`FreeHandToolAgent.swift`
  der Vorlage mit Herkunftsvermerk): `simplify` (Ramer-Douglas-Peucker, iterativ mit Stapel, `epsilon` 2.5,
  geschlossen → Endpunkt = Start), `catmullRomToCubics` (zentripetal, `alpha` 0.5, Randpunkte gespiegelt wie die
  Vorlage), `downsample` (≤ 4 096 Punkte), `freehandPath(points, options) → d` mit 1 Nachkommastelle
  (`M x y C … [Z]`, Zahlen wie `NumberFormatter` der Vorlage: ohne überflüssige Nullen). Testfälle aus
  `FreeHandPathTests.swift` übernommen.
- **E2 Abtastung** (`FreehandStore.sample`): ein neuer Punkt nur, wenn er mindestens `minDistance` 3 **Bildschirm-px**
  vom letzten entfernt ist **und** seit dem letzten ≥ 1/120 s vergangen sind (Vorlage: „oder“ – sammelte bei
  langsamer Bewegung jeden Pixel). Punkte im **Dokumentraum** (`clientToDocument`), höchstens 4 096 je Strich.
- **E3 Werkzeug-Modus** (`FreehandStore`, Root wie `CanvasEditStore`): `add.freehand` ohne Argumente schaltet das
  Werkzeug ein/aus. Aktiv: Cursor `crosshair`, Hinweis in der Statuszeile, Ziehen mit der linken Taste zeichnet
  (Auswahl/Handles ruhen), Leertaste/Mitteltaste pannen weiter. Loslassen fügt **einen** Pfad ein (ein Undo-Schritt,
  `composite` „Add Freehand“), das Werkzeug bleibt für den nächsten Strich aktiv (wie die Vorlage). Esc
  (`canvas.escape`): laufender Strich → verwerfen, sonst Werkzeug beenden. Ein Klick ohne Bewegung (< 2 Punkte)
  fügt nichts ein.
- **E4 Offen/geschlossen**: Option „Closed“ in der Werkzeugleiste und Aktion `freehand.toggleClosed` (Taste `C`, nur
  im Kontext `canvas` und nur bei aktivem Werkzeug). **Auto-Schließen**: endet der Strich höchstens 12 Bildschirm-px
  neben dem Start und ist er länger als 4 · 12 px, wird er geschlossen.
- **E5 Live-Vorschau** im Overlay (`FreehandOverlay`, eigenes SVG in Viewport-Pixeln wie 007 E5): die Catmull-Rom-
  Kurve der bisher gesammelten Punkte (ohne RDP, wie die Vorlage), Strichbreite in Bildschirmgröße der gewählten
  Breite, gestrichelte Schließlinie bei „Closed“. Nie im Dokument-DOM.
- **E6 Ergebnis**: `<path d fill="none" stroke="#000000" stroke-width="<Breite>" stroke-linecap="round"
  stroke-linejoin="round">` am Einfügeort aus 008 E2. Die Punkte werden vor dem Glätten mit der inversen Matrix
  des Elternelements (`toLocal`, 008 E3) in dessen Benutzerraum gebracht – exakt auch in transformierten Gruppen.
  Optionen in der Werkzeugleiste: **Smoothing** (`epsilon` 0…20, Schritt 0.5) und **Stroke width** (1…64).
- **E7 KI** (`add.freehand { points, closed?, epsilon?, strokeWidth?, stroke?, parent?, index? }`): `points` =
  `[[x, y], …]` (2…100 000, Benutzerraum des Elternelements wie 008 E3) → derselbe Pfad ohne Werkzeug-Modus.

### Text → Pfad

- **E8 Rust `ai-core::fonts`**: die Datenbank aus 012 (`system_fonts()`, `LazyLock`) wird **wiederverwendet**
  (verschoben nach `fonts/system.rs`, `export::fonts` bleibt als Re-Export); beim Start der App lädt ein
  Hintergrund-Thread sie vor. `list_fonts()` baut die Liste einmal je Prozess (`LazyLock`).
- **E9 Shaping mit harfrust, Umrisse mit skrifa statt ttf-parser** (Abweichung vom Prompt): fontdb 0.24 bringt
  ttf-parser nicht mehr mit, resvg 0.48 nutzt intern harfrust 0.12 + skrifa 0.44. Dieselben Crates direkt zu
  benutzen kostet nichts (schon im Baum, gleiche Version und Features) und liefert echtes OpenType-Shaping
  (GSUB-Ligaturen, GPOS-/`kern`-Kerning, komplexe Schriften) – die Frage „rustybuzz erwägen“ erübrigt sich.
  Eine Zeile: harfrust shapt die Zeile (Richtung/Skript geraten), skrifa zeichnet jeden Glyphen ungehinted in
  Font-Einheiten, skaliert auf `size / unitsPerEm`, y nach unten, Ursprung = Grundlinie links. Kurven bleiben
  Quadratic/Cubic (`Q`/`C`), 2 Nachkommastellen, nur absolute Befehle.
- **E10 IDs der Schriften**: PostScript-Name (bei Doppelten `#2`, `#3` in Datenbank-Reihenfolge) – lesbar, stabil über
  Sitzungen (für die KI und spätere Einstellungen). Familie = erster (englischer) Familienname von fontdb, Stilname
  aus `name` ID 17 bzw. 2 (skrifa), sonst aus Gewicht/Stil abgeleitet. Familien und Stile sortiert (Stile nach
  Gewicht, aufrecht vor kursiv).
- **E11 Fehler**: leerer Text bzw. nur Leerzeichen oder Zeilenumbrüche → `invalid_text`; > 256 Zeichen →
  `too_large`; unbekannte Schrift → `not_found`; Zeichen ohne Glyphe in der Schrift (Emoji, fremde Schrift) →
  **`missing_glyphs`** (keine stille Ersatzschrift – der Pfad wäre sonst nicht die gewählte Schrift). Größe 1…4 096,
  Laufweite −1 000…1 000 (Einheiten der Zielgröße) – sonst `invalid_text`. Neue Codes in `error.rs`, `fs-error.ts`,
  `describeFsError`.
- **E12 BBox in Rust**: exakte Grenzen der Kurven (Extrema von Q/C), damit das Frontend ohne Layout zentrieren kann.
- **E13 Dialog** „Text to Path“ (`TextPathDialog`): Text (eine Zeile, max. 256), Familie (Suchfeld + Liste),
  Stil (Auswahl), Größe (Default 256), Laufweite, Vorschau als SVG des **echten Ergebnisses** (`text_to_path`,
  entprellt 150 ms, veraltete Antworten verworfen), Fehler über `describeFsError`. „Add“ fügt `<path d fill="#000000">`
  zentriert ein (Pfad verschoben über den Tokenizer, `translatePath`). Die letzte Wahl (Schrift, Größe) merkt sich der
  Dienst für die Sitzung (dauerhaft mit 015). Default-Schrift: die Sans-Serif des Systems (fontdb-Abbildung aus 012),
  sonst die erste.
- **E14 KI** (`add.textToPath { text, font, style?, size?, letterSpacing?, fill?, x?, y?, parent?, index? }`): Die Id
  bleibt `add.textToPath` (Katalog seit 005). `font` = Id oder Familienname (ohne Groß/klein), `style` = Stilname;
  ohne `style` der Stil nächst an Regular (400, aufrecht). `x`/`y` = Mitte im Benutzerraum des Elternelements.

### Symbole

- **E15 Set: Lucide** (ISC; ein Teil MIT von Feather, Text im Paket) aus `lucide-static` 1.55.0 (exakt; 10.10.2026,
  ältere Linie als zwei Wochen) – 1 877 Strich-Icons (24 × 24, `stroke-width` frei = „Gewicht“), mit Tags für die
  Suche. Gegen Tabler (MIT, ~5 900, Outline + Filled): Lucide ist kleiner (Daten ≈ 0,6 MB statt ≈ 3 MB) und
  einheitlicher. Material Symbols (Apache 2.0) brauchen Schriftachsen für das Gewicht. SF Symbols sind verboten
  (legacy §8).
- **E16 Plugin-Schnittstelle** (`features/symbols/symbol-provider.ts`):
  `SymbolProvider { id, name, license: { name, spdx, url }, variants: SymbolVariant[], load(): Promise<void>,
  search(q, limit): SymbolInfo[], toSvg(id, opts): SymbolSvg | null }`, Registry `SYMBOL_PROVIDERS`.
  `SymbolVariant` = Zahl mit Bereich (Lucide: `weight` 0.5…3, Default 2). `toSvg` liefert eine eigenständige
  `<svg viewBox>`-Vorschau **und** die einzufügenden Elemente; weitere Sets brauchen nur einen Provider.
- **E17 Daten lazy**: `import('lucide-static/icon-nodes.json')` + `tags.json` erst beim Öffnen des Pickers (bzw.
  beim ersten `add.symbol` mit Argumenten) als eigene Chunks; Startbundle unverändert (Budget 2,5 MB Warnung).
- **E18 Suche** (rein): Teilwort im Namen vor Tag-Treffern, mehrere Wörter = alle müssen passen, ohne
  Groß/klein, Bindestrich = Leerzeichen; leer = alle in Namensreihenfolge; Raster virtuell begrenzt auf 240 Treffer
  (Hinweis „more…“).
- **E19 Einfügen**: Strich-Icons bleiben Strich-Icons (Umwandlung in Füllpfade braucht einen Stroker – als Folge-Idee
  „Konturen in Pfade umwandeln“ notiert). Jedes Element wird zu einem `<path>` (Kreis, Ellipse, Rechteck mit `rx`,
  Linie, Polylinie, Polygon → `d`, rein: `shape-path.ts`), alle in **einer** `<g fill="none" stroke="#000000"
  stroke-width="<Gewicht>" stroke-linecap="round" stroke-linejoin="round" transform="translate(…) scale(s)">`,
  `s = Größe / 24`, zentriert auf das Zentrum aus 008 E3. Die Gruppe bleibt als ein Objekt wähl-/verschiebbar;
  Elemente mit eigenem `fill` (z. B. Punkte) behalten es. Undo „Add Symbol“.
- **E20 Picker** (`SymbolPickerDialog`): Set (Auswahl, heute eines), Suche, Raster (Listbox nach APG,
  Pfeiltasten/Home/End/Enter, `aria-activedescendant`), Gewicht (Zahl mit Schritt 0.25), Größe (Default 512),
  Lizenzzeile, „Add“. Letzte Wahl für die Sitzung im Dienst.
- **E21 KI** (`add.symbol { set?, id, size?, weight?, stroke?, x?, y?, parent?, index? }`): `set` Default `lucide`;
  unbekannte Id → Hinweis, nichts eingefügt.

### Lizenzen

- **E22** `THIRD-PARTY-NOTICES.txt` im Repo-Wurzelordner (Lucide ISC + Feather MIT, Caladea OFL nur Testdaten,
  Rust-Crates nicht einzeln – das folgt mit Prompt 016), About-Dialog zeigt „Symbols: Lucide (ISC License)“ mit
  Link. Testschrift **Caladea Regular** (SIL OFL 1.1, 81 KB, Latein inkl. Umlaute, ohne Emoji) unter
  `testdata/fonts/` mit `OFL.txt` – nur für Rust-Tests, nicht im Bundle.

## Verträge

### Rust (`ai-core/src/fonts/`)

```rust
pub struct FontStyle { pub name: String, pub weight: u16, pub italic: bool, pub id: String }
pub struct FontFamily { pub family: String, pub styles: Vec<FontStyle> }
pub struct TextPath { pub d: String, pub bbox: Option<BBox>, pub advance: f32 }
pub struct BBox { pub x: f32, pub y: f32, pub width: f32, pub height: f32 }
pub fn font_families(db: &Database) -> Vec<FontFamily>;          // E10
pub fn list_fonts() -> Arc<Vec<FontFamily>>;                       // once per process
pub fn text_to_path(db: &Database, text: &str, font_id: &str, size: f32, letter_spacing: f32)
    -> Result<TextPath, FsError>;                                  // E9, E11, E12
pub const MAX_TEXT_CHARS: usize = 256;
```

| Command | Zweck |
|---|---|
| `list_fonts()` | `FontFamilyDto[] { family, styles: [{ name, weight, italic, id }] }` |
| `text_to_path(text, fontId, size, letterSpacing)` | `TextPathDto { d, bbox: { x, y, width, height } \| null, advance }`; Fehler `invalid_text`, `too_large`, `not_found`, `missing_glyphs` |

### Frontend

```ts
// shared/geometry/freehand.ts (rein)
interface FreehandOptions { closed: boolean; epsilon?: number; alpha?: number; decimals?: number; maxPoints?: number }
simplify(points, epsilon, closed): Point[]; catmullRomToCubics(points, closed, alpha): Cubic[]
cubicsToPath(cubics, decimals, closed): string; freehandPath(points, options): string | null
shouldAutoClose(points, toScreen, tolerancePx = 12): boolean
// shared/geometry/shape-path.ts (rein): shapeToPath(tag, attrs): string | null
// shared/geometry/path-translate.ts (rein): translatePath(d, dx, dy, precision = 2): string | null
// core/fonts: FontApi { listFonts(): FontFamilyDto[]; textToPath(text, fontId, size, letterSpacing): TextPathDto }
// features/tools/freehand.store.ts (Root): active, drawing, points, closed, epsilon, strokeWidth,
//   toggle(), begin(p, t), sample(p, t, zoom), end(), cancel(), escape()
// features/tools/freehand-tool.ts: FreehandService.insert(points, opts, args?)
// features/tools/text-path.service.ts (Root): fonts(), resolveFont(font, style?), preview(...), add(args)
// features/symbols/symbol-provider.ts, lucide-provider.ts, symbol-search.ts (rein), symbol.service.ts
// AddService.insertBuilt(label, args, build) – öffentlich für die Werkzeuge
```

Neue Undo-Labels: `addFreehand`, `addTextPath`, `addSymbol`. Neue Aktion `freehand.toggleClosed` (Taste `C`, Kontext
`canvas`). Neue Fehlercodes `invalid_text`, `missing_glyphs`. Neue Abhängigkeiten: `harfrust` 0.12.0, `skrifa`
0.44.0 (Rust, schon über resvg im Baum), `lucide-static` 1.55.0 (npm, nur Daten, lazy).

## Tests

- Rust: Familienliste aus der Testschrift (Familie, Stil, Gewicht, Id), `text_to_path` mit Caladea: Pfad + BBox
  (Höhe ≈ Versalhöhe), Kerning (`AV` schmaler als `A`+`V`), Laufweite, Umlaute (`ÄÖÜß` ok), Emoji → `missing_glyphs`,
  leer/nur Leerzeichen/Zeilenumbruch → `invalid_text`, zu lang → `too_large`, unbekannte Id → `not_found`, doppelte
  PostScript-Namen → `#2`; Commands `async` (`command_rules`).
- Vitest: Freehand-Pipeline (Fälle aus `FreeHandPathTests`, + Downsampling, Auto-Schließen, Abtastung 3 px/120 Hz),
  `FreehandStore` (Toggle, Esc), `shapeToPath`, `translatePath`, Symbol-Suche (Name vor Tag, mehrere Wörter),
  Lucide-Provider (`toSvg`, Gewicht, unbekannte Id) mit kleinem Datensatz, Picker-Logik (Tastatur), Text-Dialog
  (Vorschau, Fehler) mit `FakeFontApi`, Aktionen mit Argumenten (KI) inkl. JSON-Roundtrip des Commands.
- Playwright (`e2e/tools.spec.ts`): Freihand-Strich per Maus → genau ein `<path>` mit `stroke` und Kurven, ein ⌘Z
  entfernt ihn; Esc während des Strichs bricht ab (kein Pfad), Esc danach beendet das Werkzeug; Symbol suchen
  („heart“) und einfügen → `<g>` mit Pfaden, zentriert; Text to Path mit der Fake-Schrift → `<path>` zentriert.

## Fragen an Marc

1. **Lucide** als erstes Set (ISC, Strich-Icons, 1 877 Stück) – oder lieber Tabler (mehr Icons, auch gefüllt)?
2. Symbole bleiben **Strich-Icons** in einer `<g>` mit `scale` (Strich skaliert mit). Soll „Konturen in Pfade
   umwandeln“ (Stroker in Rust, tiny-skia) als eigener Prompt kommen?
3. Fehlt einer Schrift eine Glyphe, gibt es einen Fehler statt einer Ersatzschrift. Ok?
4. Text-Länge bis 256 Zeichen (Vorlage: 12). Ok?
5. Freehand: Abtastung „3 px **und** 120 Hz“ (Vorlage effektiv „oder“), Werkzeug bleibt nach dem Strich aktiv,
   Taste `C` schaltet offen/geschlossen. Ok?
6. Auf dem Mac prüfen: Schriftenliste (CoreText-Schriften über fontdb, `.ttc`), Text to Path mit SF Pro / Apple
   Color Emoji (→ `missing_glyphs` bei Emoji ohne Umriss), Freihand mit Trackpad.

## Fortschritt

- [x] Design
- [ ] Rust `ai-core::fonts` + Commands + Fehlercodes
- [ ] Frontend Freehand
- [ ] Frontend Text → Pfad
- [ ] Frontend Symbole + Lizenzen
- [ ] Playwright, echte App unter Xvfb
- [ ] Doku, `pnpm check` + `pnpm e2e` grün
