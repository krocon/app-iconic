# Prompt 047: Shape Builder und Pathfinder (boolesche Operationen)

> Lies zuerst [000-arbeitsweise.md](../000-arbeitsweise.md). Braucht: 046 · Vorbild: VectorCraft (`~/RustroverProjects/vectorcraft`, Marcs eigenes Projekt, MIT/Apache – Algorithmen dürfen mit Herkunftsvermerk übertragen werden),
> `crates/tools/src/builder.rs` (`vectorcraft_pathops::shape_builder`)

## Stand

- ✅ 29.10.2026: Rechnung in TypeScript mit **paper.js** (MIT, lazy; Begründung in `docs/architecture.md`), rein in
  `shared/geometry/pathops/boolean-ops.ts`. Pathfinder im Menü Edit › Pathfinder: `pathfinder.unite`, `minusFront`
  (hinterste Form minus alle anderen, behält ihr Aussehen), `intersect`, `exclude` (sonst Aussehen der vordersten),
  `pathfinder.divide` (jede Teilfläche ein Pfad, Aussehen der vordersten deckenden Form). **Shape Builder**
  (`shapeBuilder.tool`, ⇧M): Hover hebt die Teilfläche hervor, Ziehen vereinigt die überstrichenen, Alt löscht;
  das Ergebnis bleibt ausgewählt. Dazu aus 046: **Messer** (`cut.knife`, Freihandschnitt), **Linienschnitt**
  (`cut.lineCut`), **Rechteckschnitt** (`cut.rectCut`, innen/außen). Ergebnisse sind `<path>`s mit den übrigen
  Attributen der Quelle an ihrer Stelle in der Z-Reihenfolge; jeder Vorgang ein Undo-Schritt. Offene Pfade gelten
  als geschlossen (gefüllt); Schnitte übergehen Formen ohne geschlossene Kontur. Mirror & Cut offen.

## Umfang

- **Pathfinder:** Vereinigen, Subtrahieren, Schnittmenge, Ausschließen, Teilen für ausgewählte Formen (Ergebnis
  `<path>`, ein Undo-Schritt). Rechnung in Rust (`ai-core`, Crate mit geprüfter Lizenz) oder TypeScript –
  Entscheidung mit Begründung in `docs/architecture.md`.
- **Shape Builder:** Über überlappende Formen ziehen vereinigt die überstrichenen Teilflächen, Alt löscht sie;
  Hover hebt die Teilfläche hervor.

## Akzeptanz

- Tests für die Operationen mit Kreisen/Rechtecken/Löchern; Playwright: zwei Kreise vereinigen, Teilfläche löschen.
