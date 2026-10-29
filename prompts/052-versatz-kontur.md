# Prompt 052: Versatz und Kontur in Fläche

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 047 · Vorbild: Illustrator „Offset Path“/„Outline Stroke“, Fusion „Offset“; VectorCraft (`~/RustroverProjects/vectorcraft`, Marcs eigenes Projekt, MIT/Apache – Algorithmen dürfen mit Herkunftsvermerk übertragen werden), `crates/pathops/src/offset.rs`

## Ziel

Gleichmäßige Wandstärken, Ränder und Ringe sind bei Icons Alltag; Strich-Icons müssen für Icon Composer
(Liquid Glass) oft Flächen werden.

## Umfang

- **Offset Path** (`path.offset {distance, join: miter|round|bevel, miterLimit}`): Dialog mit Live-Vorschau,
  positiv = außen, negativ = innen; Ergebnis als neuer Pfad (Original bleibt, Option „ersetzen“). Für offene
  Pfade beidseitig (= Kontur).
- **Outline Stroke** (`path.outlineStroke`): Strich der Auswahl (Breite, Enden, Ecken, Strichmuster ignoriert mit
  Hinweis) wird eine gefüllte Fläche mit der Strichfarbe; vereinigt mit der Füllung optional.
- **Offset-Werkzeug** wie Fusion: Kante/Pfad wählen, Abstand ziehen oder tippen.
- Rechnung: Kurven erhalten (Bézier-Versatz mit Nachsetzen nach VectorCraft), Selbstüberschneidungen per
  Pathfinder (paper.js) bereinigen.

## Akzeptanz

- Vitest: Kreis r=100 Versatz 10 → r=110 (Fläche), Rechteck mit runden/spitzen Ecken, offene Linie → Kapsel.
- Playwright: Strich-Icon in Fläche umwandeln, Export-Pixel stimmen mit dem Strich überein.
