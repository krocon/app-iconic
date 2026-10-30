# Prompt 075: Live-Typografie für `<text>`

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 009, 013, 067 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §1.8 (P1)

## Ziel

Text direkt auf dem Canvas setzen und bearbeiten, mit echter Schriftwahl, und bestehenden Text in Pfade wandeln.

## Ausgangslage (laut Analyse, zuerst bestätigen)

- `TextPathDialog` hat einen durchsuchbaren Schriftkatalog aus Rust (`list_fonts`), `font-family` an `<text>` ist im
  Panel (`property-defs.ts`) nur Freitext.
- Kein Bearbeiten auf dem Canvas, kein Schriftschnitt/italic, `letter-spacing`, `line-height`, keine Mehrzeiligkeit,
  kein „Text in Pfad umwandeln“ für vorhandene Nodes.

## Umfang

- **Schrift-Auswahl** im Panel und in der Kontextleiste: Combobox aus `FontApi` (Suche, Vorschau im eigenen
  Schnitt), Schnitt/Gewicht aus `FontCatalog`, `font-style`, `font-size`, `letter-spacing`, Zeilenabstand,
  Ausrichtung (SegmentedField aus 073, falls vorhanden).
- **Text-Werkzeug** (`T`, Kürzel aus 068): Klick setzt Text und startet die Eingabe.
- **Bearbeiten auf dem Canvas:** Doppelklick auf `<text>` → Eingabefeld exakt über dem Text (Position/Skalierung über
  die Screen-CTM), IME-fähig, `Enter`/`⌘Enter`-Regel im Design, `Esc` bricht ab; Ergebnis ein `SetText`-Command
  (ein Undo-Schritt), auch per Aktion `text.set { node, text }`.
- **Mehrzeilig:** Zeilen als `<tspan x dy>`; Zeilenabstand als `dy`. Vorhandene `tspan`-Strukturen verlustfrei
  erhalten, wenn nicht bearbeitet.
- **„Text in Pfad umwandeln“** (`text.toPath`): Schrift und Größe aus den berechneten Styles, Rust `text_to_path`
  (harfrust/skrifa), Zeilen und Transformationen berücksichtigt, Fill/Stroke/Klassen übernommen, `ReplaceNode`.
  Fehlt die Schrift → Hinweis mit Ersatzschrift-Angebot.

## Akzeptanz

- Rust: `text_to_path` mit mehreren Zeilen und `letter-spacing` (Testschrift Caladea).
- Vitest: tspan-Aufbau, Schrift-Auflösung, SetText JSON hin und zurück.
- Playwright: Text setzen, Doppelklick, ändern, Undo; Schrift wählen; umwandeln → `<path>` mit gleicher BBox
  (Toleranz) bei Zoom 150 % in transformierter Gruppe.
