# Design 066: Hilfslinien, Bemaßungen und Live-Füllungen im Alltag

> Prompt: [066-hilfslinien-fuellungen-alltag.md](066-hilfslinien-fuellungen-alltag.md) · Stand: 30.10.2026

## Befunde (bestätigt)

Hilfslinien sind `<line data-guide data-construction opacity="0">` im Asset und wurden von ⌘A erfasst; der Baum zeigte
`line`, `g · 2`, `path`; das Panel sagte nichts über Live-Füllungen; offene Flächen blieben stumm.

## Entscheidungen

- **E1 Sperren statt eigener Schutzregel:** neue Hilfslinien tragen `data-locked` (055) – damit kein Treffer, keine
  Rahmenauswahl, nie Ziel eines Werkzeugs (064), Schloss im Baum. `guides.lock` (View-Menü) sperrt/entsperrt alle
  vorhandenen in einem Undo-Schritt und legt fest, wie neue entstehen (`checked` = alle gesperrt, ohne Hilfslinien die
  Vorgabe, Standard an). Gesperrte verlassen die Auswahl. `guides.clear` entfernt alle (Undo „Clear Guides“).
  `guides.show` entfällt: `view.constructionLines` (055) blendet Hilfslinien bereits aus.
- **E2 Alles auswählen** lässt gesperrte Knoten aus (wie Illustrator, wie Klick und Rahmen).
- **E3 Rollen im Baum:** `nodeRole(el)` (guide, dimension, fill, construction) → `TreeNode.role`, Label „Guide y 300“,
  „Dimension 48“, „Construction line“, „Live fill“ (eine `id` hat Vorrang), eigene Icons; Texte EN/DE.
- **E4 Live-Füllung:** `LiveFillService.stale` (Laufzeit, `asset:id`): gefüllt, wenn der Follower eine Fläche nicht
  mehr schließen kann. Baum: Warnung „offen – behält die letzte Form“; Panel: Hinweis „berechnet“, Warnung, „Füllung
  lösen“ (`fill.detach`), `d` schreibgeschützt (`PanelRow.editable`); Werkzeug F: „⚠ offene Fläche“ in der Leiste.
  Vorher unbekannt (erst nach der ersten Änderung).

## Tests

- Vitest: `hierarchy-model.spec` (Labels, Rolle, Icon, Warnung), `hierarchy-tree.spec` (Alles auswählen ohne
  gesperrte).
- Playwright: `guides.spec` (gesperrt: ⌘A + Verschieben lassen sie liegen, Label im Baum; entsperrt: ⌘A nimmt sie;
  Entfernen + Undo), `live-fill.spec` (Label, offene Fläche: Form bleibt, Warnung in Werkzeug, Baum und Panel, `d`
  schreibgeschützt, Lösen).
