# Prompt 048: Bemaßung und Messen

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 040 · Vorbild: VectorCraft (`~/RustroverProjects/vectorcraft`, Marcs eigenes Projekt, MIT/Apache – Algorithmen dürfen mit Herkunftsvermerk übertragen werden), `crates/tools/src/dimension.rs`,
> `xform/measure.rs`

## Umfang

- **Measure:** Ziehen zeigt Abstand, Winkel, dx/dy (nur Anzeige, nichts im Dokument).
- **Dimension:** Kante (linear), Ecke (Winkel), Kreis/Bogen (Radius/Durchmesser) überfahren und herausziehen;
  Bemaßungen als eigene Gruppe, die beim Export wählbar weggelassen wird.
- Punkte snappen wie 040.

## Akzeptanz

- Vitest für die Messwerte; Playwright: Kante bemaßen, Kreisradius ablesen.
