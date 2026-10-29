# Prompt 058: Direkt als Konstruktion zeichnen

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 049 · Vorbild: Fusion 360 Sketch-Palette „Construction“

## Stand

- ✅ 29.10.2026: Schalter **Konstruktion** in der Canvas-Werkzeugleiste und `sketch.toggleConstructionMode` (⇧X): solange
  an, wird jede gezeichnete Form sofort Konstruktionsgeometrie (`data-construction`, `opacity="0"`, eigene
  Deckkraft gemerkt) – Sketch-Werkzeuge, Zieh-Formen, Zeichenstift, Kurvenzeichner, Freihand und Add-Formen; nicht
  Hilfslinien, Bemaßungen, Bilder, Text, Symbole und Importe. Zentral in `AddService.insertBuilt`
  (`ConstructionMode`). Die Stil-Erinnerung (019) übernimmt Konstruktionsgeometrie nicht (sonst würde die nächste
  normale Form unsichtbar). Pro Fenster, nicht gespeichert.

## Ziel

Heute: zeichnen, dann X. In Fusion schaltet man vorher um.

## Umfang

- Umschalter „Konstruktion“ in der Werkzeugleiste der Zeichenwerkzeuge (Sketch, Drag-Formen, Pen, Kurven,
  Freihand) und Aktion `sketch.toggleConstructionMode` (⇧X); solange an, sind neue Formen Konstruktion.
- Statusanzeige im Hinweis; bleibt pro Fenster bis zum Ausschalten.

## Akzeptanz

- Playwright: Modus an, Linie zeichnen → `data-construction`; aus → normale Linie.
