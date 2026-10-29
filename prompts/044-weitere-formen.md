# Prompt 044: Weitere Formen – abgerundetes Rechteck, Stern, Spirale, Raster, Bogen

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 041 · Vorbild: VectorCraft (`~/RustroverProjects/vectorcraft`, Marcs eigenes Projekt, MIT/Apache – Algorithmen dürfen mit Herkunftsvermerk übertragen werden), `crates/tools/src/shape.rs`

## Umfang

- **Rounded Rectangle** (`rx`/`ry`, ↑/↓ ändert den Radius beim Ziehen), **Star** (Zacken mit ↑/↓, Innenradius mit
  Strg/⌘ halten, Alt = gerade Schultern), **Spiral**, **Rectangular Grid**, **Polar Grid**, **Arc Tool**
  (Viertelbogen konvex/konkav).
- In die Untermenüs der Seitenleiste (`add-layout.ts`) einordnen; Maßfelder und Größendialog wie 041.

## Akzeptanz

- Vitest für jede Form-Geometrie; Playwright je Form ein Ziehen mit Modifikator.
