# Prompt 043: Curvature-Werkzeug

> Lies zuerst [000-arbeitsweise.md](../000-arbeitsweise.md). Braucht: 042 · Vorbild: VectorCraft (`~/RustroverProjects/vectorcraft`, Marcs eigenes Projekt, MIT/Apache – Algorithmen dürfen mit Herkunftsvermerk übertragen werden),
> `crates/tools/src/draw2/curvature.rs`, `draw2.rs` (`arc_handle`, Griffe glatter Punkte)

## Stand

- ✅ 29.10.2026: `curvature.tool` (Shift+`, Untermenü Path) mit der Regel aus VectorCraft (`curvature.ts`:
  `smoothHandles`, `arcHandle`, `endHandle`, `curvatureSpline`), Zeichnen (Alt-Klick/Doppelklick Ecke ↔ glatt,
  erster Punkt schließt, Rücktaste, Enter/Esc), Bearbeiten des ausgewählten Pfads mit einem Teilpfad (Punkt ziehen –
  nur die Nachbarn krümmen neu –, Punkt auf dem Pfad ohne Formänderung einfügen, Ecke ↔ glatt, entfernen; je ein
  Undo-Schritt „Edit Path“), `curvature.tool { points, corners, closed }` für die KI.

## Umfang

- Jeder Klick setzt einen Punkt, die Kurve läuft glatt durch alle (Griffe entlang des Kreises durch drei Punkte,
  enge Kehren unter 30° werden spitz). Alt-Klick/Doppelklick = Ecke ↔ glatt, Ziehen verschiebt einen Punkt,
  Klick auf den ersten schließt, Backspace löscht den letzten, Esc/Enter beendet; Gummiband-Vorschau.
- Bearbeitet auch vorhandene Pfade: Klick auf ein Segment fügt einen glatten Punkt ohne Formänderung ein, Ziehen
  krümmt nur die zwei Nachbarsegmente.

## Akzeptanz

- Vitest für die Griff-Berechnung (Herkunftsvermerk); Playwright: Welle aus vier Klicks, Ecke umschalten.
