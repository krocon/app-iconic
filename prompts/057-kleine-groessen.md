# Prompt 057: Vorschau in kleinen Größen und Pixelraster

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 012 · Vorbild: Icon-Editoren (Icon Slate, Figma Pixel Preview)

## Ziel

Ob ein Icon in 16/32/64 px lesbar bleibt, entscheidet sich beim Zeichnen – heute sieht man es erst im Export.

## Umfang

- **Mini-Vorschau** (Panel oder schwebendes Fenster): das Icon live in 16, 32, 64, 128 px (Maske, Hell/Dunkel),
  gerendert wie der Export, aktualisiert nach jeder Änderung (gedrosselt).
- **Pixelraster** (View-Option): Raster für eine gewählte Zielgröße (z. B. 32 px → 32 Zellen auf 1024); Fangen an
  Pixelkanten/-mitten; „An Pixel ausrichten“ für die Auswahl.

## Akzeptanz

- Playwright: Vorschau zeigt Änderung nach Hinzufügen eines Kreises; Pixelraster 32 rastet auf Vielfache von 32.
