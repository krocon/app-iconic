# Prompt 041: Formen aufziehen (Klicken und Ziehen)

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 019, 040 · Vorbild: VectorCraft (`~/RustroverProjects/vectorcraft`, Marcs eigenes Projekt, MIT/Apache – Algorithmen dürfen mit Herkunftsvermerk übertragen werden),
> `crates/tools/src/shape.rs`

## Ziel

Formen entstehen wie in VectorCraft mit einer Zieh-Geste – zusätzlich zu den Fusion-Werkzeugen mit zwei Klicks und
Maßfeldern.

## Stand

- ✅ 29.10.2026: Rectangle / Ellipse / Polygon / Line Segment Tool (`sketch.drag*`, Kürzel `m` = Rechteck) mit
  Shift, Alt, Leertaste (Kontext „drawing“: `sketch.moveHold`), ↑/↓ (`sketch.sidesUp/Down`), Klick → Größendialog
  (`ShapeSizeDialog`), Geometrie rein in `shared/geometry/sketch/drag-shapes.ts`. Der Stern folgt mit 044.

## Umfang

- Rechteck, Ellipse, Polygon, Stern, Linie: Drücken = Start, Ziehen = Größe, Loslassen = fertig (ein Undo-Schritt).
- **Shift** = Quadrat/Kreis/45°-Schritte, **Alt** = von der Mitte aus, **Leertaste** gehalten = die Form beim
  Ziehen verschieben, **↑/↓** = Ecken/Zacken eines Polygons/Sterns ändern.
- **Klick ohne Ziehen** öffnet einen Größendialog (Breite/Höhe bzw. Radius/Ecken, wie der VectorCraft-Polygon-Dialog)
  und legt die Form an der Klickstelle an.
- Start und Ecke snappen wie 040 (auch beim Überfahren vor dem Drücken).
- Die Fusion-Werkzeuge (019) bleiben: Klick-Klick plus Maßfelder; Ziehen von einem gesetzten Punkt aus setzt beim
  Loslassen den nächsten Punkt (019 E4).
- Aktionen mit Argumenten für die KI über dieselben reinen Funktionen.

## Akzeptanz

- Vitest für die Geometrie der Modifikatoren; Playwright: Rechteck mit Shift und Alt, Polygon mit ↑, Klick → Dialog.
