# Prompt 009: Properties-Panel

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 006, 007 · Meilenstein 6 aus `000-init.md` ·
> legacy §7.4, §7.5

## Ziel

Das Properties-Panel (rechts) bearbeitet die Attribute der Auswahl – generisch aus einer **Property-Spec**, nicht
mit einer handgeschriebenen 1 500-Zeilen-Komponente wie in der Vorlage. Mehrfachauswahl zeigt gemeinsame Werte und
„mixed“.

## Umfang

- `features/properties/property-spec.ts` (rein): je Node-Typ die Abschnitte **Geometry**, **Appearance**,
  **Stroke**, **Text**, **Transform**, **Advanced** mit Einträgen `{ name, label, type: number|length|color|enum|
  text|textarea|toggle, unit?, min?, max?, step?, default?, options? }` – Werte und Bereiche aus legacy §7.4
  (z. B. `stroke-width` 0…100, `font-size` 4…512, `opacity` 0…1, `stroke-miterlimit` 1…100 Default 4,
  `fill-rule` nonzero|evenodd, Linecap/-join, Dasharray, `preserveAspectRatio` für `image`/`svg`).
- Editoren in `shared/controls/`: Zahl mit **Stepped Slider** (Slider + Zahlenfeld, Pfeiltasten ± step, ⇧ × 10,
  Ziehen am Label), Farbe (Swatch + Hex `#RRGGBB`/`#AARRGGBB` + `none`/`inherit`/`currentColor`, nativer
  Farbwähler, Verlaufs-Referenzen anzeigen), Auswahl, Text, Textarea (`d`, `points`).
- Werte lesen: Attribut, sonst `style`-Eigenschaft, sonst geerbt/berechnet (grau angezeigt). Schreiben: als
  Attribut; ein vorhandenes gleichnamiges `style`-Property wird dabei entfernt (sonst wirkt die Änderung nicht).
- **Mehrfachauswahl**: Schnittmenge der Specs, „mixed“-Platzhalter, Änderung wirkt auf alle (ein Undo-Schritt).
- **Constrain proportions** für width/height bzw. rx/ry.
- **Transform-Liste** (`transform-list.ts`, rein): Parsen/Schreiben von `translate`, `scale`, `rotate` (mit Pivot
  cx/cy, „Use pivot“), `skewX`, `skewY`, `matrix`; Schritte hinzufügen („Add“-Menü), per Drag/Tastatur umordnen
  („top applies first“), entfernen; Rohanzeige des Attributs (editierbar mit Validierung); Pivot-Handle im Canvas
  (007). Zahlen sinnvoll runden.
- **Reset** je Property (auf Spec-Default bzw. Attribut entfernen) und „Reset All Properties“ (Bestätigung);
  Undo/Redo-Knöpfe im Panel-Kopf. Leerzustand „Nothing selected – Select an element in the hierarchy or on the
  canvas.“
- Änderungen beim Tippen live (Coalescing je Feld), Enter/Blur bestätigt, Esc verwirft.

## Tests

- Vitest: Spec-Vollständigkeit je Node-Typ, Transform-Liste (Parse ↔ Serialize, Pivot, Umordnen, Matrix-Gleichheit
  über `DOMMatrix`), Farbformate, mixed-Logik, Constrain, Reset.
- Playwright: Breite ändern → Canvas aktualisiert; rotate mit Pivot verschiebt Pivot-Handle korrekt; Undo eines
  getippten Werts ist ein Schritt.

## Akzeptanz

- `docs/FEATURES.md` §7 (ohne Clip Path) abgehakt. `pnpm check` + `pnpm e2e` grün.
