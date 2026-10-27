# Prompt 019: Zeichenwerkzeuge wie in Fusion (Line, Rectangle, Circle, Arc) und Stil-Gedächtnis

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 007, 008, 009, 013, 015 · Auftrag von Marc,
> 27.10.2026 (Screenshots des Fusion-Menüs „Create“: Rectangle ▸, Circle ▸, Arc ▸)

## Ziel

Formen werden wie in Autodesk Fusion **gezeichnet** statt nur in der Mitte eingefügt – mit Klicks auf der
Zeichenfläche und Maßen, die man währenddessen eintippt (Länge, Winkel, Breite, Höhe, Durchmesser, Radius …).
Neue Formen sind standardmäßig eine dünne, ungefüllte Linie, und jede Form übernimmt den zuletzt benutzten Stil
ihres Typs.

## Umfang

- **Line**: Line (Start, Ende; Länge, Winkel), Midpoint Line (Mitte, Ende; Länge, Winkel).
- **Rectangle ▸** 2-Point Rectangle (Ecke, Ecke; Breite, Höhe), 3-Point Rectangle (Kante mit Länge und Winkel,
  dann Höhe), Center Rectangle (Mitte, Ecke; Breite, Höhe).
- **Circle ▸** Center Diameter Circle (Mitte, Durchmesser), 2-Point Circle (Durchmesser-Enden), 3-Point Circle,
  2-Tangent Circle (zwei Bezüge, dann Durchmesser oder Punkt), 3-Tangent Circle (drei Bezüge).
- **Arc ▸** 3-Point Arc (Start, Ende, Punkt auf dem Bogen; Radius), Center Point Arc (Mitte, Start mit Radius und
  Startwinkel, Ende mit Bogenwinkel), Tangent Arc (am Ende einer Linie/eines Bogens tangential weiter).
- **Tangenten-Bezüge** (Marc: „Kanten + Kreise“): gerade Kanten (Linien, Rechteck-/Polygon-/Polylinien-Kanten,
  gerade Pfadsegmente) und Kreise (Kreise, Ellipsen mit rx = ry, Kreisbögen in Pfaden).
- **Maßeingabe** wie Fusion: Felder am Cursor, Tab wechselt, getippte Werte sind fest, Enter setzt den Punkt,
  Esc bricht die Form ab, ein zweites Esc beendet das Werkzeug. Grid-/Magic-Snap gilt für jeden Punkt.
- **Stil-Gedächtnis je Formtyp** (Marc): Stroke, Fill, Farben, Breite, Deckkraft, Linienenden … der zuletzt
  gezeichneten oder geänderten Form desselben Typs; dauerhaft in `settings.json`. Default: kein Fill, Stroke
  schwarz, Breite 1.
- Jede Funktion ist eine Aktion mit serialisierbaren Argumenten (KI-Regel): dieselben Klicks als `points`, Maße
  als `values`.

## Akzeptanzkriterien

- Jedes Werkzeug zeichnet mit der Maus eine Form, ein ⌘Z entfernt sie wieder; das Werkzeug bleibt aktiv.
- Getippte Maße stimmen exakt (z. B. 3-Point Rectangle 200 × 100 bei 30°), auch bei Zoom 50/100/150 % und in
  transformierten Gruppen.
- 2-/3-Tangent Circle berühren ihre Bezüge (Abstand Mittelpunkt–Bezug = Radius auf 1e-6).
- Eine Form übernimmt Stroke/Fill der zuletzt geänderten Form ihres Typs, auch nach einem Neustart.
