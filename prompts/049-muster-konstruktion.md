# Prompt 049: Konstruktionslinien, Muster, Spiegeln, Klonen

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 040 · Vorbild: Fusion 360 (Sketch: Construction,
> Circular Pattern, Rectangular Pattern, Mirror) – Marc, 29.10.2026

## Stand

- ✅ 29.10.2026: **Konstruktionslinien** (`edit.toggleConstruction`, X, Menü Edit): Formen bekommen
  `data-construction` (Wert = eigene Deckkraft für den Rückweg) und `opacity="0"` – im SVG unsichtbar, im Canvas
  gestrichelt blau (Token `--ai-construction`), weiterhin Fangpunkte; der Export lässt sie weg.
  **Kreisförmiges Muster** (`pattern.circular`): Mittelpunkt auf dem Canvas klicken (gefangen, Enter = Mitte der
  Auswahl), Dialog mit Anzahl und Gesamtwinkel (360° = gleichmäßig, sonst vom ersten bis zum letzten), Vorschau live.
  **Rechteckiges Muster** (`pattern.rectangular`): Spalten, Zeilen, Abstand X/Y, Vorschau live.
  **Spiegeln** (`pattern.mirror`): zwei Punkte der Spiegelachse klicken, die Kopie entsteht, das Original bleibt.
  **Klonen (verknüpft)** (`edit.cloneLinked`, ⌘⌥D): `<use href="#id">` hinter dem Original, folgt jeder Änderung.
  Kopien liegen direkt hinter dem Original mit der Platzierung vor dem eigenen `transform` (im Raum des
  Elternelements, also auch in gedrehten Gruppen richtig), ids eindeutig; jede Aktion ein Undo-Schritt, die Kopien
  sind danach ausgewählt. Alle Aktionen nehmen Argumente für die KI (`count/angle/center`, `columns/rows/dx/dy`,
  `a/b`). Seitenleiste: Gruppe „Muster & Spiegeln“.
- Offen: Muster entlang eines Pfads; Kopien sind nicht mit dem Original verknüpft (außer dem Klon); neue Formen
  direkt als Konstruktion zeichnen (jetzt: zeichnen, dann X).
