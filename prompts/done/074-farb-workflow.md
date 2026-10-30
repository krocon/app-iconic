# Prompt 074: Farb-Workflow – Pipette, Dokumentfarben, Paletten, Alpha

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 009, 015, 064 (P3-Umrechnung), 067 ·
> Quelle: [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §1.6 (P1)

## Ziel

Farben aufnehmen, wiederverwenden und im ganzen Icon ersetzen – ohne Hex-Codes abzutippen.

## Ausgangslage

`shared/controls/color-field.ts`: natives `<input type="color">`, Hex-Feld, Keyword-Auswahl. Keine Pipette, keine
Dokumentfarben, kein Alpha, keine anderen Farbräume.

## Umfang

- **Farb-Popover** am ColorField: Fläche Sättigung/Helligkeit, Farbton, **Alpha**, Eingabe als Hex/RGB/HSL/HSB/
  **OKLCH** (Umrechnungen rein in `shared/controls/color-value` bzw. `shared/color/`, mit Tests), Swatches
  (Dokument, zuletzt benutzt, eigene Paletten), Knopf für den System-Picker. Ausgabeformat: was der Wert vorher war
  bleibt erhalten; Alpha als `fill-opacity`/`stroke-opacity`/`stop-opacity` oder `#RRGGBBAA` – im Design
  entscheiden und prüfen, dass resvg (PNG-Export) es versteht.
- **Pipette** (Werkzeug, Kürzel ohne Konflikt mit Messen `I` – im Design): Klick auf ein Element übernimmt dessen
  berechnete Fill (Shift: Stroke) in die Auswahl; auf Bildern/Verläufen Pixelwert aus einem Raster – entweder Rust
  (resvg rendert die Ansicht) oder Browser-Canvas (Tainting in WKWebView prüfen). Aktion
  `color.pick { x, y, target: fill|stroke }` für die KI.
- **Dokumentfarben:** alle Farben aus allen Assets (`fill`, `stroke`, `stop-color`, `flood-color`, Styles) und aus
  `icon.json` (Fill, Layer-Fill) normalisiert gesammelt; im Popover und als Panel-Abschnitt. **„Farbe im ganzen Icon
  ersetzen“** als ein serialisierbarer Command (`ReplaceColor { from, to, scope }`), ein Undo-Schritt.
- **Zuletzt benutzt und eigene Paletten** in `settings.json` (Rust `settings.rs`, TS `settings-rules`,
  `settings-cases.json`, Migration).
- Kontextleiste (067) zeigt Fill/Stroke mit diesem Popover.

## Akzeptanz

- Vitest: Farbraum-Umrechnungen (Referenzwerte, Hin-und-zurück), Dokumentfarben-Sammlung, ReplaceColor JSON
  hin und zurück, Einstellungen in beiden Sprachen.
- Playwright: Pipette auf rotem Kreis → ausgewähltes Rechteck wird rot; Rot im ganzen Icon durch Blau ersetzen,
  Undo; Alpha 50 % → PNG-Export (Rust-Test) halbtransparent.
