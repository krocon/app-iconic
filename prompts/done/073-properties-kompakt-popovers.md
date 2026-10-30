# Prompt 073: Properties kompakt, Popovers statt Modale, einheitliche Live-Vorschau

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 062, 067 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §3.5 (Panel) und §2.5 (Live-Vorschau)

## Ziel

Kürzeres, verständlicheres Properties-Panel; geometrische Feineinstellungen ohne bildschirmfüllende Dialoge, alle
mit Live-Vorschau auf dem Canvas.

## Umfang

- **Paare nebeneinander:** `X`/`Y`, `B`/`H`, `RX`/`RY`, `CX`/`CY`, `X1`/`Y1` … in zwei Spalten, mit Ketten-Schloss
  für Proportionen, wo es Sinn ergibt. Schmales Panel: einspaltig (Breite aus `LayoutStore`).
- **Icon-Toggles statt Fachbegriff-Dropdowns:** Line Cap, Line Join, Fill Rule, Text Anchor als Segmented
  Controls mit kleinen Grafiken, Tooltip mit SVG-Begriff; als APG-Radiogroup. Neues generisches Control in
  `shared/controls/` (SegmentedField), Spec-gesteuert.
- **Nicht-modale Popovers** für Corners, Offset, Fillet, Transform, Pattern: neben dem Auslöser verankert,
  `role="dialog"` ohne `aria-modal`, Fokus hinein und zurück, `Esc` schließt, Canvas bleibt bedienbar – „Pick on
  Canvas“ ohne Schließen und Wiederöffnen. `DialogService` um Popovers erweitern oder eigenes Modul in
  `shared/dialog/`.
- **Live-Vorschau überall:** Corners bekommt Vorschau wie Offset/Fillet/Transform/Pattern; Optimize Path zeigt
  vorher/nachher als Kurven-Overlay auf dem Canvas (nicht nur Zahlentabelle). Vorschau nie als Undo-Schritt;
  Übernehmen = ein Schritt.

## Akzeptanz

- Vitest: Paar-Layout aus Specs, SegmentedField (Tastatur, mixed bei Mehrfachauswahl), Popover-Fokus.
- Playwright: Rechteck → Panel-Höhe deutlich kleiner (Messwert im Design festhalten); Corners-Popover offen,
  Radius ändern → Canvas zeigt Vorschau, Klick auf anderes Element im Canvas möglich; Optimize Path zeigt Overlay;
  Esc verwirft ohne Undo-Eintrag.
