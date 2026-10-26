# Prompt 007: Auswahl, Handles, Snapping

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 004, 005 · Meilenstein 4 aus `000-init.md` ·
> legacy §5, §6, `docs/legacy/svg-transform-logik-de.md`

## Ziel

Formen auf dem Canvas auswählen, verschieben, in der Größe ändern und Punkte bearbeiten – **exakt** auch bei
verschachtelten, transformierten Gruppen und jedem Zoom. Das war die größte Fehlerquelle der Vorlage (jede
Node-Art verrechnete Transform und Position anders, legacy §6). Hier gilt ausnahmslos: Positionen kommen aus dem
DOM (`getBBox`, `getCTM`), Änderungen werden über die Inverse der Eltern-CTM in lokale Koordinaten zurückgerechnet.

## Umfang

- **Hit-Testing** über den Browser (`elementsFromPoint` bzw. `isPointInFill/Stroke` mit Toleranz für dünne Linien),
  über alle sichtbaren Layer; `defs`/`clipPath`-Inhalte nie treffbar. Klick ins Leere hebt die Auswahl auf;
  Doppelklick auf eine Gruppe wählt in die Gruppe hinein (Gruppen-Kontext), Esc wieder heraus.
- **Selection Modes** `none`/`point`/`boxed` (Default `point`); Rahmenauswahl (Schnitt mit den Bounds im
  Dokumentraum), ⇧ = hinzufügen, ⌘/Ctrl = umschalten.
- **Overlay** in einer eigenen SVG-Ebene über dem Dokument (nie im Dokument-DOM): Auswahlrahmen (gedrehte Bounds als
  Polygon über CTM), Handles in **Bildschirmgröße** (unabhängig vom Zoom) mit Farben/Größen der Vorlage:
  position blau 8, size grün 6, control orange 5, anchor lila 6, midpoint gelb 7, pivot rot 9 (Tokens `--ai-handle-*`).
- **Handles je Node** (legacy §6): Circle (Mitte, Radius), Ellipse (Mitte, rx, ry), Rect (Ecken, Eckenradius wenn
  rx > 0), Line (Start/Ende), Text (Position, Anker), Polyline/Polygon (Punkte + Segment-Mitten zum Einfügen,
  Punkt löschen mit Alt-Klick/Entf), Path (Anker + Bézier-Kontrollpunkte für L/C/Q, relative Befehle korrekt;
  übrige Befehle werden zum Bearbeiten in absolute umgewandelt – Design entscheidet, ob das `d` sonst unverändert
  bleibt), Rotate-Schritt mit Pivot (aus 009). Allgemein: Bounding-Box-Handles zum Skalieren über `transform`, wenn
  keine Geometrie-Attribute passen (Gruppen, Text).
- **Ziehen** = Geste: `UndoService.begin(label)` beim Start, `update` je Pointer-Move (rAF-gedrosselt), `commit` beim
  Loslassen, `cancel` bei Esc (stellt den Ausgangszustand her). Pointer-Capture, Touchpad.
- **Pfeiltasten** 1 px, mit ⇧ 10 px (Dokumentraum, in lokale Koordinaten umgerechnet), eine Undo-Aktion je Folge
  (Coalescing über Zeit, ~500 ms).
- **Snapping** (`shared/geometry/snapping.ts`, rein): Grid (Abstand 10, Ursprung `worldZero` | `svgCenter`), Magic
  Snap auf markante Punkte aller sichtbaren Nodes (Ecken, Mitten, Zentren, Pfad-Anker – auch in anderen Gruppen/
  Assets, ohne die gezogene Node selbst), Aktivierung **20 px in Bildschirmpixeln**, bei Gleichstand Magic vor Grid;
  Defaults Grid aus, Magic an. Sichtbarer Hinweis auf den Snap-Punkt.
- **BoundsGuard** (`bounds-guard.ts`, rein): Punkte, Pfade und Translationen bleiben in der Leinwand (Fälle aus
  `BoundsGuardTests` der Vorlage).
- Aktionen: Select All, Deselect, Delete, Nudge ←↑→↓ (+⇧), Selection Mode umschalten.

## Tests

- Vitest (rein): Snapping-Fälle (aus `SnappingServiceAdditionalTests`), BoundsGuard, Rahmenauswahl-Mathematik
  (`BoxSelectionMathTests`), Pfad-Zerlegung/-Zusammensetzung, Geste begin/update/commit/cancel.
- **Playwright** (Pflicht, echtes Layout): für Zoom 50/100/150 % und nach Pan; Fixtures `nested_g.svg`,
  `nested_g_small.svg` (Gruppen mit translate/scale/rotate/skew/matrix): Handle-Position = Bildschirmposition des
  Punkts per CTM (± 0,5 px); Ziehen um (dx, dy) Bildschirm verschiebt den Punkt im Dokumentraum um (dx, dy)/zoom;
  Magic Snap greift bei 19 px, nicht bei 21 px (Bildschirm), unabhängig vom Zoom; Esc stellt her; Undo nach einer
  Geste ist **ein** Schritt.

## Akzeptanz

- Kein Versatz der Handles bei verschachtelten transformierten Gruppen (Screenshot im Bericht). `docs/FEATURES.md`
  §4 abgehakt. `pnpm check` + `pnpm e2e` grün.
