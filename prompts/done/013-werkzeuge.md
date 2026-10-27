# Prompt 013: Werkzeuge – Freihand, Text → Pfad, Symbole

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 008 · Meilenstein 8 aus `000-init.md` · legacy §8

## Ziel

Die drei „großen“ Add-Befehle: Freihand zeichnen, Text in Pfade umwandeln (mit Systemschriften) und Symbole aus
einem **freien** Icon-Set einfügen.

## Umfang

### Freehand
- Werkzeug-Modus (Cursor, Statushinweis, Esc bricht ab), Punkte im Dokumentraum sammeln (`minDistance` 3, max.
  120 Hz), Live-Vorschau im Overlay. Beim Loslassen: Ramer-Douglas-Peucker (`epsilon` 2.5), Glättung zu kubischen
  Béziers (Catmull-Rom, `alpha` 0.5), 1 Nachkommastelle, ≤ 4 096 Segmente (Parameter aus `PathFitter.swift`,
  übertragen mit Herkunftsvermerk); offen/geschlossen umschaltbar (Taste/Option, Auto-Schließen bei Endpunkt nahe
  Start). Ergebnis: `<path>` mit Stroke schwarz, round/round, ohne Fill; eine Undo-Aktion; ins Ziel aus 008.
- Optionen in der Werkzeugleiste: Glättung (epsilon), Strichbreite.

### Text → Pfad
- Rust `ai-core/fonts/`: `fontdb` (Systemschriften laden, einmal je Sitzung, im Hintergrund) + `ttf-parser`
  (Glyphen-Umrisse) + einfaches Shaping (Kerning aus `kern`/GPOS, sonst Advance; komplexe Schriften → `rustybuzz`
  erwägen, Entscheidung im Design). Commands `list_fonts() -> [{ family, styles: [{ name, weight, italic, id }] }]`
  und `text_to_path(text, fontId, size, letterSpacing) -> { d, bbox }`.
- Dialog: Texteingabe, Schriftauswahl (Familie + Stil, Suche), Größe, Vorschau (SVG des Ergebnisses), Einfügen als
  `<path>` (zentriert, Fill schwarz).

### Symbole
- **Keine SF Symbols** (Lizenz verbietet die Nutzung in App-Icons; legacy §8). Freies Set wählen und im Design
  begründen (z. B. Lucide ISC, Tabler MIT, Material Symbols Apache 2.0 – Lizenz prüfen, Text in
  `THIRD-PARTY-NOTICES.txt` und im About-Dialog).
- **Plugin-Schnittstelle** `SymbolProvider { id, name, license, search(q), variants (Gewicht/Stil), toSvg(id, opts) }`,
  damit weitere Sets folgen können. Icons als Daten-Bundle lazy laden.
- Picker: Suche, Raster mit Vorschau, Gewicht/Strichstärke (soweit das Set es hat), Größe; Einfügen als Pfad(e)
  (Strich-Icons optional in Füllpfade umwandeln – Design entscheidet; mindestens mit `stroke` korrekt einfügen),
  skaliert auf die gewählte Größe, zentriert.

## Tests

- Vitest: Freehand-Pipeline (Fälle aus `FreeHandPathTests`), Symbol-Provider (Suche, toSvg), Picker-Logik.
- Rust: `text_to_path` mit einer mitgelieferten Testschrift (OFL, in `testdata/fonts/`), Umlaute/Emoji (fehlende
  Glyphen → Fehlercode), leere Eingabe.
- Playwright: Freihand-Strich per Maus zeichnen → ein Pfad, Esc bricht ab; Symbol suchen und einfügen.

## Akzeptanz

- `docs/FEATURES.md` §5 vollständig abgehakt. `pnpm check` + `pnpm e2e` grün; Lizenzen dokumentiert.
