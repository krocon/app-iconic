# Design 076: Effekte und Masken je Element

> Prompt: [076-effekte-masken.md](076-effekte-masken.md) · Stand: 30.10.2026

## Ausgangslage (bestätigt)

Der Sanitizer lässt `<filter>`, `feDropShadow`, `feGaussianBlur`, `<mask>` zu; im Panel waren `filter` und `mask` nur
Textfelder unter „Erweitert“. Copy/Duplicate nahmen nur Clip Paths mit (014 E10).

## Entscheidungen

- **E1 Effekte** (`effects/effect-model.ts`, rein): Schlagschatten, innerer Schatten, Unschärfe – je Element jeder
  höchstens einmal, an/aus, Farbe, Deckkraft, Versatz X/Y, Weichheit. **Ein verwalteter `<filter>` je Element** in
  `<defs>`; die Liste steht als JSON in `data-effects` (nicht `data-ai-*` – das fällt beim Speichern weg), die Primitive
  werden daraus gebaut: Unschärfe (`feGaussianBlur`) auf die Grafik, darüber der innere Schatten (Offset/Blur des
  Alpha, `arithmetic`, Flood, `in`, `over`), darunter der Schlagschatten (`feDropShadow`). Filterbereich −50 %/200 %,
  `color-interpolation-filters="sRGB"` (wie Browser und resvg gleich rechnen). Alles aus → Durchreichen (ein leerer
  Filter malte nichts). Ein **geteilter** verwalteter Filter wird beim Ändern für dieses Element kopiert (Hinweis im
  Panel, wie Verläufe in 032); ein **fremder** (ohne `data-effects`) bleibt unberührt: „Eigener Filter – mit
  ‚SVG bearbeiten …‘ ändern“. Leere Liste → `filter`-Attribut weg, der Filter auch, wenn ihn niemand sonst nutzt.
  Ein Schritt „Change Effects“ (`insertDefinition` + `setAttribute` bzw. `replaceNode` bzw. `removeAttribute` +
  `removeNode`, serialisierbar). Panel-Abschnitt „Effekte“: Kontrollkästchen je Art, Felder live (Tippen, Ziehen am
  Label = eine Geste = ein Undo-Schritt). Aktionen `effect.add/set/remove { kind, …, node? }`. `opacity` steht schon
  unter „Darstellung“; `mix-blend-mode` an SVG-Elementen ist kein Präsentationsattribut (nur CSS) und wird nicht
  angeboten – Mischmodi gibt es weiter an Ebenen (`icon.json`, 010).
- **E2 Masken** (`effects/mask-model.ts`): „Maske erstellen“ (`mask.create`, Kontextmenü) – das vorderste von ≥ 2
  gewählten Elementen derselben Gruppe wird `<mask mask-type="luminance">`, die übrigen kommen in eine neue Gruppe mit
  `mask="url(#…)"` (so bleibt ihr Raum der Raum der Maske, ihre Transformationen inklusive). „Maske lösen“
  (`mask.release`) legt den Inhalt vor das Element zurück und entfernt die Definition, wenn niemand sonst sie nutzt;
  `mask.type { type }` schaltet Luminanz/Alpha (Panel). Bearbeiten der Maskenform: lösen, ändern, wieder maskieren,
  oder den Inhalt im Baum unter „Definitionen“ wählen – ein eigener Bearbeitungsmodus wie bei Clips (014 E7) folgt bei
  Bedarf (offene Frage). Copy/Duplicate nehmen Masken und Effekt-Filter mit wie Clips (`clip-references`: `mask`,
  `filter` zusätzlich zu `clip-path`); Duplicate bekommt eigene Kopien.
- **E3 Export-Treue** (Rust-Tests mit Pixeln): Schlagschatten, Unschärfe, innerer Schatten, Luminanz- und Alpha-Maske
  rendert resvg wie erwartet. **Abweichung:** `feDropShadow` mit `stdDeviation="0"` malt in resvg gar nichts (Browser:
  harter Schatten) – der Filter schreibt deshalb mindestens 0,01; Unschärfe 0 lässt das Primitiv weg.

## Tests

- Vitest `effect-model.spec`: Filter schreiben/lesen, alles aus, hinzufügen/ändern/entfernen + JSON hin und zurück,
  geteilter Filter → Kopie, fremder bleibt; Maske erstellen, Typ, lösen, Undo; Duplicate/Copy nehmen Filter und Maske mit.
- Rust (`png.rs`): Schlagschatten, Unschärfe, innerer Schatten, Luminanz-/Alpha-Maske.
- Playwright `e2e/effects.spec.ts`: Schatten im Panel, Versatz am Label ziehen = ein Undo-Schritt, aus = kein Filter;
  Maske aus zwei Elementen, Alpha, lösen, Undo.
