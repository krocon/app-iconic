# Prompt 055: Sperren und Isolieren

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 006, 007 · Vorbild: Illustrator „Lock“/„Isolation Mode“

## Ziel

Hintergrund, Konstruktionsgeometrie und fertige Teile stören beim Zeichnen: man trifft sie beim Klicken und
Rahmen-Auswählen.

## Umfang

- **Sperren** (`edit.toggleLock`, ⌘2-ähnlich, Schloss im Ebenenbaum): gesperrte Elemente sind nicht treffbar und
  nicht im Auswahlrahmen, bleiben Fangpunkte; Attribut `data-locked` (bleibt in der Datei, ohne Wirkung auf die
  Darstellung). „Alle entsperren“.
- **Isolieren** (Doppelklick auf eine Gruppe / `edit.isolate`): nur der Inhalt ist bearbeitbar, der Rest gedimmt;
  Esc oder Klick daneben verlässt. Fortsetzung des Clip-Bearbeitungsmodus (014) als allgemeiner Kontext.
- **Konstruktion ausblenden** (View-Option): Konstruktionslinien ein/aus.

## Akzeptanz

- Playwright: gesperrtes Rechteck nicht wählbar, aber Fangpunkt; Gruppe isolieren, Rahmen trifft nur Inhalt.
