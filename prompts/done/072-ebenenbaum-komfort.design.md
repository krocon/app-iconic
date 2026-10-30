# Design 072: Ebenenbaum – Umbenennen, Suchen, Schnellaktionen

> Prompt: [072-ebenenbaum-komfort.md](072-ebenenbaum-komfort.md) · Stand: 30.10.2026

## Ausgangslage (bestätigt)

- Umbenennen ging nur im Inspector (Gruppen, Ebenen, Assets – 010 E9), SVG-Elemente gar nicht.
- Kein Filter, kein „Alle auf-/zuklappen“, Schloss nur an SVG-Elementen (055: `data-locked` im SVG); das Auge gab es
  schon an Gruppen und Ebenen (`hidden` in `icon.json`).

## Entscheidungen

- **E1 Umbenennen inline:** Doppelklick auf die Zeile und `F2` (alle Systeme) öffnen ein Feld in der Zeile – `Enter`
  wie im Finder ginge nur als Überschreibung der Basis-Keymap (dort wählt `Enter`), die OS-Dateien dürfen nur ergänzen; `Enter`/Verlassen übernimmt (ein Undo-Schritt),
  `Esc` bricht ab, der Fokus kehrt zur Zeile zurück. Gruppen/Ebenen: dieselben Commands wie der Inspector
  (`renameGroupCommand`, `renameLayerCommand` mit eindeutigen Namen). **SVG-Elemente: die `id`** – SVG-eigen, bleibt
  im Export und in anderen Programmen sichtbar, ist schon heute das Label (Name > id > Tag). `data-name` verworfen: nur
  diese App sähe es, und es stünde neben einer `id` im Datei-Inhalt. Neue id: XML-Name ohne Doppelpunkt (`[A-Za-z_]
  [A-Za-z0-9_.-]*`), eindeutig im Asset; alle Verweise (`url(#…)` in jedem Attribut inkl. `style`, `href="#…"`) folgen
  im selben `setAttributes` (Undo-Label „Rename Element“). Leer entfernt die id – nur ohne Verweise. Aktion
  `edit.renameElement { ref, id }` (auch für die KI); Fehler in der Statuszeile.
- **E2 Filter** im Baum-Kopf (`tree-filter.ts`, rein): Treffer, wenn Label (Name, id oder Kurzbeschreibung) die Eingabe
  enthält oder der Tag genau passt – ohne Groß/Klein. Die Zeilen zeigen Treffer mit ihren Vorfahren, alle offen, als
  eine flache Liste – die Virtualisierung bleibt unverändert. Treffer hervorgehoben (`<mark>`), Anzahl als
  `aria-live`. `Mod+F` im Baum fokussiert den Filter, `↓` springt zum ersten Treffer, `Enter` wählt ihn, `Esc` leert.
- **E3 Alle auf-/zuklappen:** `hierarchy.expandAll` / `hierarchy.collapseAll` (Palette, Kontextmenü des Baums, Kopf);
  „zu“ lässt die Wurzel offen, „auf“ öffnet auch Elemente und „Definitionen“.
- **E4 Schnellaktionen im Kopf:** `+ Gruppe` (`add.iconGroup`) und neu `+ Ebene` (`add.layer`: neue Ebene mit leerem
  Asset in der aktuellen Gruppe, vor der gewählten Ebene, sonst oben; ohne Gruppe wie „Gruppe (SVG)“).
- **E5 Schloss an Gruppen und Ebenen:** gespeichert wie in 055 als `data-locked` – an der **Wurzel `<svg>` des Assets**
  der Ebene (`icon.json` bleibt ohne neue Schlüssel). Eine Gruppe steht für alle ihre Ebenen und zeigt „gesperrt“,
  wenn alle Ebenen mit Asset gesperrt sind. Da `isLocked` die Vorfahren bis zur Wurzel prüft, sind alle Elemente der
  Ebene für Treffer, Rahmen und „Alles auswählen“ gesperrt, rasten aber weiter ein. Ebenen, die sich ein Asset teilen,
  sperren gemeinsam (dasselbe SVG). `edit.toggleLock` nimmt dafür `items`.

## Tests

- Vitest `rename.spec` (Umbenennen + Verweise + Undo, ungültig/vergeben/verwiesen; Filter mit Vorfahren, Hervorhebung,
  auf/zu; Schloss an Gruppe/Ebene sperrt die Kinder, Zeilen zeigen es, geteiltes Asset), `hierarchy-tree.spec`.
- Playwright `e2e/tree-rename.spec.ts`: Doppelklick → Name → Enter → Baum und SVG, vergebener Name abgelehnt, Undo;
  Ebene per F2, Esc bricht ab; Schnellaktionen, auf/zu, Ebene sperren → „Alles auswählen“ leer; Filter „circle“ in
  einem großen SVG (`scripts/big-svg.mjs`), nur Tastatur.
