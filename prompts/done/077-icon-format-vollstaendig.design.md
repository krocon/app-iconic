# Design 077: `.icon` vollständig darstellen – Layer-Fill, Tinted, Radialverlauf, Glas-Annäherung

> Prompt: [077-icon-format-vollstaendig.md](077-icon-format-vollstaendig.md) · Stand: 30.10.2026

## Belege (Format konservativ)

- **Schema** github.com/dfabulich/unofficial-apple-icon-composer-json-schema (gegen Icon Composer aus Xcode 26.2
  geprüft) und die echten Icon-Composer-Dateien dort (`Horizon`, `Turntable`, `gb-studio`, `Spacedrive`, `Loop`,
  `New.icon`), dazu unsere Fixtures `camscanner.icon` und `all-fields.icon`.
- Belegt: Appearances nur `dark` und `tinted` (kein „clear“); Layer-`fill` mit `solid`, `automatic-gradient`,
  `linear-gradient` (+ `orientation`), `automatic`, `none` – laut Schema „`automatic` und `none` zeigen die
  natürlichen Farben des Assets“; viele Dateien setzen Layer-Fills **nur** für `tinted` (meist Graustufen).
- **Nicht belegt:** `radial-gradient` (Schema: `fill-object` mit `additionalProperties: false`, keine Datei),
  der Koordinatenraum eines Layer-Verlaufs, wie Icon Composer `tinted` ohne eigenen Eintrag auflöst, Clear-Varianten.

## Entscheidungen

- **E1 Layer-`fill`** (`canvas/layer-fill.ts`, rein): `automatic`, `none` und Unbekanntes = natürliche Farben (nichts
  zu tun); `solid`/Verläufe/`system-*` färben den Layer: der Inhalt wirkt als **Alpha-Maske**, die Fläche ist der
  Fill (`previewOf` aus `fill-preview.ts`, Farben als `IconColor`). Der Fill gehört zum Inhalt, nicht zu den Effekten:
  er gilt auch bei „Effects Preview“ aus und im Export ohne „Effekte“. Verläufe liegen im **Raum des Layers** (die
  1024er-Fläche nach Gruppen- und Layer-`position`; Einheitspunkte wie beim Hintergrund) – Annahme, Frage 2.
  - _Zeichenfläche:_ ein komponierter CSS-Filter am Layer-`<svg>` wie der Schatten (033 E5) –
    `feFlood` bzw. `feImage` (Verlauf als SVG-Data-URL, in der CSP `img-src data:` erlaubt) + `feComposite in
SourceGraphic`. Die lebende Wurzel bleibt sichtbar und trefferfähig; Ziehen rechnet den Filter nur beim
    Komponieren, keine Kopien, keine Arbeit in TS je Schritt (der Filter wird nur bei geänderter Signatur gebaut).
  - _Export:_ `<g mask="url(#…)"><rect fill=…/></g>` mit `<mask mask-type="alpha">` aus dem Asset (Kopie mit
    Präfix-IDs wie bisher) – reines SVG 1.1, resvg-tauglich, ohne `feImage`.
- **E2 Tinted** (`canvas/tinted.ts`, rein): `Appearance = 'light' | 'dark' | 'tinted'`; `appearanceKey('tinted')` =
  `tinted`, d. h. `*-specializations` mit `appearance: tinted` wirken, sonst gilt der Grundwert (wie im Inspector,
  010 E2; Frage 3). **Annäherung:** die ganze Komposition (Hintergrund + Ebenen) → Luminanz (Rec. 709 auf
  sRGB-Werten, `color-interpolation-filters="sRGB"`) × Tönung, als `feColorMatrix`
  (`tintedMatrix(tint)`). `automatic` als Hintergrund in Tinted: Grauverlauf (Schema: „grey in monochrome“, Werte
  angenähert). Die Tönung ist eine **Ansichts-/Export-Einstellung**, nie im Dokument: `CanvasOptions.tint`
  (`#rrggbb`, Standard `#ffffff` = reine Luminanz), Aktion `view.tint { color }`, Farbchip in der Canvas-Toolbar
  neben dem Segment „Tinted“ (069), im Export `ExportChoice.tint` (Standard: die Tönung der Ansicht). Tinted wird
  nicht als Start-Erscheinungsbild gespeichert (`settings.canvas.appearance` bleibt system/light/dark).
  Zeichenfläche: CSS-Filter `url(#ai-canvas-tint)` auf `.paper`; Export: `<g filter>` um Hintergrund + Gruppen.
  Clear-/Liquid-Glass-Varianten: nicht belegt → nicht angeboten.
- **E3 Inspector:** „Tinted“ im Inspector schaltet die Zeichenfläche jetzt mit (eine Quelle: die Canvas-Option);
  der Hinweis „nicht in der Vorschau“ wird zu „Tinted-Vorschau ist eine Annäherung“.
- **E4 `plus-darker`:** Die Formel des Prompts (Linear Burn `feComposite arithmetic k2=1 k3=1 k4=-1`) braucht den
  Hintergrund als zweiten Eingang; `BackgroundImage` können weder Chromium noch WebKit noch resvg – als Filter nicht
  umsetzbar. Stattdessen: Vorschau **nativ**, wenn die WebView `mix-blend-mode: plus-darker` kann
  (`CSS.supports`, WebKit = macOS/Linux), sonst und im Export **`multiply`** (größte Abweichung zu Linear Burn
  (1−S)(1−D) ≤ 0,25; resvg kennt weder `plus-darker` noch `plus-lighter`). Kennzeichnung im Inspector-Tooltip
  entfällt – die Liste der Annäherungen steht in der Doku. Frage 4.
- **E5 Radialverlauf:** nicht belegt (E-Belege) → **nicht im Fill-Editor angeboten** (Schalter
  `RADIAL_CREATABLE = false` in `fill-model.ts`). Das Modell kann ihn anlegen (`switchKind(…, 'radial-gradient')`,
  Orientierung aus der belegten Vorgabe `0.5,0 → 0.5,0.7`, Farben übernommen), lesen und unbekannte Felder
  erhalten; die Vorschau zeigt ihn als Hintergrund und als Layer-Fill. Freigabe = eine Zeile, sobald Marc eine
  Icon-Composer-Datei mit Radialverlauf hat (Frage 1). Abweichung vom Prompt, gewollt (Auftrag: Unbelegtes nicht
  schreiben).
- **E6 Glas, Licht, Glanz, Blur-Material** (`canvas/glass.ts`, rein, **Annäherung**, nur mit „Effects Preview“ bzw.
  Export-Option „Effekte annähern“ – dieselbe Option wie Schatten/Transluzenz, Standard im Export aus): ein Filter
  „Glas“ je Layer aus _Glanzkante_ (`specular`, Standard an: obere Innenkante, 6 Einheiten, Weiß 45 %) und
  _Milchglas_ als weiche Aufhellung bei `blur-material` b (Weiß 30 %·b im Inhalt – die echte Hintergrund-Unschärfe
  bräuchte wieder den Hintergrund, s. E4). `lighting: combined` (Standard) → alle Layer der Gruppe (die
  Layer-`glass`-Schalter wirken laut Schema nur bei `individual`); `individual` → die Layer mit `glass` (Standard an).
  Zeichenfläche: in der komponierten Filterkette `fill → glass → shadow` am Layer-`<svg>` (033 E5); Export:
  geschachtelte `<g filter>` in derselben Reihenfolge. **Leistung:** ein erster Entwurf (Filter auf der ganzen Gruppe,
  weichgezeichnete Kante, 10 % Aufhellung immer) kostete beim Zoomen von `logo-artv` ~ 30 % mehr Zeit je Bild und
  verfälschte beim Bearbeiten alle Farben – daher ohne Weichzeichnung, ohne Grundaufhellung, je Layer (gemessen
  ~ 18 → 22 ms je Bild; ein zusammengelegter Filtergraph statt der CSS-Kette brachte nichts und wurde verworfen).
- **E7 Export-Varianten** (`export-options.ts`, rein; für 078/079):
  `ExportAppearance = 'light' | 'dark' | 'tinted'`, `APPEARANCES` in dieser Reihenfolge, `ExportChoice.tint`,
  `exportVariants(choice) → { appearance, tint }[]` (die Liste, die `ExportService.variants` baut),
  `exportFileName(base, appearance, size?)` = Rusts Namen (`<name>-<appearance>[-<size>].<ext>`).
  `exportSvg(doc, appearance, { …, tint })` nimmt die Tönung für `tinted`. KI-Argumente: `appearances` darf
  `tinted` enthalten, neu `tint: "#rrggbb"`; MCP-Tools `export_png`/`export_svg`/`render_preview` ebenso.
  Rust: `APPEARANCES = [light, dark, tinted]`, 1–3 Varianten; Einstellungen `export.appearances` erlauben `tinted`
  (Rust `sanitize` und TS `settings-rules`, Fall in `testdata/settings-cases.json`).
- **E8 Wiederverwendung (078/079):** `tinted.ts` exportiert `LUMA` (Koeffizienten), `parseTint`, `tintedMatrix`,
  `tintFilter(d, id, tint)`; 079 (Android-Monochrom) baut daneben eine Matrix „Luminanz → Alpha“ aus `LUMA` und
  rendert über `exportSvg(doc, 'tinted', …)`. 078 (`.appiconset`) nimmt `exportVariants` für Light/Dark/Tinted und
  `exportFileName` bzw. eigene Namen; die Tinted-Variante ist dieselbe SVG-Rechnung wie die Vorschau.

## Verträge

```ts
// canvas/appearance.ts
type Appearance = 'light' | 'dark' | 'tinted';
// canvas/tinted.ts
const LUMA: readonly [number, number, number];          // 0.2126, 0.7152, 0.0722
const DEFAULT_TINT = '#ffffff';
function parseTint(v: unknown): string | null;           // '#rrggbb' (klein) oder null
function tintedMatrix(tint: string): string;             // 20 Werte für feColorMatrix
function tintFilter(d: Document, id: string, tint: string): Element;
// canvas/layer-fill.ts
type LayerFill = FillPreview<IconColor> | null;          // null = natürliche Farben
function layerFillOf(layer: IconLayer, a: Appearance): LayerFill;
function layerFillFilter(d, id, fill: NonNullable<LayerFill>, transform: string | null): Element; // Zeichenfläche
// canvas/glass.ts
interface GlassEffect { specular: boolean; blur: number | null }
function glassFilter(d, id, g: GlassEffect, box: { scale: number } | null): Element;
// StackLayer += fill: LayerFill, glass: GlassEffect | null  (layerGlassEffect(group, layer, a))
// effects.ts: blendCss(mode, native = supportsPlusDarker()) – 'plus-darker' → nativ oder 'multiply'
// export-options.ts
interface ExportChoice { …; tint: string }
function exportVariants(c: ExportChoice): { appearance: ExportAppearance; tint: string }[];
function exportFileName(base: string, a: ExportAppearance, size?: number): string;
```

Aktionen: `view.appearance.tinted`, `view.tint { color }`; `file.exportSvg/Png` + `tint`.

## Tests

- Vitest: `tinted.spec` (Matrix, Weiß/Schwarz/Grün → Luminanz × Tönung, `parseTint`), `layer-fill.spec` (Fill je
  Appearance inkl. tinted-Spezialisierung, automatic/none = null, Filteraufbau Farbe/Verlauf), `glass.spec`
  (combined/individual, glass aus, specular/blur), `effects.spec` (`plus-darker`), `fill-model.spec` (radial
  anlegen/lesen/unbekannte Felder, nicht angeboten), `export-svg.spec` (Layer-Fill als Alpha-Maske, Tinted-Filter,
  Glas nur mit Effekten, Snapshot), `export-options.spec` (Varianten, Dateinamen, `tint`-Argument), `layer-stack.spec`
  (Filterkette am Layer-`<svg>`), Einstellungen (Fall `tinted`).
- Rust: `png.rs` Layer-Fill über Alpha-Maske (Pixel rot, außen transparent), Tinted-Matrix (Pixel = Luminanz ×
  Tönung), `multiply` statt `plus-darker`; `files_tests` Tinted-Dateinamen, drei Varianten; Einstellungen; Roundtrip
  aller Fixtures unverändert (bestehende Tests).
- Playwright `e2e/icon-format.spec.ts`: einfarbiger Layer + Layer-Fill Rot (`icon.setField`) → Pixel rot auf der
  Zeichenfläche und `<rect fill="#ff0000">` mit Alpha-Maske im Export-SVG; Umschalten auf Tinted (Toolbar) → Filter
  an, Pixel grau bzw. getönt nach `view.tint`.

## Fragen an Marc

1. Kennt Icon Composer `radial-gradient`? Eine damit gespeicherte Datei würde die Freigabe im Fill-Editor belegen
   (bis dahin nur lesen/anzeigen, E5).
2. Layer-Verläufe: im Raum der Icon-Fläche (wie angenommen) oder im Rahmen des Assets/Layers?
3. Tinted ohne eigenen Eintrag: nimmt Icon Composer den Grundwert (wie hier) oder den Dark-Wert?
4. **Mac**: Kann WKWebView `mix-blend-mode: plus-darker` (dann nativ in der Vorschau)? Und: sehen Layer-Verlauf
   (`feImage` mit Data-URL) und Tinted-Filter in WKWebView wie in Chromium aus?
5. Glas-Annäherung (Glanzkante, Aufhellung, Milchglas) brauchbar, oder lieber weniger/kräftiger?
