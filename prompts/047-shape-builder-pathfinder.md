# Prompt 047: Shape Builder und Pathfinder (boolesche Operationen)

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 046 · Vorbild: VectorCraft (`~/RustroverProjects/vectorcraft`, Marcs eigenes Projekt, MIT/Apache – Algorithmen dürfen mit Herkunftsvermerk übertragen werden),
> `crates/tools/src/builder.rs` (`vectorcraft_pathops::shape_builder`)

## Umfang

- **Pathfinder:** Vereinigen, Subtrahieren, Schnittmenge, Ausschließen, Teilen für ausgewählte Formen (Ergebnis
  `<path>`, ein Undo-Schritt). Rechnung in Rust (`ai-core`, Crate mit geprüfter Lizenz) oder TypeScript –
  Entscheidung mit Begründung in `docs/architecture.md`.
- **Shape Builder:** Über überlappende Formen ziehen vereinigt die überstrichenen Teilflächen, Alt löscht sie;
  Hover hebt die Teilfläche hervor.

## Akzeptanz

- Tests für die Operationen mit Kreisen/Rechtecken/Löchern; Playwright: zwei Kreise vereinigen, Teilfläche löschen.
