# Design 004: Canvas – Rendern, Zoom, Pan, Lineale, Guides

Status: umgesetzt · Datum: 27.10.2026

## Ausgangslage

003 liefert `IconDocument` (je SVG-Asset eine `XMLDocument`), `DocumentStore` (Revision, Commands) und einen
Platzhalter-Canvas, der **Kopien** der Assets in Shadow Roots übereinanderlegt. 004 ersetzt ihn durch den echten
Canvas: lebende Asset-Elemente, Hintergrund-Fill, Maske, Zoom/Pan, Lineale, Koordinaten, Fadenkreuz, Guides und die
Geometrie-Basis für 007. Rust bekommt nichts Neues.

## Entscheidungen

- **E1 Das Asset-`<svg>` ist lebendig.** `SvgText` bekommt `root` (das `<svg>` des Assets). Nach dem Bereinigen
  (`IconDocument.prepare`) zieht `goLive(svg)` die Wurzel aus der inerten `XMLDocument` in das Fenster-Dokument
  (`document.adoptNode`); die `XMLDocument` behält nur den Prolog (Kommentare, Doctype) und merkt sich die Position
  der Wurzel (`rootIndex`). `serializeAsset` setzt eine Kopie der Wurzel wieder an diese Stelle – die Serialisierung
  ist byte-gleich wie in 003 (Vitest über alle Fixtures). Der Canvas hängt **dieselbe Instanz** ein; Commands ändern
  sie, der Browser zeigt die Änderung ohne Neuaufbau, und `getCTM`/`getBBox` funktionieren an genau den Elementen, auf
  die `NodeRef`s zeigen (Grundlage für 007). Reihenfolge ist Pflicht: **erst bereinigen, dann lebendig** – ein
  `<image onerror>` in einem HTML-Dokument (auch abgehängt) würde sonst ausgeführt. `node(ref)` und `refOf(el)` suchen
  ab `root`.
- **E2 IDs bleiben eindeutig durch einen Shadow Root je Layer.** Mehrere Assets dürfen gleiche `id`s haben
  (`url(#grad)`, `clip-path`). Ein Host-SVG mit allen Layern würde `url(#id)` dokumentweit auflösen (erste Fundstelle
  gewinnt), IDs umschreiben verletzt den verlustfreien Roundtrip. Deshalb: je Layer ein `<div class="layer">` mit
  **Shadow Root**, darin ein eigenes `<svg class="layer-host" viewBox="0 0 1024 1024">` → `<g>` (Opacity,
  Position) → Platzierungs-`<svg>` (E4) → lebende Asset-Wurzel. Referenzen lösen im Tree Scope des Shadow Roots auf,
  `<style>` eines Assets wirkt nur dort (wie 003 E16). Alle Layer-Hosts und das Overlay-SVG liegen deckungsgleich
  übereinander. Shadow Roots lassen sich nicht an SVG-Elemente hängen – daher ein Host-SVG je Layer statt eines
  einzigen für alle (Abweichung vom Wortlaut „ein Host-`<svg>`, je Layer ein `<g>`“, gleiche Geometrie). Playwright
  prüft zwei Assets mit derselben Verlaufs-ID und verschiedenen Farben.
- **E3 Reihenfolge: erste Gruppe oben** (Icon Composer: die Seitenleiste zeigt die Gruppen in `icon.json`-Reihenfolge,
  die oberste Zeile liegt vorn; ebenso Layer in einer Gruppe). Gerendert wird daher rückwärts: letzte Gruppe, letzter
  Layer zuerst (unten). Das korrigiert den Platzhalter aus 003 (erste Gruppe unten, legacy). `hidden: true` an Gruppe
  oder Layer blendet aus, `opacity` an Gruppe (auf den Gruppen-Container, damit Überlappungen innerhalb der Gruppe
  nicht doppelt durchscheinen) und Layer (auf das `<g>`) wirkt. Der Import (003 E15) hängt neue Gruppen weiter
  **ans Ende** – also künftig nach unten; das ändert 006 (Hinzufügen oben), hier unverändert.
- **E4 Platzierung von Assets anderer Größe: zentriert, unskaliert** (wie Icon Composer: SVG-Einheiten = Punkte).
  `asset-placement.ts` (rein): Breite/Höhe aus `width`/`height` (Zahl oder `px`), sonst aus der `viewBox`, sonst
  1024; Position `(1024 − w) / 2`, `(1024 − h) / 2`. Das Platzierungs-`<svg x y width height>` gehört dem Canvas –
  am Asset wird nichts geändert. `some_pathes.svg` (viewBox 500 × 500, ohne Größe) liegt also 500 × 500 in der Mitte.
  Icon-Composer-`position` am Layer (`scale`, `translation-in-points`) wird, falls vorhanden, als
  `translate(512+tx, 512+ty) scale(s) translate(−512, −512)` angewandt (Annahme y nach unten, Frage 2).
  **PNG-Assets** als `<image>` in natürlicher Pixelgröße, zentriert (Größe nach dem Dekodieren).
- **E5 Dasselbe Asset in mehreren Layern:** ein Element kann nur an einer Stelle hängen. Der oberste Layer bekommt die
  lebende Wurzel, weitere eine Kopie, die bei jeder Revision erneuert wird (selten; nur Anzeige).
- **E6 Neuaufbau nur bei Strukturänderungen.** `LayerStack` (DOM, ohne Angular) berechnet bei jeder Revision eine
  Signatur (Gruppen/Layer, Asset-Name, Identität der Wurzel, Opacity, hidden, position). Gleich → nichts tun (Attribut-
  Änderungen sieht man ohnehin, weil die Wurzel lebt), nur Kopien (E5) erneuern; anders → Stapel neu aufbauen (die
  lebenden Wurzeln werden nur umgehängt).
- **E7 Hintergrund** `fill-preview.ts` (rein): `icon.json` → `FillPreview` (`none` | `solid` | `linear` | `radial`
  mit CSS-Farben und Einheitskoordinaten). Auswahl: `fill-specializations` (Eintrag mit passender `appearance`, sonst
  ohne) vor `fill`; fehlt beides → `automatic`. Arten: `automatic` = `system-light`/`system-dark` je Appearance;
  `system-light` = Verlauf Weiß → `#E5E5EA` (oben → unten), `system-dark` = `#3A3A3C` → `#141414` (Annäherung an Icon
  Composer, legacy-Defaults Weiß/`0.07843`); `solid`; `automatic-gradient` = Farbe +16 % → −14 % (legacy) von oben
  nach unten; `linear-gradient` mit `orientation { start, stop }` (Einheitskoordinaten, Standard oben → unten);
  `radial-gradient` mit Mittelpunkt `orientation.start` und Radius bis `stop` (Standard Mitte, 0,75 wie legacy).
  Unbekanntes → `automatic` + Hinweis `unknown` (nichts wird geschrieben). Farben `icon-color.ts`:
  `srgb:`/`extended-srgb:` → `color(srgb r g b / a)`, `display-p3:` → `color(display-p3 …)`, `gray:`/
  `extended-gray:` → Grau in sRGB; erweiterte Werte (< 0, > 1) bleiben stehen (CSS Color 4). Umschalter Light/Dark
  (Start: System-Schema), Hintergrund ein-/ausblendbar (aus = Schachbrett).
- **E8 Plattform-Maske** als CSS `clip-path` auf der Zeichenfläche (Hintergrund + Layer; Guides darüber bleiben
  ungeschnitten): `squircle` (iOS/macOS) = Apples „continuous corner“-Rechteck (`squircle.ts`, rein; Bézier-Koeffizienten
  der bekannten Rekonstruktion von `UIBezierPath(roundedRect:cornerRadius:)` ab iOS 7, Radius 22,37 % der Kante –
  sichtbar ab ≈ 1,53 r von der Ecke), als `path()` in Pixeln für den aktuellen Zoom; `circle` (watchOS) =
  `circle(50%)`; `none`. Standard `squircle`. Die Vorlage nutzte ein normales abgerundetes Rechteck (r = 196).
- **E9 Zoom** `zoom-steps.ts`: Stufen 25/33/50/66/75/100/125/150/200 % (legacy §5), ⌘+/⌘= nächste Stufe über, ⌘−
  nächste darunter, ⌘0 = 100 % (provisorisch in `ProvisionalShortcuts`, `register()`; 005 übernimmt). Ctrl+Wheel bzw.
  Trackpad-Pinch zoomt **stufenlos** (Faktor `exp(−Δy · 0,01)`, auf 25–200 % begrenzt) um den Mauszeiger, die Knöpfe
  springen auf die nächste Stufe; Anzeige als Auswahlliste der Stufen (+ aktueller Wert, wenn er keine Stufe ist).
  Zoom um einen Punkt: `pan' = p − (p − pan) · z'/z` (`view-transform.ts`). Start und „Fit“: größte Stufe, die mit
  32 px Rand passt (höchstens 100 %), zentriert; solange der Nutzer nicht gezoomt/gepannt hat, bleibt die Fläche beim
  Größenändern zentriert. „Center Canvas“ zentriert bei aktuellem Zoom.
- **E10 Pan** ohne Scrollbalken (die Fläche wird mit `transform: translate()` verschoben – billig, kein Layout):
  Mausrad/Trackpad (Δx/Δy, Shift+Rad horizontal), Space+Ziehen, mittlere Maustaste (Pointer Capture). Begrenzung:
  mindestens 64 px der Fläche bleiben sichtbar. Zoom ändert Breite/Höhe der Fläche (1024 · z px) – die SVGs werden
  scharf neu gerastert (kein `scale()`).
- **E11 Geometrie-Basis** `shared/geometry/`: `ViewTransform { zoom, panX, panY }` (Dokument → Viewport-Pixel),
  `toMatrix()` → `DOMMatrix`, rein getestet. Mit DOM (`dom-geometry.ts`): `clientToDocument(host, {clientX,
  clientY})` = `host.getScreenCTM().inverse()` angewandt auf den Punkt; `nodeToDocument(host, el)` =
  `host.getScreenCTM()⁻¹ · el.getScreenCTM()`; `nodeBoundsInDocument(host, el)` = BBox-Ecken damit abgebildet.
  `el.getCTM()` endet am **nächsten Viewport-Element** – bei uns die Asset-Wurzel bzw. das Platzierungs-SVG –, darum
  der Weg über beide Screen-CTMs (keine eigene Transform-Kette, nur Browser-Matrizen). Host = das Overlay-SVG
  (`viewBox 0 0 1024 1024`, deckungsgleich mit allen Layer-Hosts).
- **E12 Lineale** in `<canvas>` (DPR-scharf), Schrittweite aus der 1-2-5-Reihe so, dass Hauptstriche ≥ 50 px
  auseinanderliegen; Nebenteilung 5 (bei 2er-Schritten 4); Beschriftung im Dokumentraum; Markierung der Mausposition.
  Messung im Container (Chromium, Playwright): s. Fortschritt. SVG-Lineale hätten bei jedem Pan-Schritt Hunderte
  Elemente neu gesetzt.
- **E13 Fadenkreuz** = zwei 1-px-Linien über die ganze Fläche an der Mausposition (aus = normaler Pfeil, an =
  `cursor: crosshair` + Linien). **Koordinaten** in der Statuszeile des Canvas (eine Nachkommastelle), außerhalb „–“.
- **E14 `CanvasViewStore`** (einfache Klasse mit Signals, von `CanvasView` bereitgestellt, eine je Fenster): `zoom`,
  `pan`, `viewport`, `pointer`, `options { rulers, guides, background, crossCursor, handles, mask, appearance }`
  (Standard: an, an, an, aus, an, `squircle`, System), Aktionen `zoomTo/zoomIn/zoomOut/actualSize/fit/center/panBy/
  toggle/set`. Persistenz in 015. `handles` wird erst in 007 benutzt.
- **E15 Provisorische Tastatur** bis 005: ⌘/Ctrl + `=`/`+`/`-`/`0` über `ProvisionalShortcuts.register()`, Space
  (gedrückt halten zum Pannen) über einen Listener des Canvas, nur wenn kein Eingabefeld fokussiert ist.
- **E16 Browser-Modus/Tests:** Der Fake legt jedes SVG-Fixture zusätzlich als `/fixtures/svg/<name>.icon` (eine
  Gruppe, ein Layer) ab; der Test-Hook bekommt `canvas` (Store) und `geometry` (`clientToDocument`,
  `nodeToDocument`). **Keine Pixel-Baselines:** Schrift-Rasterung (Text in `nested_g.svg`) unterscheidet sich
  zwischen Container und CI; stattdessen gezielte DOM-/Geometrie-Assertions und ein Farbtest über
  `page.screenshot` an einzelnen Punkten (Maske, ID-Konflikt, Reihenfolge) – Pixelwerte, keine Vergleichsbilder.

## Verträge

```ts
// shared/geometry/view-transform.ts
interface Point { x: number; y: number }
interface ViewTransform { zoom: number; panX: number; panY: number }
documentToView(t, p): Point; viewToDocument(t, p): Point; zoomAround(t, zoom, anchor): ViewTransform;
centered(viewW, viewH, zoom, size = 1024): ViewTransform; clampPan(t, viewW, viewH, size = 1024, keep = 64);
toMatrix(t): DOMMatrix
// shared/geometry/zoom-steps.ts
ZOOM_STEPS = [0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.25, 1.5, 2]; MIN_ZOOM, MAX_ZOOM;
nextZoomStep(z), prevZoomStep(z), clampZoom(z), fitZoom(viewW, viewH, size = 1024, margin = 32)
// shared/geometry/ruler-ticks.ts
rulerStep(zoom): { major, minor }; rulerTicks(zoom, offset, length): Tick[] { pos, value, major }
// shared/geometry/squircle.ts
ICON_CORNER_RATIO = 0.2237; squirclePath(size, radius = size * ICON_CORNER_RATIO): string
// shared/geometry/dom-geometry.ts
clientToDocument(host: SVGSVGElement, p: { clientX, clientY }): Point
nodeToDocument(host, el: SVGGraphicsElement): DOMMatrix; nodeBoundsInDocument(host, el): Rect
// features/canvas
icon-color.ts: parseIconColor(s): IconColor | null; cssColor(c): string; lighten/darken
fill-preview.ts: fillPreview(iconJson, appearance): FillPreview
asset-placement.ts: assetPlacement(root: Element): Rect; layerTransform(layer): string | null
layer-stack.ts: class LayerStack { constructor(box: HTMLElement); update(doc: IconDocument | null): void }
canvas-view.store.ts: class CanvasViewStore (E14)
canvas-view.ts, canvas-toolbar.ts, canvas-ruler.ts, canvas-texts.ts
// features/document/svg/node-ids.ts
interface SvgText { doc; root: Element; rootIndex: number; head; tail }
goLive(svg): void; serializeAsset(svg, keepIds = false)
```

## Tests

- Vitest: `icon-color` (alle Präfixe, erweitert, kaputt), `fill-preview` (alle Arten, Specializations, Appearance,
  Orientierung, Unbekanntes), `zoom-steps` (nächste/vorige Stufe, auch zwischen Stufen, Fit), `view-transform`
  (Hin/Rück, Zoom um Punkt hält Punkt, Zentrieren, Begrenzen), `ruler-ticks` (Schritte je Zoom, Beschriftung,
  Bereich), `squircle` (Symmetrie, Endpunkte, Kanten), `asset-placement`, `LayerStack` (Reihenfolge, hidden,
  Opacity, gleiche Instanz, kein Neuaufbau bei Attributänderung, Kopie bei Mehrfachnutzung), `goLive` +
  Serialisierung aller Fixtures unverändert, `CanvasViewStore`.
- Playwright: alle Fixtures öffnen ohne Konsolenfehler und mit sichtbarem Inhalt (BBox > 0, gleiche Instanz),
  `clientToDocument` bei 50/100/150 % und nach Pan (± 0,5 px), Zoom um den Mauszeiger (Ctrl+Wheel) hält den Punkt,
  `nested_g.svg`: Ursprung jeder Gruppe über `nodeToDocument` = beschriftete Position, Reihenfolge (erste Gruppe
  oben, Pixel), ID-Konflikt (Pixel), Maske (Ecke transparent), Lineal/Koordinaten, Zoom-Kürzel, Space-Pan.

## Fragen an Marc

1. **Reihenfolge:** erste Gruppe in `icon.json` = oben (E3). Bitte in Icon Composer mit zwei überlappenden Gruppen
   gegenprüfen (`camscanner.icon` überlappt kaum).
2. **Layer-`position`** (`scale`, `translation-in-points`): Zeigt y in Icon Composer nach unten? Skaliert es um die
   Mitte? (E4, nur Vorschau.)
3. **Farben von `automatic`/`system-*`** sind angenähert (E7) – stimmen sie mit Icon Composer überein?
4. **Squircle-Radius** 22,37 % (E8): gegen die Maske in Icon Composer halten.
5. Zoom: Pinch stufenlos, Knöpfe/Kürzel in Stufen – ok? Start „Fit“ (≤ 100 %) statt fest 100 %.
6. Auf dem Mac prüfen: Trackpad-Pinch (kommt in WKWebView als Ctrl+Wheel?), Zwei-Finger-Pan, Maske und
   Verlaufs-IDs in WKWebView, Retina-Schärfe der Lineale.

## Fortschritt

- [x] Design
- [x] Lebende Assets (`goLive`, `prepareSvg`), Serialisierung aller Fixtures unverändert (Vitest)
- [x] Reine Geometrie (`view-transform`, `zoom-steps`, `ruler-ticks`, `squircle`) + Fill-Preview/Farben + Tests
- [x] Canvas-Komponenten (`CanvasView`, `CanvasToolbar`, `CanvasRuler`, `CanvasBackground`), `LayerStack`,
  `CanvasViewStore`, provisorische Zoom-Kürzel, Space-/Mitteltasten-Pan
- [x] Playwright: 22 neue Tests (`e2e/canvas.spec.ts`), die 8 aus 003 angepasst (Locator der lebenden Wurzel)
- [x] Leistung (Chromium headless im Container, 2 CPUs): `logo-artv.svg` (100 KB) Zoom + Pan im Wechsel
  ≈ 17–22 ms je Frame inklusive Warten auf `requestAnimationFrame` (Untergrenze 16,7 ms) – Lineale (`<canvas>`)
  fallen darin nicht ins Gewicht
- [x] Echte App unter Xvfb (WebKitGTK): Fit 33 %, Squircle-Maske (`clip-path: path()`), Automatic-Hintergrund,
  Lineale, Guides, Koordinaten; ZIP über den nativen Dialog geöffnet, Layer in der richtigen Reihenfolge
- [x] Doku, `pnpm check` + `pnpm e2e` grün

## Abweichungen und Grenzen

- **Ein Host-SVG je Layer** (in einem Shadow Root) statt eines gemeinsamen Host-SVG mit `<g>` je Layer (E2) – nur so
  bleiben gleiche IDs verschiedener Assets getrennt. Geometrie-Host ist das deckungsgleiche Overlay-SVG.
- **`nodeToDocument`** nutzt `getScreenCTM()` von Element und Host statt `el.getCTM()` (E11), weil `getCTM()` am
  Asset-`<svg>` endet. Beides sind Browser-Matrizen; der `nested_g`-Test prüft 24 verschachtelte Ebenen bei 50/100/
  150 % und Pan auf ± 0,5.
- **Keine Screenshot-Baselines** (E16): Pixelfarben an gezielten Punkten statt Bildvergleich (plattformstabil).
- **Import** hängt neue Gruppen weiter ans Ende von `icon.json` an (003 E15) – mit E3 heißt das jetzt „unten“.
  006 entscheidet, ob Hinzufügen oben einfügt.
- **Vorschau-Grenzen:** Schatten, Transluzenz, Glas, Blend-Modes und „tinted“/monochrom fehlen (010);
  `automatic`-/`system-*`-Farben und Squircle-Radius sind Annäherungen (Fragen 3, 4).
- **Tastatur:** Zoom-Kürzel und Space sind provisorisch (E15) – 005 bringt Aktionen und Keymaps. Pannen per
  Tastatur (Pfeile) gibt es nicht; 007 belegt die Pfeile mit dem Verschieben der Auswahl.
- **WebKit (macOS):** `clip-path: path()`, `color(display-p3 …)` und `url(#id)` in Shadow Roots liefen in
  Chromium (Playwright) und WebKitGTK (Xvfb); auf dem Mac bitte einmal ansehen (Frage 6).
