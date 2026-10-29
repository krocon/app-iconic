# Prompt 053: Transformieren mit Zahlen und Bezugspunkt

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 007 · Vorbild: Illustrator „Rotate/Scale/Reflect Tool“ + „Transform Each“; Fusion „Move/Copy“

## Stand

- ✅ 29.10.2026: Werkzeuge **Drehen** (⇧R), **Skalieren** (⇧S), **Spiegeln** (⇧O) (Menü Arrange): der Bezugspunkt
  steht in der Mitte der Auswahl, ein Klick setzt ihn (gefangen); Ziehen dreht/skaliert/spiegelt live darum,
  ⇧ rastet (15°, proportional, 45°-Achse), ⌥ beim Loslassen = Kopie; Statuszeile zeigt Winkel/Faktor; ein
  Undo-Schritt. Dialog **Transformieren…** (⌘⇧M): Verschieben X/Y, Drehen, Skalieren %, Spiegeln H/V, Bezugspunkt
  im 9er-Raster, „Einzeln transformieren“, „Kopie“; Vorschau live. Spiegeln des Originals geht jetzt (Dialog,
  Werkzeug). Die Änderung steht im Raum des Elternelements vor dem eigenen `transform` (mit einer führenden
  Matrix verschmolzen) – auch in gedrehten Gruppen richtig. `transform.apply {dx, dy, rotate, sx, sy, reflect,
  pivot, each, copy}` für die KI.

## Ziel

Drehen, Skalieren und Spiegeln geht heute nur über die Griffe der Auswahl um deren Mitte. Zum Konstruieren
braucht man einen frei wählbaren Bezugspunkt und exakte Werte.

## Umfang

- **Werkzeuge** `transform.rotate` (R+⇧?), `transform.scale`, `transform.reflect`: erster Klick setzt den
  Bezugspunkt (gefangen; ohne Klick: Mitte der Auswahl), Ziehen dreht/skaliert/spiegelt, Maßfeld zeigt Winkel/
  Faktor; ⇧ rastet 15°/proportional, ⌥ beim Loslassen = Kopie.
- **Dialog „Transformieren…“** (⌘⇧M): Verschieben dx/dy, Drehen °, Skalieren % (x/y), Spiegeln H/V, Bezugspunkt
  (9er-Raster der Auswahl oder Koordinate), „Kopie“, „Jedes einzeln“ (um die eigene Mitte); Live-Vorschau.
- Spiegeln des Originals (heute nur als Kopie, 049).
- Matrix vor das eigene `transform` (wie 049), Formen bleiben Formen.

## Akzeptanz

- Vitest: Matrizen um Bezugspunkt, „jedes einzeln“.
- Playwright: Rechteck um eine Ecke um 30° drehen (Zoom 50/150 %), Kopie mit ⌥, Spiegeln im Dialog.
