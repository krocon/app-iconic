# Prompt 004: Canvas – Rendern, Zoom, Pan, Lineale, Guides

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 003 · Meilenstein 3 aus `000-init.md` ·
> legacy §5, §3 (Export-Hintergrund)

## Ziel

Die Zeichenfläche zeigt das Dokument so, wie es als Icon aussehen wird: Hintergrund-Fill, alle Gruppen und Layer in
der Reihenfolge von `icon.json` (erste Gruppe oben – im Design-Dokument gegen Icon Composer prüfen), Layer-Opacity,
optional Plattform-Maske; darüber Guides, Lineale, Koordinaten, Fadenkreuz. Zoom und Pan sind flüssig. Die
Geometrie-Basis (Bildschirm ↔ Dokument) entsteht hier und ist die Grundlage für 007.

## Umfang

- **Rendering im DOM:** ein Host-`<svg viewBox="0 0 1024 1024">`; je Layer ein `<g>` (Opacity, Sichtbarkeit), darin
  das **lebende** `SVGSVGElement` des Assets (gleiche Instanz wie im `DocumentStore`, kein Kopieren pro Frame).
  Assets mit anderer Größe/viewBox (Fixture `_1014x1024_demo.svg`) werden wie in Icon Composer auf die Leinwand
  gesetzt (Design klärt: zentriert, unskaliert?). PNG-Assets als `<image>`.
- **IDs bleiben eindeutig:** mehrere Assets können gleiche `id`s (Verläufe, clipPaths) haben – Konflikte im
  gemeinsamen DOM lösen (z. B. Shadow-Root je Layer oder getrennte `<svg>`-Ebenen übereinander). Entscheidung mit
  Begründung, da `url(#id)`-Referenzen sonst falsch auflösen.
- **Hintergrund:** Fill aus `icon.json` in eine Vorschau umrechnen (`fill-preview.ts`, rein): `automatic`,
  `system-light`, `system-dark`, `solid`, `automatic-gradient`, `linear-gradient`, `radial-gradient`; Umschalter
  Light/Dark; Farben `extended-srgb:r,g,b,a` u. a. → CSS (`color(srgb …)`/`color(display-p3 …)`). Ein-/ausblendbar.
- **Plattform-Maske:** Squircle (iOS/macOS, als Pfad; Formel/Annäherung im Design belegen) bzw. Kreis (watchOS);
  Umschalter in der Canvas-Toolbar.
- **Zoom:** Stufen 25/33/50/66/75/100/125/150/200 % (legacy §5), ⌘+/⌘−/⌘0 (100 %), Pinch/Trackpad (Ctrl+Wheel),
  Zoom um den Mauszeiger, Anzeige der Stufe, „Center Canvas“. **Pan:** Scrollen, Space+Ziehen, mittlere Maustaste.
- **Lineale** oben/links (`--ruler-size`): Haupt- und Nebenteilung passend zum Zoom (Schrittweiten 1-2-5-Reihe),
  Beschriftung im Dokumentraum; Canvas-Elemente in `<canvas>` oder SVG – Leistung messen.
- **Koordinaten-Anzeige** x/y im Dokumentraum (Statuszeile), **Cross Cursor** über die ganze Fläche,
  **Icon-Guides** aus `shared/geometry/icon-guides.ts` (001).
- **Geometrie-Basis** `shared/geometry/`: `ViewTransform { zoom, pan }` → `DOMMatrix` Dokument → Bildschirm und
  zurück; `clientToDocument(evt)` über `getScreenCTM()` des Host-SVG; `nodeToDocument(el)` über
  `el.getCTM()` relativ zum Host. **Keine** eigene Transform-Kette (CLAUDE.md §4).
- Zustand der Ansicht (`CanvasViewStore` je Fenster): zoom, pan, Optionen (Rulers, Guides, Background, Cross Cursor,
  Show Handles, Maske, Appearance) – Persistenz kommt in 015.

## Tests

- Vitest: `fill-preview` (alle Fill-Arten, Farbformate), Ruler-Teilung je Zoom, Zoomstufen-Navigation.
- **Playwright** (echtes Layout): alle Fixtures rendern ohne Fehler (Screenshot-Vergleich mit Toleranz, Baselines im
  Repo), `clientToDocument` bei Zoom 50/100/150 % und nach Pan auf ± 0,5 px genau, Zoom um den Mauszeiger hält den
  Punkt unter dem Zeiger fest, `nested_g.svg`: `getCTM`-Bounds verschachtelter transformierter Gruppen.

## Akzeptanz

- `camscanner.icon` sieht aus wie in Icon Composer (Screenshot im Bericht), Zoom/Pan flüssig bei `logo-artv.svg`
  (100 KB), Lineale und Koordinaten stimmen. `pnpm check` + `pnpm e2e` grün.
