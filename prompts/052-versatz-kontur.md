# Prompt 052: Versatz und Kontur in Fläche

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 047 · Vorbild: Illustrator „Offset Path“/„Outline Stroke“, Fusion „Offset“; VectorCraft (`~/RustroverProjects/vectorcraft`, Marcs eigenes Projekt, MIT/Apache – Algorithmen dürfen mit Herkunftsvermerk übertragen werden), `crates/pathops/src/offset.rs`

## Stand

- ✅ 29.10.2026: **Pfad verschieben** (`path.offset`, Menü Edit, Seitenleiste „Pfad bearbeiten“): Dialog mit Abstand
  (− / +; positiv außen, negativ innen), Ecken spitz/rund/abgeflacht, „Original ersetzen“; Vorschau live, OK = ein
  Undo-Schritt; ohne Ersetzen liegt der neue Pfad über dem Original. Offene Pfade werden zum Band. **Konturlinie**
  (`path.outlineStroke`): der Strich jeder ausgewählten Form wird eine Fläche in der Strichfarbe (Breite, Enden,
  Ecken, Gehrungsgrenze aus dem berechneten Stil, Strichmuster nicht); eine gefüllte Form bleibt ohne Strich darunter.
  Rechnung kurvenerhaltend in TypeScript (`shared/geometry/pathops/offset.ts`): ein Band je Segment (Linien exakt,
  Béziers per Tiller–Hanson bis 0,02 Einheiten genau), Ecken- und Endstücke, mit paper.js vereinigt; Versatz =
  Fläche ∪/− Strich der doppelten Breite wie VectorCraft. `path.offset {distance, join, replace}` für die KI.
- Offen: ein eigenes Offset-Werkzeug zum Ziehen (wie Fusion) – Dialog reicht vorerst.

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
