# Prompt 058: Direkt als Konstruktion zeichnen

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 049 · Vorbild: Fusion 360 Sketch-Palette „Construction“

## Ziel

Heute: zeichnen, dann X. In Fusion schaltet man vorher um.

## Umfang

- Umschalter „Konstruktion“ in der Werkzeugleiste der Zeichenwerkzeuge (Sketch, Drag-Formen, Pen, Kurven,
  Freihand) und Aktion `sketch.toggleConstructionMode` (⇧X); solange an, sind neue Formen Konstruktion.
- Statusanzeige im Hinweis; bleibt pro Fenster bis zum Ausschalten.

## Akzeptanz

- Playwright: Modus an, Linie zeichnen → `data-construction`; aus → normale Linie.
