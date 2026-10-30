# Design 075: Live-Typografie für `<text>`

> Prompt: [075-live-typografie.md](075-live-typografie.md) · Stand: 30.10.2026

## Ausgangslage (bestätigt)

`font-family` im Panel war Freitext; kein Bearbeiten auf der Zeichenfläche, kein Schriftstil, kein Zeichenabstand,
keine Mehrzeiligkeit, kein Umwandeln vorhandener Texte. Der Schriftkatalog (`list_fonts`) und `text_to_path` (Rust,
harfrust/skrifa) gab es seit 013.

## Entscheidungen

- **E1 Schrift im Panel:** `font-family` als Combobox (`FontField`: Eingabefeld + `<datalist>` mit den installierten
  Familien – Tippen filtert, der Wert erscheint in seiner eigenen Schrift; jede CSS-Liste bleibt tippbar; die Liste lädt
  beim ersten Fokus). Neu: `font-style` (Icon-Umschalter normal/kursiv, 073) und `letter-spacing`; Gewicht und
  Ausrichtung wie bisher bzw. aus 073. Der Zeilenabstand ist das `dy` der Zeilen (E4), kein eigenes Panel-Feld.
- **E2 Text-Werkzeug** `text.tool` **⇧T** (`T` ist seit 068 Trim): Klick auf einen Text bearbeitet ihn, sonst beginnt
  dort ein neuer (Grundlinie am Klick, linksbündig, `system-ui`); ein leerer neuer Text wird nicht angelegt. Auch in der
  Werkzeugleiste.
- **E3 Bearbeiten auf der Zeichenfläche:** Doppelklick auf einen Text (oder `text.edit`) legt ein `<textarea>` genau über
  ihn – Lage aus `getBoundingClientRect`, Schriftgröße × Skalierung der Screen-CTM, berechnete Schrift, Ausrichtung nach
  `text-anchor`. **Enter = neue Zeile, ⌘/Strg+Enter oder Verlassen = fertig, Esc = abbrechen** (wie das
  Pfad-Textfeld des Panels, 009). IME, Auswahl und Undo des Tippens sind die des Felds. Ergebnis: ein Schritt
  „Change Text“ – `setText` für eine Zeile ohne Kindelemente, sonst der Text neu mit Zeilen-`tspan`s
  (`replaceNode` in einem Composite gleichen Namens). Auch `text.set { node, text }`.
- **E4 Mehrzeilig:** Zeilen als `<tspan x=… dy=…>`; `dy` der ersten Zeile 0, sonst der Zeilenabstand des Texts (das `dy`
  seiner zweiten Zeile, Standard `1.2em`). Ein nicht bearbeiteter Text bleibt unberührt; ein bearbeiteter mit
  verschachtelten `tspan`s (ein farbiges Wort) verliert diese Formatierung – sie steckt dann im Text der Zeile.
- **E5 „Text in Pfad umwandeln“** `text.toPath { nodes? }` (Kontextmenü, Palette): Schrift aus der berechneten
  `font-family`-Liste (erste installierte; generische = Standardschrift), Schnitt nach Gewicht und Neigung, Größe und
  Zeichenabstand berechnet; jede Zeile an der Stelle, an die der Browser sie gesetzt hat (`getStartPositionOfChar` –
  Anker, `dy`, Transformationen des Texts bleiben am Pfad). Füllung, Kontur, Klassen, `transform` werden übernommen,
  Text-Attribute fallen weg. Fehlt die Schrift: Frage, ob die Standardschrift einspringen darf. Alle gewählten Texte
  ein Schritt „Convert Text to Path“. Mehrere Zeilen werden in TS zusammengesetzt (`text_to_path` bleibt einzeilig,
  Rust-Tests für Zeichenabstand gibt es seit 013).

## Tests

- Vitest: `text-lines.spec` (Zeilen lesen, `setText` JSON hin und zurück, `tspan`-Aufbau, Zeilenabstand, neuer Text),
  `text-to-path.spec` (Schriftwahl, Pfad-Attribute, zwei Zeilen = zwei Aufrufe, ein Schritt, Undo).
- Playwright `e2e/text.spec.ts`: ⇧T, Klick, tippen, ⌘Enter; Doppelklick, zwei Zeilen, Undo; Esc ohne Schritt; Schrift aus
  der Liste; Umwandeln bei Zoom 150 % in gedrehter Gruppe → `<path>` an der Stelle des Texts (Kästchen-Schrift des
  Browser-Modus, daher Toleranz 0,35 em).
