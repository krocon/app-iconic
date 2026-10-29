# Prompt 050: Trimmen und Verlängern

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 040, 046, 049 · Vorbild: Fusion 360 Sketch „Trim“/„Extend“; VectorCraft (`~/RustroverProjects/vectorcraft`, Marcs eigenes Projekt, MIT/Apache – Algorithmen dürfen mit Herkunftsvermerk übertragen werden), `crates/tools/src/cut.rs`

## Ziel

Konstruieren wie in Fusion: Hilfsgeometrie großzügig zeichnen und dann zurechtschneiden. Bisher schneidet nur der
Shape Builder Flächen; offene Linien, Bögen und Kreise lassen sich nicht an ihren Schnittpunkten kürzen.

## Umfang

- **Trim** (`trim.tool`, T): Hover hebt das Stück eines Elements zwischen den benachbarten Schnittpunkten (mit
  allen sichtbaren Formen, auch Konstruktion) hervor; Klick entfernt es. Linie → kürzer oder zwei Linien, Kreis →
  Bogen-Pfad, Rechteck/Polygon/Pfad → offener Pfad bzw. zwei Pfade. Ziehen über mehrere Stücke trimmt alle.
  Ohne Schnittpunkt wird das ganze Element gelöscht.
- **Extend** (`extend.tool`, E): Klick nahe dem Ende einer offenen Linie / eines Bogens verlängert sie bis zur
  nächsten Kante in Verlaufsrichtung (Bogen auf seinem Kreis).
- Aktionen mit Argumenten für die KI (`trim.at {x, y}`, `extend.at {x, y}`); ein Undo-Schritt je Klick/Zug.
- Reine Geometrie (Schnittparameter je Element, Stück um den Klickpunkt, Pfad-Teilstück) in `shared/geometry`.

## Akzeptanz

- Vitest: Stücke zwischen Schnittpunkten für Linie, Kreis, Pfad; Verlängern bis zur nächsten Kante.
- Playwright: zwei gekreuzte Linien – ein Ende abschneiden; Kreis von einer Linie geschnitten → Bogen; Linie bis an
  einen Kreis verlängern.
