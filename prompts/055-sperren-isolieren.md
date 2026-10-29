# Prompt 055: Sperren und Isolieren

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 006, 007 · Vorbild: Illustrator „Lock“/„Isolation Mode“

## Stand

- ✅ 29.10.2026: **Sperren** (`edit.toggleLock`, ⌘L, Schloss im Ebenenbaum, Menü Edit): gesperrte Elemente (und alles in
  einer gesperrten Gruppe) sind per Klick und Rahmen nicht auswählbar, bleiben aber Fangpunkte; `data-locked` bleibt
  in der Datei; Sperren nimmt sie aus der Auswahl; **Alle entsperren** (⌘⌥L). **Isolieren** (`edit.isolate`, auch
  Doppelklick in eine Gruppe): die Gruppe wird Kontext, alles daneben im Canvas auf 25 % gedimmt (Regeln im Shadow
  Root der Ebenen, das Dokument ändert sich nicht); erneut, Esc oder Klick daneben verlässt. **Konstruktionslinien
  ein/aus** (View-Menü, `view.constructionLines`) – für die Sitzung, nicht in den Einstellungen.

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
