# Prompt 046: Pfade bearbeiten – Punkte, Schere, Messer, Verbinden, Glätten

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 042 · Vorbild: VectorCraft (`~/RustroverProjects/vectorcraft`, Marcs eigenes Projekt, MIT/Apache – Algorithmen dürfen mit Herkunftsvermerk übertragen werden),
> `crates/tools/src/draw2/` (`anchor.rs`, `gesture.rs`), `cut.rs`

## Umfang

- Ankerpunkt hinzufügen / löschen / umwandeln (Ecke ↔ glatt) als eigene Werkzeuge und Aktionen.
- **Schere** (Pfad an einem Punkt öffnen/teilen), **Messer** (Freihandschnitt durch Flächen), **Line Cut** /
  **Rectangle Cut** / **Mirror & Cut**, **Join** (offene Enden verbinden), **Smooth** (Abschnitt glätten),
  **Path Eraser**.
- Freehand (013) setzt einen ausgewählten offenen Pfad fort, wenn man an seinem Ende beginnt; Ende nahe dem Start
  schließt.

## Akzeptanz

- Vitest für die Pfad-Operationen (Pfaddaten rein, Ergebnis-`d`); Playwright: Kreis mit Schere öffnen, zwei Linien verbinden.
