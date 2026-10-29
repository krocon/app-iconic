# Prompt 045: Live Corners – Ecken runden und fasen

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 007 · Vorbild: VectorCraft (`~/RustroverProjects/vectorcraft`, Marcs eigenes Projekt, MIT/Apache – Algorithmen dürfen mit Herkunftsvermerk übertragen werden), `crates/tools/src/corners.rs`

## Stand

- ✅ 29.10.2026: Widgets an den Ecken des einen ausgewählten Rechtecks, Polygons, Polylinienzugs oder geraden Pfads
  (`CornerOverlay`); Ziehen rundet alle Ecken zusammen (Geste = ein Undo-Schritt „Round Corners“), Alt-Klick
  rund → invers → Fase, Doppelklick „Ecken…“ (`corners.set { radius, kind }`, auch im Menü Edit und für die KI).
  Rechteck bleibt `<rect rx ry>` solange rund, sonst wird es – wie Polygone – ein `<path>`; die scharfen Punkte bleiben
  in `data-ai-corners` (nur solange das Dokument offen ist, wie alle `data-ai-*` nicht gespeichert). Bewusst anders:
  ohne Rückfrage (ein Undo-Schritt macht es rückgängig); gekrümmte Seiten bekommen keine Widgets (VectorCraft kürzt sie).

## Umfang

- Griff innen an jeder Ecke ausgewählter Rechtecke, Polygone und Pfade (Ecken = nicht glatte Punkte); Ziehen
  rundet alle sichtbaren Ecken zusammen, Alt-Klick wechselt rund / invers rund / Fase, Doppelklick öffnet einen
  Ecken-Dialog. Radius begrenzt durch die Nachbarkanten.
- Rechteck: `rx`/`ry` solange alle gleich, sonst Umwandlung in `<path>` (nachfragen).
- Griffe ausblenden, wenn die Kante auf dem Bildschirm zu kurz ist.

## Akzeptanz

- Vitest für die Eckengeometrie; Playwright: Rechteck-Ecken runden, Polygon fasen, Undo = ein Schritt.
