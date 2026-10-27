# Prompt 014: Clip Paths

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 009 · Meilenstein 8 aus `000-init.md` ·
> legacy §11, `CLIPPATH_GAP_ANALYSIS.md` der Vorlage

## Ziel

Clip Paths, die in der Vorlage unfertig blieben, vollständig bauen: anlegen, zuweisen, vererben, auf dem Canvas
bearbeiten – mit normalem SVG (`<clipPath>` in `<defs>`, `clip-path="url(#…)"`), damit Export und andere Programme
es verstehen.

## Umfang

- Properties-Abschnitt „Clip Path“: Picker **None / Inherit from Layer / <vorhandene clipPaths des Assets>**,
  „Create Clip Path“ (je Layer/Asset in `<defs>`, Startform = Rechteck der Leinwand oder Bounds der Auswahl),
  „Edit Clip Path“, „Remove“.
- **Vererbung**: Ein Clip Path am Layer (Wurzel-`<g>` bzw. `<svg>`-Kind des Assets) gilt für alle Nodes; eine Node
  kann ihn überschreiben (eigener Clip Path) oder abwählen (`clip-path="none"` als Opt-out – im Design prüfen, ob
  das gültiges SVG ergibt; sonst Struktur über Gruppen lösen und dokumentieren).
- `clipPathUnits` (`userSpaceOnUse` | `objectBoundingBox`) mit korrekter Umrechnung beim Bearbeiten.
- **Bearbeitungsmodus**: Canvas zeigt den Clip Path als bearbeitbare Formen (übriger Inhalt abgeblendet), Handles
  aus 007, Formen hinzufügen (Grundformen aus 008), Esc/„Done“ beendet; Hierarchie zeigt die Formen unter dem
  Clip Path.
- Außerhalb des Modus sind Clip-Path-Inhalte **nicht** hit-testbar und nicht selektierbar (auch nicht per
  Rahmenauswahl oder Magic Snap).
- Löschen eines Clip Paths entfernt Referenzen (Rückfrage), Duplizieren/Kopieren einer Node nimmt den Clip Path mit
  (neue ID).
- Export (012) und Rendering berücksichtigen Clip Paths (resvg kann es).

## Tests

- Vitest: Vererbungsauflösung (Fälle aus `SVGClipPathTests` der Vorlage), Referenzpflege bei Löschen/Duplizieren/
  Paste, `clipPathUnits`-Umrechnung.
- Playwright: Clip Path anlegen, im Modus verschieben → Sichtbarkeit ändert sich; Klick auf Clip-Fläche außerhalb
  des Modus trifft die Node darunter.

## Akzeptanz

- `docs/FEATURES.md` §7 „Clip Path“ abgehakt. `pnpm check` + `pnpm e2e` grün.
