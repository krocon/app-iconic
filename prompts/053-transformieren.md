# Prompt 053: Transformieren mit Zahlen und Bezugspunkt

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 007 · Vorbild: Illustrator „Rotate/Scale/Reflect Tool“ + „Transform Each“; Fusion „Move/Copy“

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
