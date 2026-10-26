# Prompt 017: Härtung und Feature-Parität

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 002–016 · legacy §1–§13

## Ziel

Abschluss: Ist alles aus `docs/FEATURES.md` da und robust? Ein **separater Agent**, der die Arbeit nicht gemacht
hat, prüft gegen die Vorlage und die Checkliste; gefundene Lücken werden behoben oder als Folge-Prompt notiert.

## Umfang

- **Parität:** `docs/FEATURES.md` Punkt für Punkt Ende-zu-Ende prüfen (Playwright + echte App unter Xvfb),
  Matrix `docs/parity.md` (Feature, Vorlage, Neuauflage, Test, Abweichung mit Begründung).
- **Review** durch einen separaten Agenten (Code + Verhalten): Architekturregeln (CLAUDE.md §4: kein eigener Parser,
  Geometrie nur über CTM, Commands async, keine WebView-Rechte), Dateien > 400 Zeilen, tote Pfade, Fehlertexte.
- **Feindliche Dateien:** ZIP-Bomben, Zip-Slip, riesige/tief verschachtelte SVGs, `<script>`/Event-Handler/externe
  Referenzen, ungültiges `icon.json`, fehlende Assets, sehr lange Namen, Unicode – je Fall ein Test, nichts stürzt ab.
- **Performance:** großes SVG (≥ 5 MB, ≥ 20 000 Nodes, Generator in `scripts/`): Öffnen, Zoom/Pan, Auswahl, Ziehen
  mit Snap (Ziel ≥ 50 fps), Hierarchie (virtualisiert); Messungen in `docs/architecture.md`.
- **Roundtrip-Garantie:** alle Fixtures und ein Icon-Composer-Beispiel mit allen Feldern: öffnen → bearbeiten an
  einer Stelle → speichern → nur diese Stelle geändert (Diff-Test).
- **Barrierefreiheit:** Tastaturbedienung aller Panels, Fokus sichtbar, Dialoge, Kontraste hell/dunkel.
- Doku: README mit Screenshots, CLAUDE.md, `docs/architecture.md`, `prompts/README.md` aktuell.

## Akzeptanz

- `docs/parity.md` vollständig, alle Checkboxen in `docs/FEATURES.md` abgehakt oder begründet offen;
  `pnpm check` + `pnpm e2e` grün; Review-Befunde erledigt oder als Prompt erfasst.
