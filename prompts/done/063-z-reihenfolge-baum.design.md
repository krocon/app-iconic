# Design 063: Einheitliche Z-Reihenfolge im Ebenenbaum

> Prompt: [063-z-reihenfolge-baum.md](063-z-reihenfolge-baum.md) · Stand: 30.10.2026

## Befund (geprüft)

`buildTree` listete Gruppen/Layer vorderste zuerst, SVG-Kinder aber in DOM-Reihenfolge (erstes Kind = hinten).
Bring to Front schob einen Knoten in der Liste nach unten, Ziehen nach oben legte ihn nach hinten.

## Entscheidungen

- **E1 Nur die Anzeige dreht sich:** `buildTree` kehrt die Kinder jedes Knotens und die gemalten Kinder eines
  Asset-Roots um; der Ordner „Definitions“ bleibt oben und in DOM-Reihenfolge. Das SVG-DOM, die Commands
  (`ReorderNode`, `MoveNode` …) und ihr JSON bleiben im DOM-Sinn – die KI und gespeicherte Undo-Schritte sind nicht
  betroffen.
- **E2 Eine Übersetzungsstelle:** `domPosition(target, position)` – auf Knoten-Zeilen heißt „vor“ in der Liste
  „nach“ im DOM und umgekehrt; „into“ hängt hinten an (= vorn, oben in der Liste, wie Figma). Benutzt von `allowed`
  und `drop` des Baums. Folge-Auswahl, Bereichsauswahl und Tastaturnavigation arbeiten auf den Zeilen und folgen
  damit von selbst.
- **E3 Move Up/Down/Into/Out:** Up = nach vorn (hinter das nächste DOM-Geschwister), Down = nach hinten, Into = in
  den Container direkt darüber in der Liste (= nächstes DOM-Geschwister), Out = vor den Elternknoten (darüber in der
  Liste). Namen und Kürzel bleiben, die Bedeutung „hoch = vorn“ passt jetzt zu Arrange.
- **E4 KI:** `get_tree` liefert die Zeilen wie das Panel und je Knoten `z` (Index unter den DOM-Geschwistern, 0 =
  hinten); Beschreibung des Tools und `docs/mcp.md` ergänzt, Schnappschuss neu.
- Offene Frage 006/1 damit entschieden.

## Tests

- Vitest: `hierarchy-model.spec` (Reihenfolge, `z`, `domPosition`, Flatten/Positionen), `edit-operations.spec`
  (Move Up/Down/Into/Out im neuen Sinn, Undo), `hierarchy-tree.spec` (APG-Positionen, Bereichsauswahl, Tastatur,
  Folge-Auswahl nach Löschen).
- Playwright `hierarchy.spec`: Tastaturweg angepasst (Gruppe vor Rect, Alt+↑ = nach vorn), neu: Bring to Front →
  oben in der Liste und `z` im `get_tree`, Undo; Ziehen über eine Zeile → vorn, unter eine Zeile → dahinter.
  `lock.spec`: Schloss-Locator unabhängig von der Reihenfolge.
