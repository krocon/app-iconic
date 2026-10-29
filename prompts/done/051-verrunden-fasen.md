# Prompt 051: Verrunden und Fasen zwischen Elementen

> Lies zuerst [000-arbeitsweise.md](../000-arbeitsweise.md). Braucht: 050 · Vorbild: Fusion 360 Sketch „Fillet“/„Chamfer“; VectorCraft (`~/RustroverProjects/vectorcraft`, Marcs eigenes Projekt, MIT/Apache – Algorithmen dürfen mit Herkunftsvermerk übertragen werden), `crates/geom/src/corners.rs`

## Stand

- ✅ 29.10.2026: Verrunden (`fillet.tool`) und Fasen (`chamfer.tool`) wie Fusion: eine Ecke anklicken (wo sich
  zwei Konturen treffen oder ein Eckpunkt eines Pfads) oder erst die eine, dann die andere Linie/Kurve; Dialog mit
  Radius bzw. Abstand (− / +), Vorschau live, OK = ein Undo-Schritt, „zu groß“ wird angezeigt. Linien, Bögen,
  Kreise und Béziers: Mittelpunkt des Rundungskreises per Newton auf den Abständen, Tangentenpunkte kurvengenau
  (`shared/geometry/pathops/fillet.ts`, paper.js). Die erste Seite bekommt den Bogen angehängt, die zweite wird bis
  zum Tangentenpunkt gekürzt; Ecke innerhalb eines Pfads (auch neben gekrümmter Seite, auch Rechteck/Polygon) wird
  im Pfad ersetzt. Ids der ersetzten Formen bleiben. `fillet.at {kind, a, b?, radius}` für die KI.
- Offen: Konturen, die sich nicht treffen, werden nicht vorher verlängert (erst Verlängern, 050).

## Ziel

Die Live Corners (045) runden nur Ecken innerhalb einer geraden Form. Es fehlt die Verrundung zwischen zwei
Elementen – Linie/Linie, Linie/Bogen, Bogen/Bogen – wie in Fusion.

## Umfang

- **Fillet** (`fillet.tool`): zwei Elemente (oder eine Ecke, an der sie sich treffen) anklicken, Radius im
  Maßfeld neben dem Zeiger (wie 019) oder ziehen; die Elemente werden bis zu den Tangentenpunkten gekürzt
  (über 050), ein Bogen-Pfad verbindet sie. Treffen sich die Elemente nicht, werden sie erst verlängert.
- **Chamfer** (`chamfer.tool`): wie Fillet, eine gerade Fase mit Abstand (gleich oder zwei Abstände).
- Für Pfade: Ecke zwischen zwei Segmenten (auch gekrümmten) eines Pfads runden – das ergänzt die Live Corners.
- Aktionen mit Argumenten (`fillet.at {a, b, radius}`); ein Undo-Schritt.

## Akzeptanz

- Vitest: Tangentenpunkte und Mittelpunkt für Linie/Linie (alle Quadranten), Linie/Kreis, Kreis/Kreis.
- Playwright: zwei Linien mit Radius 30 verrunden; Ecke eines Pfads mit gekrümmter Seite.
