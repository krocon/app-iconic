# Prompt 044: Weitere Formen – abgerundetes Rechteck, Stern, Spirale, Raster, Bogen

> Lies zuerst [000-arbeitsweise.md](../000-arbeitsweise.md). Braucht: 041 · Vorbild: VectorCraft (`~/RustroverProjects/vectorcraft`, Marcs eigenes Projekt, MIT/Apache – Algorithmen dürfen mit Herkunftsvermerk übertragen werden), `crates/tools/src/shape.rs`

## Stand

- ✅ 29.10.2026: Rounded Rectangle (`rx`/`ry`, ↑/↓ Radius in 2er-Schritten), Star (↑/↓ Zacken, Shift aufrecht, Alt
  gerade Schultern), Spiral (↑/↓ Viertelwindungen, Alt andersherum), Rectangular / Polar Grid (↑/↓ Teiler, ein
  `<path>`), Arc (Viertelellipse, Alt konkav) als Zieh-Werkzeuge mit Größendialog; Geometrie aus VectorCraft
  `shapes.rs` (`more-shapes.ts`). Bewusst anders: Strg/⌘ zum Festhalten des Stern-Innenradius fehlt (Alt = gerade
  Schultern genügt fürs Erste).

## Umfang

- **Rounded Rectangle** (`rx`/`ry`, ↑/↓ ändert den Radius beim Ziehen), **Star** (Zacken mit ↑/↓, Innenradius mit
  Strg/⌘ halten, Alt = gerade Schultern), **Spiral**, **Rectangular Grid**, **Polar Grid**, **Arc Tool**
  (Viertelbogen konvex/konkav).
- In die Untermenüs der Seitenleiste (`add-layout.ts`) einordnen; Maßfelder und Größendialog wie 041.

## Akzeptanz

- Vitest für jede Form-Geometrie; Playwright je Form ein Ziehen mit Modifikator.
