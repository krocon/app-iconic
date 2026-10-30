# Design 073: Properties kompakt, Popovers statt Modale, einheitliche Live-Vorschau

> Prompt: [073-properties-kompakt-popovers.md](073-properties-kompakt-popovers.md) · Stand: 30.10.2026

## Ausgangslage (bestätigt)

- Jede Eigenschaft eine Zeile (Rechteck: sechs Geometrie-Zeilen), Line Cap/Join, Fill Rule, Text Anchor als
  Auswahllisten mit SVG-Begriffen.
- Corners, Offset, Fillet/Chamfer, Transform, Pattern und Optimize Path als modale Dialoge mit Backdrop; Corners
  ohne Vorschau, Optimize Path nur mit Zahlentabelle.

## Entscheidungen

- **E1 Paare** (`row-pairs.ts`, rein): `x/y`, `width/height`, `rx/ry`, `cx/cy`, `x1/y1`, `x2/y2` stehen nebeneinander,
  wenn sie in den Specs direkt aufeinander folgen – die Reihenfolge der Specs bleibt. Im Paar kurze Namen wie in der
  Box (062: X, Y, W/B, H, RX …), Zahlen ohne Schieberegler (`compact`); das Ketten-Schloss von Breite und Radius X
  bleibt in seiner Hälfte. Schmales Panel (Container-Query < 250 px): einspaltig. **Messwert** (Chromium, Panel 300 px,
  Rechteck): Abschnitt Geometrie **120 px** statt **204 px** einspaltig (−41 %).
- **E2 Icon-Toggles:** neues generisches `SegmentedField` (`shared/controls/`, APG-Radiogroup, Roving Tabindex,
  Pfeile wählen, `mixed` = keiner gewählt, nicht gesetzt = Standard umrandet), gesteuert über `icons` in der Spec:
  Line Cap, Line Join, Fill Rule (gefüllte Bildchen mit der jeweiligen Regel), Text Anchor. Name in der UI-Sprache
  als Label, der SVG-Begriff als Tooltip.
- **E3 Popovers:** `DialogService.popover()` für `corners`, `offset`, `fillet`, `transform`, `pattern`,
  `optimizePath` – derselbe `Modal`-Rahmen ohne Backdrop, ohne `aria-modal` und ohne Fokusfalle, `role="dialog"`
  bleibt; Fokus hinein (`data-autofocus`) und zurück zum Auslöser, `Esc` schließt (= Abbrechen). Lage
  (`popover-position.ts`, rein): neben einem kleinen Auslöser (rechts davon, in der rechten Fensterhälfte links), sonst
  oben rechts in der Zeichenfläche; immer im Fenster. Die Tastatur gehört dem Popover nur, wenn der Fokus darin ist –
  sonst gelten die Kürzel der Zeichenfläche. Die Zeichenfläche bleibt für Ansicht und Auswahl bedienbar; ein Ziehen
  startet dort nicht, solange die Vorschau des Popovers die Geste hält (sonst würde die Vorschau unbemerkt
  übernommen, `UndoService.begin` schließt die laufende Geste).
- **E4 Live-Vorschau überall:** Corners zeigt jede Änderung als Undo-Geste (wie Offset/Fillet/Transform/Pattern), OK =
  ein Schritt „Round Corners“, Abbrechen/Esc/Schließen = keiner. Optimize Path zeichnet vorher (gestrichelt) und nachher
  (Akzent) als Kurven über der Zeichenfläche (`PathPreview` + Overlay, höchstens 400 Kurven) – das Dokument ändert sich
  erst mit „Optimize“.

## Tests

- Vitest: `row-pairs.spec` (Rechteck, Kreis; Popover-Lage), `segmented-field.spec` (Radiogroup, Tastatur, mixed),
  `modal.spec` (Popover ohne `aria-modal`/Falle, Fokus hinein und zurück, Esc; modal mit Falle).
- Playwright `e2e/properties-compact.spec.ts`: Paare + Höhe (120 vs. 204 px), Line Join per Klick und Pfeil; Corners als
  Popover mit Vorschau, Klick auf ein anderes Element, Esc ohne Undo-Eintrag; Optimize Path zeigt das Overlay, Esc ohne
  Undo-Eintrag.
