# Prompt 048: Bemaßung und Messen

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 040 · Vorbild: VectorCraft (`~/RustroverProjects/vectorcraft`, Marcs eigenes Projekt, MIT/Apache – Algorithmen dürfen mit Herkunftsvermerk übertragen werden), `crates/tools/src/dimension.rs`,
> `xform/measure.rs`

## Stand

- ✅ 29.10.2026: **Messen** (`measure.tool`, I): Ziehen zwischen zwei gefangenen Punkten zeigt Abstand, Winkel und
  Δx/Δy in der Statuszeile und am Zeiger; nichts im Dokument, Esc löscht die Messung, dann das Werkzeug.
  **Bemaßung** (`dimension.tool`, D): Kante überfahren und herausziehen = lineare Bemaßung, Ecke zweier Kanten =
  Winkel, Kreis = Radius (⇧ Durchmesser); ein Klick wählt, der nächste platziert; zwei Klicks auf Punkte messen
  zwischen ihnen. Jede Bemaßung ist ein `<g data-dimension="…" data-value="…">` mit Linien, Pfeilen und dem Wert in
  Dokument-Einheiten an der Einfügestelle von „Add“ (ein Undo-Schritt). `dimension.add { kind, points, at, r }` für
  die KI. Export: Häkchen „Bemaßungen“ (Standard aus, Argument `dimensions`); nicht in den Einstellungen gespeichert.
  Bewusst einfacher als VectorCraft: Bemaßungen sind nicht mit der Form verknüpft (ändern sich nicht mit).

## Umfang

- **Measure:** Ziehen zeigt Abstand, Winkel, dx/dy (nur Anzeige, nichts im Dokument).
- **Dimension:** Kante (linear), Ecke (Winkel), Kreis/Bogen (Radius/Durchmesser) überfahren und herausziehen;
  Bemaßungen als eigene Gruppe, die beim Export wählbar weggelassen wird.
- Punkte snappen wie 040.

## Akzeptanz

- Vitest für die Messwerte; Playwright: Kante bemaßen, Kreisradius ablesen.
