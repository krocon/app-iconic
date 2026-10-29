# Prompt 057: Vorschau in kleinen Größen und Pixelraster

> Lies zuerst [000-arbeitsweise.md](../000-arbeitsweise.md). Braucht: 012 · Vorbild: Icon-Editoren (Icon Slate, Figma Pixel Preview)

## Stand

- ✅ 29.10.2026: **Vorschau in kleinen Größen** (View › Small Sizes Preview, `view.smallPreview`): unten rechts im Canvas
  das Icon in 16, 32, 64 und 128 px, gezeichnet aus demselben SVG wie der Export (Maske, Hell/Dunkel, Effekte der
  Ansicht), 250 ms nach jeder Änderung neu. **Pixelraster** (View › Pixel Grid, `view.pixelGrid.{off,16,32,64,128}`):
  die Zellen der Zielgröße auf dem Canvas (ab 4 px Zellgröße), Fangraster = Zellgröße (1024 / n), Ursprung 0;
  **Am Pixelraster ausrichten** (Menü Arrange, `arrange.alignToPixels`) schiebt die Box jedes ausgewählten Elements
  auf die nächste Zellkante (ohne Raster: 32 px). Beides für die Sitzung.

## Ziel

Ob ein Icon in 16/32/64 px lesbar bleibt, entscheidet sich beim Zeichnen – heute sieht man es erst im Export.

## Umfang

- **Mini-Vorschau** (Panel oder schwebendes Fenster): das Icon live in 16, 32, 64, 128 px (Maske, Hell/Dunkel),
  gerendert wie der Export, aktualisiert nach jeder Änderung (gedrosselt).
- **Pixelraster** (View-Option): Raster für eine gewählte Zielgröße (z. B. 32 px → 32 Zellen auf 1024); Fangen an
  Pixelkanten/-mitten; „An Pixel ausrichten“ für die Auswahl.

## Akzeptanz

- Playwright: Vorschau zeigt Änderung nach Hinzufügen eines Kreises; Pixelraster 32 rastet auf Vielfache von 32.
