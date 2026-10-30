# Prompt 067: Einheitliche Kontextleiste für aktive Werkzeuge

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 061 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §3.3 (P1, Aufwand M)

## Ziel

Jedes aktive Werkzeug zeigt am oberen Canvas-Rand dieselbe Leiste: was aktiv ist, welche Optionen gelten und wie
man fertig wird.

## Ausgangslage (laut Analyse, zuerst bestätigen)

Vier konkurrierende Muster: Freehand-Optionen in der `CanvasToolbar` (mit *Done*), schwebende Pillen bei
Constraints und Live Fill (ohne *Done*), pinkes Banner beim Clip-Bearbeiten (mit *Done*), und über 15 Werkzeuge
(Pen, Curvature, Trim, Extend, Fillet, Chamfer, Shape Builder, Knife, Scissors, Smooth, Rotate, Scale, Dimension,
Measure …) nur mit einem Hinweis in der Statuszeile. Beim Fillet-Werkzeug ist der Radius vor dem Klick nicht
einstellbar; beim Zeichnen sieht man nicht, welche Farben das `StyleMemory` verwenden wird.

## Umfang

- **`ContextBar`** unter der Canvas-Toolbar, nur bei aktivem Werkzeug außer Auswahl (061):
  links Icon + Name, Mitte Optionen, rechts Modifier-Tipp (`⇧ 45°`, `⌥ löschen` …) und „Fertig (Esc)“.
- **Werkzeug-Beschreibung als Daten:** jedes Werkzeug liefert `{ id, name, icon, options: OptionSpec[], hints }`;
  `OptionSpec` nutzt die vorhandenen Editoren aus `shared/controls/` (NumberField, ColorField, SelectField,
  ToggleField). Jede Option ist über eine Aktion setzbar (`tool.option { tool, key, value }` oder die vorhandene
  Werkzeug-Aktion) – KI-fähig, keine Logik nur über Maus.
- **Optionen mindestens:** Zeichenwerkzeuge (Sketch, Formen, Pen, Curvature, Freehand): Fill/Stroke/Strichstärke
  aus dem `StyleMemory`, direkt änderbar; Freehand/Smooth: Glättung; Fillet/Chamfer: Radius/Abstand;
  Polygon/Stern: Ecken; Constraints: die Beziehungs- und Maß-Knöpfe aus der heutigen Pille; Live Fill: Farbe;
  Clip-Bearbeitung: Hinweis + Fertig.
- **Ablösen:** die Pillen, das Clip-Banner und die Freehand-Optionen in der Toolbar entfallen; die Statuszeile
  behält nur Koordinaten/Zoom und kurze Schritt-Hinweise.
- Tastatur: Leiste per `F6` (oder im Design festgelegt) erreichbar, Fokus kehrt danach auf den Canvas zurück.

## Akzeptanz

- Vitest: Spec je Werkzeug vollständig (Test über alle Werkzeuge im ToolStore), Option per Aktion setzen ändert
  dasselbe Signal wie die Leiste.
- Playwright: Fillet-Radius vor dem Klick auf 20 stellen → Verrundung mit 20; Rechteck-Werkzeug: Fill-Farbe in der
  Leiste ändern → neue Form hat sie; Fertig/Esc beenden jedes Werkzeug; Leiste per Tastatur bedienbar.
