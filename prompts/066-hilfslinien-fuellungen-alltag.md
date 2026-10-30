# Prompt 066: Hilfslinien, Bemaßungen und Live-Füllungen im Alltag

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 006, 048, 055, 056, 060 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §2.4 (P0/P1)

## Ziel

Hilfsobjekte verhalten sich wie Hilfsobjekte: Sie werden nicht versehentlich mitgewählt und sind als solche
erkennbar; Live-Füllungen erklären sich selbst.

## Ausgangslage (laut Analyse, zuerst bestätigen)

- Hilfslinien aus dem Lineal (`guides/guide.service.ts`) sind gewöhnliche `<line>` im aktiven Asset: `⌘A` und
  Rahmenauswahl erfassen sie, sie werden mitverschoben oder gelöscht.
- Im Baum heißen Hilfslinien `line`, Bemaßungen `g · 2`, Live-Füllungen `path` (`node-label.ts`).
- Das Properties-Panel warnt bei einer Live-Füllung nicht, dass Pfadänderungen überschrieben werden, und bietet
  „Füllung lösen“ (`fill.detach`) nicht an.
- Öffnet sich eine Begrenzung, behält `LiveFillService.follow()` still die alte Form.

## Umfang

- **Hilfslinien geschützt:** nicht in `edit.selectAll`, Rahmenauswahl und normalem Hit-Test, solange
  „Hilfslinien sperren“ an ist (Standard an); ziehbar im Lineal-Modus wie in 056. Aktionen `guides.lock` (Schalter),
  `guides.clear` (alle im Dokument, ein Undo-Schritt), `guides.show` (falls nicht vorhanden). Menü View › Guides.
- **Kennzeichnung:** eigene Labels und Icons im Baum für Hilfslinie, Bemaßung (mit Wert, z. B. „Maß 120“),
  Konstruktion (049/058), Live-Füllung, Clip; Texte aus Katalogen (EN + DE).
- **Live-Füllung im Panel:** Hinweisleiste („wird aus den Begrenzungen berechnet“), Schaltfläche „Füllung lösen“,
  Farbe bleibt editierbar; das `d`-Feld schreibgeschützt.
- **Eingefrorene Füllung melden:** LiveFillService kennt je Füllung den Zustand `live | stale` (zur Laufzeit,
  nicht gespeichert); `stale` → Warnsymbol im Baum, Hinweis im Panel und im Overlay des Werkzeugs `F`, mit Angebot
  „lösen“ oder „entfernen“.

## Akzeptanz

- Vitest: Auswahlfilter (selectAll ohne Hilfslinien), Labels, stale-Erkennung.
- Playwright: Hilfslinie ziehen, `⌘A`, verschieben → Hilfslinie bleibt; `guides.clear` + Undo; Dreieck füllen,
  eine Linie wegziehen → Warnsymbol; Lösen → normale Fläche ohne `data-live-fill`.
