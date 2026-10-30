# Design 062: Bounding-Box-Inspektor

> Prompt: [062-bbox-inspektor.md](062-bbox-inspektor.md) · Stand: 30.10.2026

## Befund (geprüft)

`property-spec.ts` liefert Geometrie nur aus Attributen; `<g>` hat keine, `<path>` nur `d`, gemischte Auswahl die
Schnittmenge (oft nichts). Der Transform-Dialog (053) kann bereits Matrizen im Dokumentraum vor das `transform`
eines Knotens setzen (`TransformService`), inkl. Vorschau als Geste.

## Entscheidungen

- **E1 Rahmen statt achsparalleler Box für ein Element:** Ein ausgewähltes Element ohne Neigung bekommt seinen
  eigenen gedrehten Rahmen (lokale `getBBox` durch die CTM; Drehung = Winkel der x-Achse; gespiegelte Elemente:
  Winkel aus der y-Achse – ein Spiegeln ist keine 180°-Drehung). B/H sind dann die Seiten des Rahmens, eine
  Größenänderung skaliert entlang seiner Achsen (kein Scheren). Geneigte Elemente und Mehrfachauswahl: achsparallele
  Box um alle Rahmen, Drehung als relatives Feld „Drehen um“ (leer, Platzhalter 0).
- **E2 X/Y = Bezugspunkt** (wie Illustrator): 9-Punkte-Wahl (Standard oben links, für die Sitzung), auch Pivot für
  Größe und Drehung. Spiegeln immer um die Mitte (spiegelt „an Ort und Stelle“).
- **E3 Ein Weg für Änderungen:** `boxEditMatrix(frame, anchor, edit, lock)` (rein) → eine Matrix im Dokumentraum →
  `TransformService.planMatrix/previewMatrix/applyMatrix` (neu, teilt `moveNodes` mit `plan`) → `SetAttributes`
  auf `transform` (vorne gefaltet, `prependAffine`). Keine neue Transform-Kette.
- **E4 Geste:** Tippen/Stepper/Label-Ziehen = Live-Vorschau relativ zum Rahmen beim Gestenbeginn; Enter/Blur =
  ein Undo-Schritt („transform“), Escape = zurück ohne Undo-Eintrag. Messen nach jedem Render (rAF wie die
  Auswahlrahmen des Canvas).
- **E5 Genauigkeit:** `affineText` schreibt die linearen Koeffizienten mit 6 statt 4 Nachkommastellen (sonst
  300 → 299,99 nach Drehung). Anzeige mit 2 Nachkommastellen.
- **E6 Gesperrt (055):** Felder deaktiviert, Hinweis; Aktionen liefern `false`.

## Verträge

- `shared/geometry/box-frame.ts`: `Frame`, `BoxEdit`, `elementFrame`, `boxFrame`, `framePoint`, `frameFields`,
  `boxEditMatrix`.
- `BoxService` (Root): `state` (Signal `{ frame, locked }`), `pivot`, `lock`, `measure()`, `refresh()`,
  `preview(edit)`, `commit()`, `cancel()`, `apply(edit, pivot?, lock?)`, `canApply()`.
- `TransformService`: `planMatrix(m)`, `previewMatrix(m)`, `applyMatrix(m)`.
- Aktionen: `properties.box { x?, y?, width?, height?, rotation?, rotateBy?, flipH?, flipV?, pivot?, lock? }`
  (palette: nein), `properties.flipH`, `properties.flipV`.

## Tests

- Vitest: `box-frame.spec.ts` (Rahmen ungedreht/gedreht/gespiegelt/geneigt, X/Y, Schloss, Größe entlang gedrehter
  Achsen, Drehung absolut/relativ, Spiegeln), `box-section.spec.ts` (Zahlen, Pfeiltasten im Bezugspunkt,
  Argumente der KI).
- Playwright `e2e/box.spec.ts`: Gruppe in transformierter Elterngruppe bei Zoom 50/100/150 %; B mit Schloss um die
  Mitte; Rechteck + Kreis; Pfad 30° drehen und Breite ändern, Undo byte-gleich; Spiegeln, `properties.box`,
  gesperrt; Escape ohne Undo-Eintrag. `transform.spec`/`properties.spec`: Locator auf Dialog bzw. Abschnitt
  eingegrenzt (gleiche Beschriftungen im Kopf).

## Offen

- Zweispaltiges Layout der übrigen Geometriefelder und Popovers: 073.
