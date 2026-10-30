# Prompt 072: Ebenenbaum – Umbenennen, Suchen, Schnellaktionen

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 055, 063, 066 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §3.5 (Baum, P1)

## Ziel

Im Baum große SVGs (> 500 Knoten) schnell finden, benennen und ordnen.

## Umfang

- **Inline-Umbenennen** per Doppelklick, `Enter` oder `F2` (Kürzel je OS im Design) für Gruppen, Layer und
  SVG-Elemente; `Esc` bricht ab, ein Undo-Schritt.
  - Gruppen/Layer: dieselbe Umbenennung wie im Inspector (010, eindeutige Namen aus `unique-names`).
  - SVG-Elemente: Empfehlung `id` umbenennen (SVG-eigen, bleibt im Export) mit Eindeutigkeitsprüfung und Anpassung
    aller Verweise (`url(#…)`, `href="#…"`; Modul `svg-references` aus 011). Alternative `data-name` im Design
    abwägen. Label-Regel einheitlich (Name > id > Tag).
- **Such-/Filterzeile** im Baum-Kopf: nach Name, id, Tag; Treffer mit ihren Vorfahren, Hervorhebung, `Enter`
  wählt; verträgt sich mit der Virtualisierung.
- **„Alle zuklappen“ / „Alle aufklappen“** (Aktionen, auch im Kontextmenü).
- **Schnellaktionen im Kopf:** `+ Gruppe`, `+ Layer` (vorhandene Aktionen aus 008).
- **Schloss und Auge auch an Gruppen und Layern.** Speicherung wie in 055 (prüfen, wo der Zustand heute liegt);
  `icon.json` bekommt keine neuen Schlüssel (konservativ, CLAUDE.md §4) – wenn es ohne nicht geht, als Frage an Marc.

## Akzeptanz

- Vitest: Umbenennen mit Verweis-Anpassung (Gradient-Verweis bleibt gültig), Filter-Modell, Schloss an Layer
  sperrt alle Kinder für Auswahl.
- Playwright: Doppelklick → Name tippen → Enter → Baum und SVG aktualisiert, Undo; Suche „circle“ in großem SVG
  (`scripts/big-svg.mjs`) zeigt Treffer flüssig; alles per Tastatur.
