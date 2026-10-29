# Prompt 060: Flächen füllen (live)

> Lies zuerst [000-arbeitsweise.md](../000-arbeitsweise.md). Braucht: 047, 050 · Vorbild: Illustrator „Interaktiv
> malen“ (Live Paint), Fusion-Skizzenprofile · Wunsch Marc, 29.10.2026: „durch Überlagerung entstehende Flächen
> einfärben“ – live.

## Stand

- ✅ 29.10.2026: `shared/geometry/pathops/faces.ts` (rein: Anordnung aller Umrisse – offen und geschlossen –, an
  jedem Schnitt geteilt, lose Enden entfernt, Flächen über die Winkelreihenfolge an den Knoten verfolgt; kleinste
  Fläche um einen Punkt, Inseln als Löcher), `UndoService.setFollower` (abgeleitete Inhalte im selben Undo-Schritt,
  auch in Gesten), `features/live-fill/` (LiveFillService als Follower, LiveFillTool F, Overlay mit Vorschau und
  Farbwahl, Aktionen `fill.*`). Füllung = `<path data-live-fill='{"seeds":[…]}'>` unter den gemalten Elementen;
  Merkpunkte im Raum des Pfads, wandern bei jeder Neuberechnung in die Fläche mit. Schließt sich eine Fläche nicht
  mehr, behält die Füllung ihre letzte Form. Export: Attribut weg, Pfad bleibt.

## Ziel

In jede Fläche klicken können, die Linien, Bögen und Kreise umschließen – auch wenn keine einzelne Form geschlossen
ist –, und die Füllung folgt, wenn die Konstruktion sich ändert.

## Umfang

- Werkzeug „Füllen“ (F): Zeigen hebt die Fläche hervor, Klick füllt (oder färbt eine vorhandene Füllung um), Ziehen
  über mehrere Flächen füllt sie als eine, Alt + Klick entfernt.
- Begrenzungen: alle gemalten Umrisse eines Assets (auch Konstruktionslinien), nicht Füllungen, Bemaßungen,
  Hilfslinien.
- Live: nach jeder Änderung neu berechnet, im selben Undo-Schritt (Follower im UndoService).
- Aktionen: `fill.tool`, `fill.at { x, y, color? }`, `fill.across { points, color? }`, `fill.remove { x, y }`,
  `fill.color { color }`, `fill.detach`.

## Akzeptanz

- Vitest: Flächen eines Dreiecks aus offenen Linien, Linse zweier Kreise, Kreis mit Schnittlinie, Insel als Loch;
  Follower im UndoService (Schritt, Geste, Undo/Redo).
- Playwright: Klick füllt das Dreieck, Linie verschieben → Füllung folgt, Undo/Redo; Alt + Klick, KI-Farbe, Lösen.
