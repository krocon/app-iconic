# Prompt 062: Bounding-Box-Inspektor (X, Y, B, H, Drehung, Spiegeln)

> Lies zuerst [000-arbeitsweise.md](../000-arbeitsweise.md). Braucht: 007, 009, 053 · Quelle:
> [Analyse 30.10.2026](../2026.10.30%20-%20analyse.md) §2.1 (P0, Aufwand M)

## Stand

- ✅ 30.10.2026: Kopf „Position & Größe“ oben im Properties-Panel für jede SVG-Auswahl (X/Y des Bezugspunkts, B/H mit
  Schloss, Drehung absolut bzw. „Drehen um“ bei mehreren/geneigten, Spiegeln, 9-Punkte-Bezug, gesperrt =
  schreibgeschützt); Aktionen `properties.box`, `properties.flipH`, `properties.flipV`. Design:
  [062-bbox-inspektor.design.md](062-bbox-inspektor.design.md).

## Ziel

Jede Auswahl – Pfad, Gruppe, Text, Bild, Mehrfachauswahl gemischter Typen – lässt sich numerisch positionieren,
skalieren, drehen und spiegeln.

## Ausgangslage (laut Analyse, zuerst bestätigen)

- `property-spec.ts` baut Geometriefelder nur aus rohen SVG-Attributen; `commonSpec()` bildet bei Mehrfachauswahl
  die Schnittmenge. Folge: `<g>` hat gar keinen Geometrie-Abschnitt, `<path>` nur das `d`-Feld, `<rect>` + `<circle>`
  zusammen zeigen keine Positions-/Größenfelder.

## Umfang

- **Kopf „Transform“ ganz oben im Properties-Panel**, immer sichtbar bei einer SVG-Auswahl: `X`, `Y`, `B`, `H`
  (Proportionen-Schloss), `Drehung °`, Spiegeln horizontal/vertikal, Bezugspunkt (9-Punkte-Wahl wie 053).
- **Messen über den Browser** (CLAUDE.md §4): Box im Dokumentraum (1024 × 1024) aus `getBBox` + CTM
  (`dom-geometry`/`selection-measure` wiederverwenden), Vereinigung bei Mehrfachauswahl. Kein eigener Parser.
- **Ändern:** eine angehängte Matrix wie bei der Box-Skalierung (007) bzw. dieselben Commands wie 053 – keine neue
  Transform-Kette. Ein Feld-Commit = ein Undo-Schritt; Ziehen am Stepped Slider = eine Geste (Coalescing).
- **Drehung:** Einzelauswahl zeigt den Winkel aus der Zerlegung der CTM (relativ zum Elternraum); Mehrfachauswahl
  zeigt leer/„gemischt“ und dreht relativ um den Bezugspunkt. Im Design entscheiden und begründen, wie Scherung
  (nicht zerlegbar) angezeigt wird.
- Die attributbasierten Felder (x, y, width, rx …, `d`) bleiben darunter im Abschnitt Geometrie.
- Gesperrte (055) Elemente: Felder schreibgeschützt.
- Aktion für KI/Befehlspalette: `properties.box { x?, y?, width?, height?, rotation?, flipH?, flipV?, pivot? }`
  (serialisierbar, ein Undo-Schritt).

## Akzeptanz

- Vitest: Zerlegung/Komposition (reine Matrixrechnung in `shared/geometry/`), Schloss, Mehrfach-Werte, Aktion
  JSON hin und zurück.
- Playwright (Layout nötig): Gruppe in transformierter Elterngruppe, Zoom 50/100/150 % – X/Y ändern verschiebt
  exakt; B/H mit Schloss; Rechteck + Kreis gemeinsam skalieren; Pfad drehen 30°, Undo/Redo stellt das SVG
  byte-gleich wieder her.
