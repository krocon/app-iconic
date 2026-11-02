# Design 087: Bild nachzeichnen – Stufen A (Nachzeichnen), B (Formen erkennen), C (Vorlage + KI)

> Prompt: [087-digitizing-image.md](087-digitizing-image.md) · Stand: 02.11.2026 · baut auf 018 (MCP), 071
> (Bild aus der Zwischenablage), 080 (Bild als Ebene, `RasterConverter`, `imageLayerPlan`), 012 (resvg)

## Ausgangslage und Vorversuch

- Bilder kommen als `ImageFileDto` (Datei: `pick_image_file`/`read_image_file`; Zwischenablage:
  `ClipboardApi.readImage`) oder als PNG-Asset einer Ebene (080). Ein Weg von Pixeln zu Vektoren fehlt.
- Vorversuch mit vtracer (Python-Bindung) am Beispiel `087-img.png` (1024², KI-generierter Taschenrechner mit
  Verläufen, Wölbungen, Schrift): „detail“ 458 Pfade/305 KiB – sieht aus wie das Original, ist aber ein Haufen
  Farbflecken; „clean“ 75 Pfade – dunkle Tasten verschmelzen mit dem Gehäuse; „poster“ 12 Pfade – unbrauchbar.
  Klassisches Tracing allein ist nicht „wie von Hand“.

## Entscheidungen

- **E1 Drei Stufen, eine Funktion:** A = Nachzeichnen (Farbflächen, Umrisse), B = Formen erkennen (Primitive,
  Verläufe, Angleichen) als Optionen desselben Laufs, C = Vorlage + KI-Werkzeuge. Der Dialog bietet A und B als
  Stile; „Wie von Hand“ (B) ist der Standard.
- **E2 Wo es läuft:** in Rust (`ai-core::trace`, ohne Tauri, mit `cargo test` prüfbar, im Release 0,1–0,5 s für
  1024²). Das widerspricht nicht „Der Browser ist die Grafik-Engine“ (001 E3): Nachzeichnen liest Pixel, es rendert
  und parst kein SVG. Das Ergebnis ist SVG-Markup, das das Frontend **wie jeden Import** bereinigt
  (`sanitizeSvg`, `resolveStyles`, 003 E4/E5) und als neue Ebene einfügt.
- **E3 Bibliothek:** `visioncortex` 0.9.3 (MIT OR Apache-2.0; Engine von vtracer: Farb-Cluster, Umriss-Verfolgung,
  Splines) **direkt**, ohne vtracer selbst (zieht `image` 0.23 und `clap` 2 herein). Die rund 100 Zeilen Pipeline
  von vtracer (`converter.rs`: Keying, `Runner`-Parameter, gestapelte Ausgabe) sind mit Herkunftsvermerk
  übertragen. Verworfen: **Potrace** (GPL – nicht mit MIT ausliefern), **imagetracerjs** (JS, deutlich schwächer),
  eigene Quantisierung (Aufwand ohne Gewinn).
- **E4 Optionen:** `TraceOptions` (camelCase, jedes Feld optional, Standard = vtracer): `mode` color/mono,
  `curves` spline/polygon/pixel, `colorPrecision` 1–8, `layerDifference` 0–255, `speckle` 0–128 (Fläche
  speckle²), `cornerThreshold`/`spliceThreshold` 0–180°, `lengthThreshold` 3,5–10, `threshold` 0–255 (mono),
  `shapes`, `gradients`, `harmonize`, `dropBackground`, `scale` 0,01–64. Rust prüft die Bereiche
  (`invalid_request`). **Stile** (Presets) im Frontend (`trace-presets.ts`): Wie von Hand (B), Detailliert (A),
  Flach, Pixelgrafik, Schwarzweiß.
- **E5 Eingang:** nur PNG als Data-URL (`decode_png_data_url` aus 080, ≤ 20 MiB); JPEG/WebP/SVG zeichnet der
  Browser einmal nach PNG (`RasterConverter`, 080 E1). Dekodieren mit dem vorhandenen `png`-Crate, alle Farbtypen
  und Tiefen, höchstens 4096 × 4096 Pixel (`too_large`), kaputt → `invalid_image`. Gearbeitet wird mit höchstens
  2048 px Kantenlänge (Flächenmittel mit Alpha-Gewichtung), geantwortet in den Einheiten des Bildes × `scale`.
  Alpha < 128 = durchsichtig (eigene Schlüsselfarbe, deterministisch gesucht statt vtracers Zufall).
- **E6 Stufe A:** gestapelte Farbregionen wie vtracers „stacked“ (jede Region deckt die auf ihr gemalten mit,
  unten zuerst), je zusammenhängendem Teil ein Umriss als Kurven, gerade Kanten oder exakte Pixelstufen; Löcher
  mit `fill-rule="evenodd"`; Schwarzweiß = dunkle Teile (Luminanz < Schwelle) in Schwarz. Zahlen mit höchstens zwei
  Nachkommastellen, absolute Koordinaten (kein `transform` je Pfad wie bei vtracer). Mehr als 20 000 Elemente →
  `too_large` („Kleinste Fläche“ erhöhen).
- **E7 Hintergrund weglassen:** die unterste Region, wenn sie alle vier Bildränder berührt (der `.icon`-Hintergrund
  kommt aus `fill`).
- **E8 Verläufe (B):** je Region Summen für eine Ausgleichsebene `c(x, y) = a + b·x + c·y` je Kanal
  (`ColorStats`, in O(1) zusammenführbar). Eine Region verschmilzt mit der unter ihr, wenn eine Ebene beide erklärt
  (RMS ≤ 6, Mittel der oberen ≤ 8 daneben) – so werden Farbbänder eines Verlaufs wieder eine Fläche. Eine Region
  ab 400 sichtbaren Pixeln bekommt einen `linearGradient` (`userSpaceOnUse`, Richtung = Hauptachse der
  Kanal-Gradienten, zwei Stopps über ihren Rahmen), wenn die Farbe sich um ≥ 10 ändert und die Ebene den Fehler
  der Einzelfarbe um mindestens 20 % senkt; sonst ihre mittlere Farbe.
- **E9 Formen (B):** je Teil-Maske Kandidaten abgerundetes Rechteck (Radius aus der Fläche, die die Ecken
  verfehlen, dann in Viertelpixeln in den Eckkästen verfeinert – Mitte der gleich guten Radien) und Ellipse;
  angenommen, wenn höchstens 0,5 · Umfang + 6 Pixel abweichen **und** keiner weiter als max(1,5 px, 1,5 %) vom
  Umriss entfernt liegt (keine Kerben, Löcher, Beulen – N, O, A bleiben Pfade). Die Ellipse gewinnt, wenn sie
  nicht klar schlechter ist (Kreis statt Quadrat mit halbem Radius). Ellipse mit gleichen Radien → `<circle>`,
  Radius 0 → `<rect>` ohne `rx`. Mindestens 4 px Kantenlänge.
- **E10 Kanten unter einem Pixel:** eine Maske aus Farb-Clustern ist bis zu einem Pixel zu klein oder zu groß
  (Kantenglättung). Die Farben je eines Rings innen und außen am Umriss (2–3,5 px) werden gemessen; ist jeder Ring
  eine Farbe und der Kontrast ≥ 40, verrät die Farbe der Randpixel ihre Deckung; die summierte Abweichung zur Deckung
  des Kandidaten, geteilt durch den Umfang, verschiebt den Umriss (Viertelpixel, höchstens 1,5 px). Pixel einer
  dritten Farbe zählen nicht.
- **E11 Angleichen (B):** Rechtecke, deren Breite, Höhe und Radius **alle** fast gleich sind (2,5 %, mind.
  1,5 px; ohne Verkettung: 3 → 4,4 → 5,8 ist keine Größe), bekommen die Mediane; danach Kanten (Rechtecke) bzw.
  Mittelpunkte (Ellipsen) innerhalb 1,5 px eine Position. Einfarbige Flächen innerhalb 6 je Kanal bekommen die
  meistbenutzte Farbe ihrer Gruppe.
- **E12 Vorlage:** Ansichtszustand je Fenster (`TemplateStore`, root wie `CanvasViewStore`): nicht im Dokument,
  nicht im Undo, nicht im Export, nicht in der Wiederherstellung; bleibt bei einem anderen Dokument im Fenster.
  Eingepasst (längere Seite = 1024, auch vergrößert) und mittig, **über** den Ebenen und nicht von der Maske
  beschnitten, Deckkraft 50 %, nie vom Zeiger getroffen (`pointer-events: none`). Setzen aus Datei, Zwischenablage
  oder gewählter PNG-Ebene; Ansicht › Vorlage (zeigen, Deckkraft 25/50/75/100 %, entfernen).
- **E13 Ort des Ergebnisses:** aus einer PNG-Ebene → Bildpixel (`scale` 1), neue Ebene direkt vor ihr mit ihrer
  `position`; aus Vorlage, Zwischenablage oder Datei → eingepasst wie die Vorlage (`scale` = 1024 / längere Seite),
  liegt also genau auf ihr; neue Ebene vorn in der aktiven Gruppe (080 E2). Asset `<Name>-traced.svg`, ein
  Undo-Schritt „Bild nachzeichnen“ (`CompositeCommand('traceImage', …)` über `imageLayerPlan` mit Extras).
- **E14 KI (C):** Werkzeug `set_template { path?, opacity?, clear? }` (Pfad wie `open_document` erlaubt und
  vorher erfragt, `confirmFiles`), `get_template { size? }` (Fenster gibt die Vorlage ≤ 1024 px, Rust passt sie in
  `size` ein, Bild + Platzierung zurück, ohne Vorlage `unavailable`); nachzeichnen mit
  `run_action trace.image { source: "template" | "layer", preset, … }`. Dateidialoge, Zwischenablage und der Dialog
  selbst sind für die KI gesperrt (`template.fromFile`, `template.fromClipboard`, `trace.clipboard`,
  `trace.image` ohne Argumente). Die Server-Anleitung nennt den Weg Vorlage → nachbauen → mit `render_preview`
  vergleichen. Den semantischen Nachbau (Text als Text, Gruppen nach Bedeutung) macht die KI mit den vorhandenen
  Werkzeugen.
- **E15 Aktion `trace.image`:** ohne Argumente der Dialog mit der besten Quelle (gewählte PNG-Ebene → Vorlage →
  Datei); mit Argumenten sofort (Quelle, Stil, Änderungen), Fehler als `FsError` (`unavailable` ohne Bild).
  `trace.clipboard` öffnet den Dialog mit dem Bild der Zwischenablage.
- **E16 Dialog:** Quelle (vier Knöpfe, nicht verfügbare aus), Stil (Radiogruppe), Details (Formen, Verläufe,
  Angleichen, Hintergrund, Umrisse, Farbgenauigkeit, Farbstufen, kleinste Fläche, Schwelle), Original neben dem
  **echten** Ergebnis (Rust, 250 ms entprellt, veraltete Antworten verworfen), Zusammenfassung, „Als Ebene
  einfügen“ fügt genau das Gezeigte ein. Gewählter Stil und Änderungen bleiben für das nächste Mal.

## Verträge

Rust (`ai-core::trace`):

```rust
pub struct TraceOptions { mode, curves, color_precision, layer_difference, speckle, corner_threshold,
    length_threshold, splice_threshold, threshold, shapes, gradients, harmonize, drop_background, scale }
pub struct TraceResult { svg: String, width: f64, height: f64, stats: TraceStats }
pub struct TraceStats { elements, paths, rects, ellipses, gradients, colors, ms }
pub fn trace(image: &Rgba, opts: &TraceOptions) -> Result<TraceResult, FsError>;
pub fn trace_png(png: &[u8], opts) -> …;  pub fn trace_data_url(url: &str, opts) -> …;
raster::{decode_png, fit, encode_png, fit_png, fit_png_base64, png_data_url}
```

Tauri: `trace_image(dataUrl, options) -> TraceResult` (`trace_commands.rs`, async + `spawn_blocking`).
MCP: `set_template`, `get_template` (Schnappschuss `tools.snapshot.json`), Fenster-Werkzeuge `set_template`,
`template_png`.

Frontend: `TraceApi.traceImage(dataUrl, options)`; `TraceService { source, preset, overrides, options, open,
useSource, trace, insert, run }`; `tracePlan(doc, source, markup, sel)`, `traceScale`, `traceOptions`;
`TemplateStore { image, visible, opacity, shown, placement }`, `TemplateService { fromFile, fromClipboard,
fromLayer, fromPath, forAi, layerImage, toTemplate }`; `imageLayerPlan(…, extras?: { label, stem, position })`;
`RasterConverter.toPng(url, maxSide?)`.

Aktionen: `trace.image` (Argumente `TRACE_ARGS`), `trace.clipboard`, `template.fromFile`,
`template.fromClipboard`, `template.fromLayer`, `template.toggle`, `template.opacity { value? }`,
`template.clear`. Undo-Label `traceImage`. Keine neuen Fehlercodes.

## Tests

- Rust: Raster (PNG-Farbtypen, kaputte Dateien, Flächenmittel, Alpha), Farbstatistik (Rampe = Ebene, Rauschen
  und Flächen ohne Verlauf, Zusammenführen = Vereinigung), Regionen (gestapelt, Keying, Schwarzweiß, Bänder
  verschmelzen, Hintergrund), Formen (Rechteck mit Radius, Ellipse, Kreis, Dreieck/Ring/L/N/O bleiben Pfade, Kanten
  aus der Kantenglättung, Nachbar gleicher Farbe, Angleichen ohne Verkettung, Farben), Ende-zu-Ende mit resvg
  zurückgerendert (Stufe A < 14, Stufe B < 6 mittlere Abweichung), Skalierung, große Bilder, Grenzen, DTO-Namen;
  `get_template` im Router, `set_template`-Pfade, Schema-Schnappschuss.
- Vitest: `template.spec` (Geometrie, Quellen, Aktionen, KI-Größe), `trace.spec` (Stile, Argumente, Plan mit
  `position` und Undo, Service-Quellen, KI-Lauf, Fehler), `trace-dialog.spec` (Vorschau, Stil/Detail, Fehler,
  Einfügen), `mcp.store.spec` (Vorlage erfragt, übergeben, Nachzeichnen als ein KI-Schritt, Sperren).
- Playwright `e2e/trace.spec.ts`: Vorlage deckungsgleich mit (0, 256)–(1024, 768) bei 300 × 150, nicht im Weg,
  zeigen/Deckkraft/entfernen; Dialog → Stil → neue Ebene → Undo.

## Ergebnis am Beispielbild (Release-Build, Container)

| Stil             | Elemente | Pfade | Rechtecke | Ellipsen | Verläufe | Farben | Zeit   |
| ---------------- | -------- | ----- | --------- | -------- | -------- | ------ | ------ |
| Detailliert (A)  | 467      | 467   | 0         | 0        | 0        | 378    | 0,33 s |
| Wie von Hand (B) | 420      | 319   | 60        | 41       | 7        | 96     | 0,40 s |

Stufe B: Gehäuse mit Verlauf, Display und alle 24 Tasten als abgerundete Rechtecke gleicher Größe, Punkte und
Innenformen (O, 0, Dezimalpunkt) als Ellipsen/Kreise, Buchstaben als Pfade. Debug-Build: 3,3 s.

## Fragen an Marc

1. Vorlage **über** den Ebenen mit 50 % (zum Vergleichen) – oder lieber darunter wie eine Pausvorlage?
2. Name der neuen Ebene `<Bild>-traced` – passt das, oder deutsch/anders?
3. Beim Nachzeichnen einer PNG-Ebene bleibt das Original sichtbar – soll es ausgeblendet werden?
4. **Mac:** Vorschau im Dialog flüssig genug (WKWebView, Release)? Schrift bleibt Pfad (keine Texterkennung) –
   Text als `<text>` macht nur der KI-Weg (C).
