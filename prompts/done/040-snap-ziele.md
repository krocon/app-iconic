# Prompt 040: Snap-Ziele wie Smart Guides

> Lies zuerst [000-arbeitsweise.md](../000-arbeitsweise.md). Braucht: 007, 019 · Vorbild: VectorCraft (`~/RustroverProjects/vectorcraft`, Marcs eigenes Projekt, MIT/Apache – Algorithmen dürfen mit Herkunftsvermerk übertragen werden),
> `crates/tools/src/guides/` (`targets.rs`, `snap.rs`)

## Ziel

Gezeichnete und gezogene Punkte landen genau auf dem, was schon da ist – nicht nur auf markierten Punkten. Seit
dem Align-Commit (`c4c4700`) richten sie sich an x/y der Magic-Punkte aus („align“); es fehlen die übrigen Ziele
der Smart Guides.

## Stand

- ✅ 29.10.2026 Schnittpunkte von Kanten und Kreisen (`intersections.ts`, Label „intersect“).
- ✅ 29.10.2026 Rest: Kurven (Ellipsen, Bézier, Ellipsenbögen, Kreise in ungleich skalierten Gruppen) als
  Parameter-Kurven, Schnittpunkte per Abtastung + Newton exakt (`outline-curves.ts`); Labels `anchor`/`center`
  an den Magic-Punkten; `smart-guides.ts`: Tangente/Senkrecht vom zuletzt gesetzten Punkt, Kontur („path“),
  Konstruktionswinkel 0/45/90/135° mit Gleiten auf `align`-Linien, Verlängerung gerader Segmente beim Ziehen eines
  Linienendes / Polygonpunkts. Vorrang wie VectorCraft. Ein Schalter „Smart Guides“ (View-Optionen, Menü,
  Einstellungen `canvas.smartGuides`) statt einem je Ziel; beim Verschieben ganzer Formen nur Punkte und `align`
  (wie VectorCraft – Konturen kosten bei 20 000 Formen zu viel).

## Umfang

- **Schnittpunkte („intersect“):** Wo sich zwei Formen kreuzen (Linie, Rechteck, Kreis, Ellipse, Polygon/Polyline,
  Pfad-Segmente inkl. Bögen und Béziers), wird der Schnittpunkt ein Snap-Punkt. Rechnung im Dokumentraum über die
  Browser-Matrizen (wie `magic-points`), Kurven als Polylinien abgetastet und nachgeschärft (VectorCraft `meeting`).
- **Auf der Kontur („path“):** Der nächste Punkt einer Kante/Kurve im Fangradius.
- **Labels** wie VectorCraft: `anchor`, `center`, `path`, `intersect`, `align` (übersetzt), Farbe Magenta.
- **Konstruktionswinkel:** vom letzten gesetzten Punkt aus Hilfslinien in 0°/45°/90° (Einstellung, Satz wie
  VectorCraft `DEFAULT_CONSTRUCTION_ANGLES`); der Punkt gleitet entlang und rastet an `align`-Linien ein („slide“).
- **Tangente / Senkrecht:** Eine Linie von einem Punkt aus landet dort, wo sie einen Kreis/eine Kurve berührt
  bzw. eine Kante rechtwinklig trifft (Winkelmarke wie VectorCraft `touch_guides`).
- **Verlängerung:** Ein gezogener Ankerpunkt bleibt auf der Verlängerung gerader Nachbarsegmente.
- Vorrang wie VectorCraft: Punkt (anchor/center/intersect) > Tangente/Senkrecht > Kontur > Konstruktion > align >
  Raster. Ziele einmal je Dokument-Revision sammeln (Budget 20 000).
- Schalter je Ziel im View-Options-Menü und in den Einstellungen (Smart Guides).

## Akzeptanz

- Vitest für alle Schnitt-Rechnungen (Linie×Linie, Linie×Kreis, Kreis×Kreis, Bogen, Bézier), Vorrang und Labels.
- Playwright: Rechteck und Kreis, die sich schneiden – eine Linie endet exakt im Schnittpunkt, bei Zoom 50/100/150 %
  und in einer gedrehten, skalierten Gruppe.
