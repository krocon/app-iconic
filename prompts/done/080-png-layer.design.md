# Design 080: Bild als Layer importieren/ersetzen, Layer auf dem Canvas transformieren

> Prompt: [080-png-layer.md](080-png-layer.md) · Stand: 30.10.2026

## Ausgangslage (im Code bestätigt)

- `Assets/*.png` werden verlustfrei durchgereicht: `IconAsset::data_url` (Rust) → `AssetState.dataUrl` (TS),
  `saved: ''`; beim Speichern immer `unchanged` (Bytes aus der Sitzung). **Neue** Rasterbilder kann das Frontend
  nicht speichern: `SaveAsset` trägt nur `text` (SVG), Rust `assemble` nur `text.into_bytes()`.
- `IconDocument.isUnchanged` hält jedes Nicht-SVG-Asset für unverändert (`!a.svg`) – ein ersetztes Bild würde
  stillschweigend mit den alten Bytes gespeichert.
- File › Import SVG… (`pick_svg_file` → `read_svg_file`) nimmt nur `.svg`; Add › Image… (`add.image`, 008 E8)
  bettet `<image href="data:…">` in ein SVG-Asset ein. Einen Befehl „Bild als Layer“ gibt es nicht.
- Layer werden nur über die Zahlenfelder `position.scale`/`position.x`/`position.y` im Inspector bewegt
  (`icon-fields.ts`, `SetIconJsonValue`); die Auswahl-Handles (007, `selection-measure.ts`) kennen nur `NodeRef`s.
- Vorschau: `LayerStack.imageContent` legt ein PNG in natürlicher Größe mittig ab – bis zum Dekodieren aber über
  die ganze Fläche (1024²); Export: `exportSvg(…, raster)` mit `rasterSizes(doc)` (012 E7) – PNG-Layer kommen in
  SVG, PNG, Pakete 078/079 und die kleine Vorschau, mit Layer-Fill/Tinted (077), da alles über `stackOf` läuft.

## Belege (Format konservativ)

- **Schema** github.com/dfabulich/unofficial-apple-icon-composer-json-schema (gegen Icon Composer aus Xcode 26.2
  geprüft): `image-name` = „Filename of the image asset in the Assets folder (**PNG or SVG**)“; `position` =
  `{ scale, translation-in-points: [x, y] }`, beide Pflicht, `additionalProperties: false`, „in points“.
- **Echte Dateien** dort: `Spacedrive.icon` (`Ball.png` 512 × 512, `scale 2`, Translation ≈ 0 → füllt die Fläche:
  PNG-Pixel = Punkte, Skalierung um die **Mitte**), `Turntable.icon` (`Button.png` 355 × 317 `scale 0.5`,
  `[-360, 330]`; `VerticalArm.png` 1248 × 1679 `scale 0.35`, `[300, -170]` – Knöpfe unten links, Arm oben
  rechts: **y nach unten**), `gb-studio.icon`, `Loop.icon` (`1 – Layer.png`, ohne `position`). Asset-Namen =
  Dateiname mit `.png`, Leerzeichen/Gedankenstrich erlaubt, direkt unter `Assets/` – wie unsere Fixtures.
- Damit ist offene Frage 004/2 („y nach unten, Skalierung um die Mitte?“) durch Dateien gestützt (nicht durch
  Icon Composer selbst bestätigt) – die Semantik von 004 E4 bleibt:
  `translate(512 + tx, 512 + ty) scale(s) translate(−512, −512)`, Gruppe außen, Layer innen (`stackTransform`).
- **Nicht belegt:** JPEG/WebP-Assets, `@2x`-PNGs, ob Icon Composer große Bilder beim Import verkleinert.

## Entscheidungen

- **E1 Import** (`file.importImageLayer`, File-Menü nach „Import SVG…“, Kontextmenü der Baum-Items): Dialog
  `pick_image_file` → `read_image_file` (vorhandene, pfadgeprüfte Wege: 20 MiB, Magic Bytes, Größe aus dem Kopf).
  **PNG** wird byte-gleich übernommen (die Data-URL aus Rust). **JPEG/WebP** sind als Asset nicht belegt → im
  Browser einmal nach PNG umgerechnet (`<canvas>.toDataURL('image/png')`, `RasterConverter`), Asset-Name mit
  `.png`. **SVG** aus demselben Dialog wird ein SVG-Layer (bereinigt wie Import SVG, 003 E4/E5).
- **E2 Ort und Namen:** neuer Layer **vorn** in der aktiven Gruppe (`currentGroupIndex`, 008 E4: Gruppe der
  gewählten Nodes/des Layers/der Gruppe); ist ein Layer gewählt, direkt vor ihm. Ohne Gruppen: neue Gruppe oben
  (`newGroup`, wie Import SVG). Asset-Name `uniqueAssetName(<stem>.png)` (`unique-names.ts`/`names.rs`, Tabelle
  `testdata/unique-names.json`), Layer-Name `uniqueLayerName(layerNameFor(asset))`. Der Layer wird gewählt.
  Ein Undo-Schritt (`CompositeCommand('importImageLayer', [AddRasterAsset, AddLayer|AddGroup])`).
- **E3 Größe:** natürliche Größe in Punkten, mittig (wie Icon Composer laut Spacedrive). Ist eine Seite größer als
  1024, bekommt der Layer `position { scale: 1024 / max(w, h), translation-in-points: [0, 0] }` (belegtes Format),
  damit ein Foto nicht die Fläche sprengt.
- **E4 Ersetzen** (`file.replaceLayerImage`, Kontextmenü): nur für einen gewählten Layer mit PNG-Asset. Dieselbe
  Datei unter **demselben Namen** bekommt neue Bytes (`ReplaceRasterAsset`) – `image-name`, `position` und alle
  anderen Felder bleiben; teilen sich mehrere Layer das Asset (Spacedrive), ändern sich alle (es ist eine Datei).
  SVG als Ersatz → Hinweis, nichts geändert.
- **E5 Neue Commands** (serialisierbar, Registry): `addRasterAsset { name, dataUrl }`,
  `replaceRasterAsset { name, dataUrl }`; `dataUrl` nur `data:image/png;base64,…`, höchstens `MAX_DATA_URL`
  (64 MiB Zeichen). Undo stellt den alten `AssetState` her.
- **E6 Speichern:** `SaveAsset.dataUrl` (TS) ↔ `SaveAssetDto.data_url` (Rust, `model.rs`) ↔ `AssetInput.data_url`
  (ai-core). `assemble` dekodiert Base64 nur für `.png`-Assets mit PNG-Signatur (sonst `invalid_icon`). Bundle
  und ZIP schreiben die Bytes unverändert (byte-gleich wieder gelesen). Im Frontend merkt sich ein Rasterbild in
  `saved` seine Data-URL bei Öffnen/Speichern; `isUnchanged` vergleicht sie (ersetzte Bilder werden gesendet,
  unveränderte nur beim Namen – 002 E5 bleibt).
- **E7 Natürliche Größe** (`canvas/raster-size.ts`): Cache Data-URL → `{ width, height }` mit Signal-Version; der
  Import füllt ihn aus dem Bildkopf (Rust), sonst einmal dekodieren. `LayerStack` legt PNGs sofort richtig ab,
  `rasterSizes` (Export) nimmt den Cache, die Layer-Handles lesen ihn.
- **E8 Layer-Handles** (`features/layer-transform/`): sichtbar mit dem Auswahlwerkzeug, wenn **genau ein Layer**
  im Baum gewählt ist (keine Nodes) und er gezeichnet wird. Rahmen = Inhaltsrahmen des Layers: PNG = Bildrechteck
  (E7), SVG = `getBBox` der lebenden Wurzel über die Screen-CTMs in die Fläche (`nodeBoundsInDocument`), leer →
  Platzierungsrechteck. Gemessen wird **nur außerhalb einer Geste** (rAF nach Änderung) und in den Layer-Raum
  zurückgerechnet (`B`); während des Ziehens ist der Rahmen reine Rechnung `G · L(position) · B` – nichts Teures
  je Zieh-Schritt (033).
  - _Verschieben:_ Drücken im Rahmen, wo kein Node getroffen wird (`CanvasInteraction.down`, wie „in der Auswahl
    verschieben“), Δt = Δ/Gruppen-Skalierung.
  - _Skalieren:_ vier Eckgriffe, gleichmäßig um die **Mitte des Rahmens** (`s' = s·k`, `k` = Abstand zur Mitte
    jetzt/vorher; `t' = t + (s − s')(c_B − 512)` hält die Mitte fest), `s ≥ 0.01`.
  - _Snapping wie 007:_ `snapMove` mit den Rahmenpunkten (Ecken, Mitte) gegen Raster und die Marken der Fläche
    (Ecken, Kantenmitten, Mitte), `snapPoint` für den Eckgriff; ⌥ schaltet ab; Anzeige über `CanvasEditStore.snap`.
  - Eine Geste = ein Undo-Schritt (`GestureController`, Esc bricht ab); geschrieben wird `position` für das
    **bearbeitete Erscheinungsbild** wie im Inspector (`specializedEdits`, 010 E3) als `SetIconJsonValue`;
    unbekannte Unterfelder bleiben, Werte gerundet (Punkte 0,01, Skalierung 0,0001).
  - KI/Tastatur: `icon.set` mit `position.scale|x|y` (gibt es seit 010) – keine Logik nur über die Maus.
- **E9 Drop (071)** bleibt: ein abgelegtes Bild wird `<image>` im SVG; „Bild als Layer“ ist der Menüweg.

## Verträge

```ts
// document/commands/asset-commands.ts
class AddRasterAsset { constructor(name: string, dataUrl: string) }      // type 'addRasterAsset'
class ReplaceRasterAsset { constructor(name: string, dataUrl: string) }  // type 'replaceRasterAsset'
// icon-file.models.ts
interface SaveAsset { …; dataUrl?: string }   // neues/ersetztes PNG
// canvas/raster-size.ts
function knownRasterSize(url: string): Size | null;
function rememberRasterSize(url: string, w: number, h: number): void;
function loadRasterSize(url: string): Promise<Size | null>;
const rasterSizeVersion: Signal<number>;
// layer-transform/layer-position.ts (rein)
interface LayerPosition { scale: number; tx: number; ty: number }
function readPosition(v: unknown): LayerPosition;                       // fehlt → 1, 0, 0
function positionMatrix(p: LayerPosition): Matrix;
function positionValue(old: unknown, p: LayerPosition): JsonValue;     // unbekannte Unterfelder bleiben
function movedPosition(p, delta: Point, groupScale: number): LayerPosition;
function scaledPosition(p, centre: Point /* Layer-Raum */, k: number): LayerPosition;
function frameCorners(m: Matrix, box: Rect): Point[];
function fitScale(w: number, h: number): number | null;                // > 1024 → 1024/max
// image-layer/image-layer.ts (rein)
function imageLayerPlan(doc, file: LayerImage, sel: Selection): ImageLayerPlan | null;
function replaceImagePlan(doc, item: LayerItem, file: LayerImage): DocCommand | null;
function pngAssetBase(fileName: string): string;
```

Rust: `SaveAssetDto { …, data_url: Option<String> }`, `AssetInput { …, data_url: Option<String> }`,
`save::decode_png_data_url(&str) -> Option<Vec<u8>>`.

Aktionen: `file.importImageLayer`, `file.replaceLayerImage` (Dialog; `file.*` ist für die KI gesperrt wie
`file.importSvg` – 018 Sperrliste).

## Tests

- Rust (`save.rs`): neues PNG-Asset aus Data-URL in Bundle **und** ZIP speichern, wieder öffnen → Bytes gleich,
  `icon.json` unverändert bis auf den Layer; Speichern ohne Änderung danach byte-gleich; falsche Data-URL / PNG als
  SVG / SVG mit Data-URL → `invalid_icon`; `model.rs` DTO-Default.
- Vitest: `layer-position.spec` (lesen, Matrix = `layerTransform`, verschieben mit Gruppen-Skalierung, skalieren
  hält die Mitte, unbekannte Felder, Rundung, `fitScale`), `image-layer.spec` (Ort: aktive Gruppe/vor dem Layer/
  neue Gruppe, Namen eindeutig, JPEG → `.png`, große Bilder `position`, Ersetzen, ein Undo-Schritt),
  `asset-commands`/Registry (JSON hin und zurück, Grenzen), `icon-document.spec` (geänderte/ersetzte PNGs im
  `saveRequest`, unveränderte nur beim Namen), `raster-size.spec`, Service mit Fakes, Menü/Katalog.
- Playwright `e2e/png-layer.spec.ts`: PNG importieren (Fake-Datei), Layer gewählt, Ziehen im Rahmen → `position`
  ändert sich, Undo stellt her; Eckgriff skaliert um die Mitte; Export-SVG enthält `<image href="data:image/png…">`
  mit der Layer-Transformation; Ersetzen behält `position`.

## Fragen an Marc

1. JPEG/WebP werden beim Import in PNG umgerechnet (Icon Composer kennt laut Schema nur PNG/SVG) – ok, oder lieber
   ablehnen?
2. Bilder größer als 1024 pt werden beim Import auf die Fläche eingepasst (`position.scale`) – oder natürliche Größe
   wie in Icon Composer?
3. „Bild ersetzen“ ändert die Datei (alle Layer, die sie zeigen) – oder soll nur dieser Layer ein neues Asset
   bekommen?
4. **Mac**: Layer-Handles in WKWebView (Rahmen deckungsgleich mit dem Bild, Ziehen flüssig bei großen SVGs)?
