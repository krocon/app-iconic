# Prompt 011: SVG-Quelltext, Formatierer, Pfad-Optimierer

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 006 · Meilenstein 8 (Optimierer) aus
> `000-init.md` · legacy §10

## Ziel

Jede Node und jedes Asset lässt sich als SVG-Quelltext bearbeiten – mit Syntax-Hervorhebung, Fehleranzeige und
Undo. Dazu ein sauberer Formatierer und der Pfad-Optimierer der Vorlage.

## Umfang

- Abhängigkeit **CodeMirror 6** (`@codemirror/state`, `view`, `lang-xml`, `commands`, `search`, `lint`) – Begründung
  in `docs/architecture.md`; per Lazy-Load nur für den Dialog, Bundle-Budget im Blick.
- Dialog „Edit SVG…“ (aus Hierarchie-Kontextmenü, Properties und Menü): Monospace, Hervorhebung, Zeilennummern,
  Suchen, Farben aus Tokens (hell/dunkel). Live-Prüfung mit `DOMParser` (Fehler mit Zeile/Spalte als Lint-Marker);
  „Apply“ nur bei fehlerfreiem Markup; danach bereinigen (`sanitize-svg`), IDs/`data-ai-id` neu vergeben,
  Undo „Edit SVG Code“ (`ReplaceNode`/`ReplaceAssetMarkup`). Auswahl bleibt, wenn möglich, erhalten.
- Tastatur: ⌘Enter = Apply, Esc = Cancel (mit Rückfrage bei Änderungen); der globale Dispatcher ruht im Editor.
- **Formatierer** (`svg-format.ts`, rein): Einrückung 2, ein Element je Zeile, Attribute in stabiler Reihenfolge
  (Geometrie zuerst), Zahlen gerundet (Präzision einstellbar, Default 3 Nachkommastellen, `-0` → `0`), Kopie als
  „Copy XML“ (006) nutzt ihn. Optional beim Speichern **nicht** angewendet (Roundtrip!).
- **Pfad-Optimierer** (`path-optimize.ts`, rein, übertragen aus `SVGPathOptimizer.swift`/`CGPathSimplify.swift` mit
  Herkunftsvermerk): Ramer-Douglas-Peucker mit Eckenschutz, Zahlen runden, redundante `L`/Null-Segmente entfernen,
  relative/absolute kürzeste Form, Whitespace komprimieren; `epsilon` einstellbar (Default 1.0). Aktion „Optimize
  Path“ für ausgewählte Pfade mit Vorschau (Punktzahl vorher/nachher) und Undo.

## Tests

- Vitest: Formatierer (Fixtures: Ausgabe stabil, idempotent), Optimierer (Fälle aus `SVGPathOptimizerTests` der
  Vorlage + Eigenschaft „Abweichung ≤ epsilon“ per Stichproben auf der Kurve), Lint-Fehlerposition.
- Playwright: Dialog öffnen, Farbe im Quelltext ändern, Apply → Canvas aktualisiert, Undo; ungültiges Markup →
  Apply gesperrt.

## Akzeptanz

- `docs/FEATURES.md` §9 abgehakt. `pnpm check` + `pnpm e2e` grün; Bundle-Budget eingehalten.
