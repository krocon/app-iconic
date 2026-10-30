# Design 074: Farb-Workflow – Pipette, Dokumentfarben, Paletten, Alpha

> Prompt: [074-farb-workflow.md](074-farb-workflow.md) · Stand: 30.10.2026

## Ausgangslage (bestätigt)

`ColorField`: natives `<input type="color">` (ohne Alpha), Hex-Feld, Schlüsselwörter. Keine Pipette, keine
Dokumentfarben, keine Paletten; die Kontextleiste (067) nutzte ebenfalls das native Feld.

## Entscheidungen

- **E1 Farb-Popover** (`shared/controls/color-picker.ts` + `color-button.ts`): Fläche Sättigung/Helligkeit (Zeiger und
  Pfeiltasten, ⇧ = 10), Farbton, **Alpha**, Wert in Hex/RGB/HSL/HSB/OKLCH (Umrechnungen rein in
  `shared/color/color-spaces.ts`, OKLab nach Ottosson/CSS Color 4; alles läuft über sRGB, OKLCH außerhalb von sRGB
  wird abgeschnitten), Swatches, „System …“ (das native Feld liegt im Knopf), „+“ zur Palette, „Fertig“. Nicht modal
  (`role="dialog"`), Fokus hinein, Esc nimmt zurück, Enter/Fertig/Klick daneben übernehmen (ein Undo-Schritt über die
  vorhandene Geste des Felds). **Ausgabe:** das Format des alten Werts bleibt – `rgb()`/`hsl()` in der
  Komma-Schreibweise (die liest auch resvg), sonst `#RRGGBB`; **Alpha als `#RRGGBBAA`** im selben Attribut statt
  `fill-opacity` & Co.: ein Feld, ein Attribut, für `fill`, `stroke`, `stop-color`, `flood-color` gleich; Rust-Test
  `eight_digit_hex_alpha_is_half_transparent` zeigt, dass der PNG-Export es halbtransparent rendert. HSB und OKLCH sind
  Eingabeformate und werden als Hex geschrieben (WebKit-Versionen und resvg lesen `oklch()` nicht sicher).
- **E2 Swatches ohne Feature-Abhängigkeit:** `ColorSwatches` (abstrakt in `shared/controls`, ohne App leer) –
  `ColorLibrary` (`features/color`) liefert Dokument (die 24 häufigsten), Zuletzt (16) und Palette (64); in
  `app.config.ts` gebunden.
- **E3 Pipette** (`color.eyedropper`, **⇧I** – `I` bleibt Messen): ein Werkzeug der Zeichenfläche; Klick nimmt die Farbe
  unter dem Zeiger in die Auswahl (Füllung; ⇧: Kontur), ein Schritt „Change Fill/Stroke“, gesperrte Elemente bleiben.
  Einfarbiges Element: seine **berechnete** Füllung (bzw. Kontur, wenn es keine Füllung hat) – geerbte und CSS-Farben
  zählen. **Bild, Verlauf, Muster oder leere Stelle:** resvg rendert das Icon (Export-SVG, ohne Maske/Effekte) und gibt
  das Pixel zurück (`pick_color` → `png::pick_pixel`) – kein Browser-Canvas, also kein Tainting-Problem in WKWebView.
  `color.pick { x, y, target }` (Dokument-Koordinaten) für die KI.
- **E4 Dokumentfarben + Ersetzen:** `documentColors` (rein) sammelt `fill`, `stroke`, `stop-color`, `flood-color`,
  `lighting-color`, `color` als Attribut und in `style` aller Assets und jede Farbe aus `icon.json` (über
  `srgbHexOf`), normalisiert `#RRGGBB(AA)` (die CSS-2-Farbnamen auch ohne Browser). **`replaceColor { from, to,
  assets? }`** ist ein neuer serialisierbarer Command für die SVGs; `color.replace { from, to }` packt ihn mit
  `setIconJsonValue` für die `icon.json`-Farben (P3 bleibt P3, `withSrgbHex`) in einen Schritt „Replace Color“. Andere
  Alpha = andere Farbe. Panel-Abschnitt „Dokumentfarben“ (zugeklappt): Farbe wählen, dann die neue im Popover.
- **E5 Einstellungen:** `colors { recent, palette }` in `settings.json` (Rust `ColorSettings`, TS-Spiegel, Fälle in
  `settings-cases.json`): nur Hex, normalisiert, ohne Doppelte, begrenzt. Keine Schema-Migration nötig (fehlendes Feld
  = Standard); eine **leere** Standardliste nimmt jetzt Texte an (vorher nichts – Rust `merge_shaped` und TS gleich).
  Eine benannte Palettenliste bräuchte Objekte in Listen, die das nachsichtige Lesen nicht kennt → **eine** eigene
  Palette jetzt, mehrere später (offene Frage).
- **E6 Kontextleiste:** Füllung/Kontur der Zeichenwerkzeuge und die Farbe von „Füllen“ öffnen dasselbe Popover.

## Tests

- Rust: `#RRGGBBAA` halbtransparent im PNG, Pixel aus einem Verlauf (`pick_pixel`), Einstellungsfall Farben.
- Vitest: `color-spaces.spec` (Referenzwerte inkl. OKLCH von Rot, hin und zurück, Formate, `writeLike`),
  `document-colors.spec` (Sammeln, Ersetzen + Undo, JSON hin und zurück, Fehler), `color-picker.spec` (Dialog, live,
  Swatch, Alpha, Palette, Fertig/Esc, Formate), `color-library.spec`, Registry-Fall `replaceColor`, Einstellungsfälle.
- Playwright `e2e/colors.spec.ts`: Pipette (⇧I) färbt das Rechteck rot, ⇧ die Kontur, Undo; Rot im ganzen Icon durch
  Grün ersetzen aus den Dokumentfarben, Undo; Alpha 50 % → `#FF000080`, Esc zurück, Fertig = ein Schritt.
