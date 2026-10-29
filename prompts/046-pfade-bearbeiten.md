# Prompt 046: Pfade bearbeiten – Punkte, Schere, Messer, Verbinden, Glätten

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 042 · Vorbild: VectorCraft (`~/RustroverProjects/vectorcraft`, Marcs eigenes Projekt, MIT/Apache – Algorithmen dürfen mit Herkunftsvermerk übertragen werden),
> `crates/tools/src/draw2/` (`anchor.rs`, `gesture.rs`), `cut.rs`

## Stand

- ✅ 29.10.2026: Werkzeuge `path.addAnchor` (+), `path.deleteAnchor` (−), `path.anchorPoint` (⇧C: Klick glatt ↔ Ecke,
  Ziehen = neue symmetrische Griffe), `path.scissors` (Klick auf Punkt oder Kontur: geschlossener Pfad öffnet sich,
  offener wird zwei Pfade), `path.smooth` und `path.eraser` (Pinselstrich), dazu `path.join` (⌘J: nächste offene
  Enden, gleiche Stelle wird ein Punkt; ein einzelner offener Pfad schließt sich) und `path.convert` („Convert to
  Path“) – im Seitenleisten-Untermenü „Edit Path“, Join/Convert im Menü Edit. Formen (rect, circle, ellipse, line,
  poly) werden beim ersten Eingriff ein `<path>` mit allen übrigen Attributen; jeder Eingriff ein Undo-Schritt.
  Zeichenstift: Auto Add/Delete auf dem ausgewählten Pfad (042). Reine Pfadlogik in `shared/geometry/pen/path-model.ts`.
- Verschoben: **Messer**, **Line/Rectangle Cut**, **Mirror & Cut** brauchen Flächen-Boolesche-Operationen → mit 047;
  Freehand-Fortsetzung offen (Freehand bleibt vorerst eigenständig).

## Umfang

- Ankerpunkt hinzufügen / löschen / umwandeln (Ecke ↔ glatt) als eigene Werkzeuge und Aktionen.
- **Schere** (Pfad an einem Punkt öffnen/teilen), **Messer** (Freihandschnitt durch Flächen), **Line Cut** /
  **Rectangle Cut** / **Mirror & Cut**, **Join** (offene Enden verbinden), **Smooth** (Abschnitt glätten),
  **Path Eraser**.
- Freehand (013) setzt einen ausgewählten offenen Pfad fort, wenn man an seinem Ende beginnt; Ende nahe dem Start
  schließt.

## Akzeptanz

- Vitest für die Pfad-Operationen (Pfaddaten rein, Ergebnis-`d`); Playwright: Kreis mit Schere öffnen, zwei Linien verbinden.
