# Prompt 063: Einheitliche Z-Reihenfolge im Ebenenbaum („oben = vorn“)

> Lies zuerst [000-arbeitsweise.md](../000-arbeitsweise.md). Braucht: 006 · Quelle:
> [Analyse 30.10.2026](../2026.10.30%20-%20analyse.md) §2.2 (P0, Aufwand S–M) · Offene Frage 006/1
> („SVG-Nodes umgekehrt sortieren?“) – hiermit mit „ja“ entschieden, sofern Marc nicht widerspricht.

## Stand

- ✅ 30.10.2026: SVG-Knoten im Baum vorderste zuerst (DOM unverändert), `domPosition` für Ziehen, Move Up/Down/Into
  im Sinn der Anzeige, `get_tree` mit `z`; Frage 006/1 entschieden. Design:
  [063-z-reihenfolge-baum.design.md](063-z-reihenfolge-baum.design.md).

## Ziel

Im ganzen Baum gilt dieselbe Regel wie in Icon Composer, Figma und Photoshop: oben steht, was vorne liegt.

## Ausgangslage (laut Analyse, zuerst bestätigen)

- `hierarchy-model.ts`: Gruppen und Layer stehen vorderste zuerst, die SVG-Kinder eines Layers aber in
  DOM-Reihenfolge (erstes Kind = hinten). `Bring to Front` (`⇧⌘↑`) schiebt ein Element im Baum nach **unten**;
  Ziehen nach oben legt es auf dem Canvas nach hinten.

## Umfang

- SVG-Kinder im Baum umgekehrt anzeigen (auf jeder Ebene, auch in `<g>`, `<defs>` bleibt wie es ist bzw. im Design
  entscheiden); das SVG-DOM bleibt unverändert.
- Alle Index-Übersetzungen an einer Stelle (reine Funktion): Drag & Drop (`tree-drag`), Move Up/Down/Into/Out,
  Tastaturnavigation, Folge-Auswahl nach Löschen (`follow-up`), Einfügeort (`insert-target`), Paste.
- Menütexte prüfen: „Move Up“ heißt jetzt „nach vorn“ – Benennung und Kürzel konsistent mit Arrange.
- KI-Lesesicht (`mcp-read`): Reihenfolge im Baum-Dump dokumentieren (am besten explizit `z`-Index je Kind ausgeben),
  damit Modelle nicht raten; `docs/mcp.md` ergänzen.
- `docs/open-questions.md`: Frage 006/1 als entschieden markieren.

## Akzeptanz

- Vitest: Abbildung Baum-Index ↔ DOM-Index (hin und zurück, verschachtelt), Drop-Ziele, Move Up/Down.
- Playwright: `Bring to Front` → Element steht im Baum ganz oben und liegt auf dem Canvas vorne; Element im Baum
  nach oben ziehen → liegt vorne; Undo stellt die alte Reihenfolge her.
