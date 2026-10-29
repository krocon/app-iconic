# Prompt 059: Abhängigkeiten und treibende Maße

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 048, 050, 051 · Vorbild: Fusion 360 Sketch-Constraints; Solver wie planegcs/SolveSpace (Lizenz prüfen)

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
