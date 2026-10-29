# Prompt 056: Hilfslinien aus dem Lineal und Icon-Raster

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 004 · Vorbild: Illustrator/Figma Guides; Apple/Material Keyline-Raster

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
