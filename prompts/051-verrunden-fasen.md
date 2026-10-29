# Prompt 051: Verrunden und Fasen zwischen Elementen

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 050 · Vorbild: Fusion 360 Sketch „Fillet“/„Chamfer“; VectorCraft (`~/RustroverProjects/vectorcraft`, Marcs eigenes Projekt, MIT/Apache – Algorithmen dürfen mit Herkunftsvermerk übertragen werden), `crates/geom/src/corners.rs`

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
