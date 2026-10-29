# Prompt 059: Abhängigkeiten und treibende Maße

> Lies zuerst [000-arbeitsweise.md](../000-arbeitsweise.md). Braucht: 048, 050, 051 · Vorbild: Fusion 360 Sketch-Constraints; Solver wie planegcs/SolveSpace (Lizenz prüfen)

## Stand

- ✅ 29.10.2026: Solver (`shared/geometry/constraints/`: solver, sketch-model, constraints – rein, Vitest), Datenmodell
  (`features/constraints/constraint-storage`: `<metadata data-ai-constraints>` + `data-cid`, Export entfernt beides),
  ConstraintService (hinzufügen/entfernen/Maß ändern/anwenden/Punkt ziehen, je ein Undo-Schritt, Widersprüche werden
  abgelehnt), Werkzeug „Abhängigkeiten“ (K, Leiste mit 11 Beziehungen und 5 Maßen, Punkte/Linien/Kreise wählen,
  Punkte ziehen), Overlay (Symbole je Beziehung, treibende Maße mit Wert zum Anklicken und Ändern), Aktionen
  `constraint.*` und `view.constraints`. Bewusst anders: Beziehungen nur zwischen Linien, Rechtecken, Kreisen und
  Polygonen (keine Pfade/Bögen); treibende Maße sind Teil des Overlays, nicht die Bemaßungs-Elemente aus 048; freie
  Änderungen (Griffe, Properties) lösen nicht automatisch – „Abhängigkeiten anwenden“ stellt sie wieder her; Kopien
  tragen dieselbe `data-cid` (das erste Element gilt).

## Ziel

Parametrisch konstruieren: Maße und Beziehungen bleiben erhalten, wenn man etwas ändert. Bemaßungen (048) sind
bisher nur Anmerkungen.

## Umfang

- **Beziehungen:** horizontal, vertikal, parallel, senkrecht, tangential, gleich (Länge/Radius), koinzident
  (Punkt auf Punkt/Kurve), konzentrisch, Mittelpunkt, symmetrisch zu Linie, fest. Anzeige als kleine Symbole.
- **Treibende Maße:** Bemaßungen verknüpft mit Elementen; Wert ändern → Geometrie folgt; Ziehen eines Punkts →
  Solver hält die Beziehungen.
- Speicherung: Beziehungen in einem eigenen Metadaten-Element des Assets (verlustfrei, beim Export entfernt).
- Solver: numerisch (Newton/Levenberg-Marquardt) in TypeScript oder Rust; Entscheidung + Abhängigkeit begründen.
- Großer Prompt: in Teilschritte gliedern (Datenmodell → Solver → Werkzeuge → Anzeige).

## Akzeptanz

- Vitest: Solver-Fälle (Rechteck mit Maßen, Tangente Kreis/Linie). Playwright: Maß ändern, Rechteck folgt.
