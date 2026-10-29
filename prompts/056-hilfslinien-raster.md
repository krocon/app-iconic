# Prompt 056: Hilfslinien aus dem Lineal und Icon-Raster

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 004 · Vorbild: Illustrator/Figma Guides; Apple/Material Keyline-Raster

## Stand

- ✅ 29.10.2026: **Hilfslinien aus dem Lineal**: aus dem oberen Lineal eine waagerechte, aus dem linken eine senkrechte
  Hilfslinie ziehen (Vorschau, gefangen); losgelassen über dem Canvas wird sie eine Konstruktionslinie quer über den
  Canvas (`data-guide`, durchgezogen türkis gezeichnet) in der aktuellen Ebene – ein Undo-Schritt, im Dokument
  gespeichert, unsichtbar in der Datei, nicht im Export; Fangen wie jede Konstruktionslinie (Kontur, Schnittpunkte);
  auswählen, verschieben, löschen wie jede Form. `guide.add {axis, at}` für die KI. **Icon-Raster-Vorlagen**
  (View-Optionen, `view.guideTemplate.*`, `view.guideDivisions`): Apple (bisher), Material-Keylines (Kreis,
  Quadrat, Hoch-/Querformat, Rand), gleichmäßiges Raster n × n; in den Einstellungen gespeichert
  (`canvas.guideTemplate`, `canvas.guideDivisions`, Rust + TS).
- Offen: Hilfslinien zurück ins Lineal ziehen zum Löschen; Doppelklick zur Positionseingabe (heute: Properties).

## Ziel

Es gibt die festen Apple-Icon-Guides; eigene Hilfslinien und andere Raster fehlen.

## Umfang

- **Hilfslinien** aus dem Lineal ziehen (waagerecht/senkrecht), verschieben, löschen (zurück ins Lineal / Entf),
  Doppelklick: Position tippen; gespeichert im Dokument als Konstruktionslinien in einer eigenen Gruppe oder in
  einem Seiten-Datensatz (Entscheidung im Design, verlustfrei für `icon.json`). Fangziel `guide`.
- **Raster-Vorlagen** (View-Optionen): Apple-Icon-Raster (heute), Material Keylines (Kreis, Quadrat, Hoch-/Querformat),
  eigenes Raster (Teilung n × n, Abstand). Nur Anzeige + Fangen, nicht im Export.
- Hilfslinien sperren/ausblenden.

## Akzeptanz

- Playwright: Hilfslinie ziehen, Punkt rastet darauf, nach Speichern/Öffnen noch da; Material-Raster sichtbar.
