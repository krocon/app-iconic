# Prompt 045: Live Corners – Ecken runden und fasen

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 007 · Vorbild: VectorCraft (`~/RustroverProjects/vectorcraft`, Marcs eigenes Projekt, MIT/Apache – Algorithmen dürfen mit Herkunftsvermerk übertragen werden), `crates/tools/src/corners.rs`

## Umfang

- Griff innen an jeder Ecke ausgewählter Rechtecke, Polygone und Pfade (Ecken = nicht glatte Punkte); Ziehen
  rundet alle sichtbaren Ecken zusammen, Alt-Klick wechselt rund / invers rund / Fase, Doppelklick öffnet einen
  Ecken-Dialog. Radius begrenzt durch die Nachbarkanten.
- Rechteck: `rx`/`ry` solange alle gleich, sonst Umwandlung in `<path>` (nachfragen).
- Griffe ausblenden, wenn die Kante auf dem Bildschirm zu kurz ist.

## Akzeptanz

- Vitest für die Eckengeometrie; Playwright: Rechteck-Ecken runden, Polygon fasen, Undo = ein Schritt.
