# Prompt 050: Trimmen und Verlängern

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 040, 046, 049 · Vorbild: Fusion 360 Sketch „Trim“/„Extend“; VectorCraft (`~/RustroverProjects/vectorcraft`, Marcs eigenes Projekt, MIT/Apache – Algorithmen dürfen mit Herkunftsvermerk übertragen werden), `crates/tools/src/cut.rs`

## Stand

- ✅ 29.10.2026: Trimmen (`trim.tool`, T) und Verlängern (`extend.tool`, E) wie Fusion: Hover zeigt das Stück zwischen den
  benachbarten Schnittpunkten rot, Klick schneidet es weg, Ziehen über mehrere Stücke schneidet alle in einem
  Undo-Schritt; Kreise werden Bögen, Formen werden Pfade mit ihrem Aussehen; ohne Schnittpunkt fällt das Element weg.
  Verlängern führt ein offenes Ende geradlinig in seiner Richtung bis zur nächsten Kontur (ein gerades Endsegment bleibt
  ein Segment). Geschnitten wird gegen alle sichtbaren Formen inkl. Konstruktion, kurvengenau mit paper.js
  (`shared/geometry/pathops/trim.ts`). `trim.at` / `extend.at {x, y}` für die KI. Bögen werden geradlinig verlängert,
  nicht auf ihrem Kreis (offen).

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
