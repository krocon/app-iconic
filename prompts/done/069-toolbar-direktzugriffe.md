# Prompt 069: Direktzugriffe in Canvas- und App-Toolbar

> Lies zuerst [000-arbeitsweise.md](../000-arbeitsweise.md). Braucht: 004, 012, 015 · Quelle:
> [Analyse 30.10.2026](../2026.10.30%20-%20analyse.md) §3.4 (P1)

## Stand

- ✅ 30.10.2026: Segmented Controls für Erscheinungsbild und Maske, Speichern + Export… in der App-Toolbar, Undo/Redo
  nur dort, Umbruch in schmalen Fenstern. Entscheidungen in `docs/architecture.md` (069 E1–E3).

## Ziel

Die häufigsten Icon-Umschalter und Export mit einem Klick; keine doppelten Schaltflächen.

## Ausgangslage (laut Analyse, zuerst bestätigen)

- Appearance (Light/Dark) und Plattform-Maske (Squircle/Circle/None) stehen unten in einem 27-zeiligen
  „View Options ▾“-Menü (`canvas/view-options-menu.ts`).
- Undo/Redo stehen in der App-Kopfzeile (`app.ts`) und direkt darunter noch einmal im Kopf des Properties-Panels.
- Kein sichtbarer Export-Knopf.

## Umfang

- **Segmented Controls in der Canvas-Toolbar:** Appearance (Light | Dark; Tinted folgt mit 077) und Maske
  (Squircle | Circle | None), als APG-Radiogroup mit Pfeiltasten, Tooltips mit Kürzel. Dieselben Aktionen wie im
  Menü (eine Quelle); die Einträge im View-Options-Menü bleiben für die Tastatur, das Menü wird nach Häufigkeit
  geordnet.
- **App-Toolbar:** Undo/Redo an genau einer Stelle (Empfehlung: App-Toolbar, weil sie sichtbar bleibt, wenn das
  Properties-Panel mit ⌘3 ausgeblendet ist); daneben **Speichern** (mit Dirty-Punkt) und **Export…**. Im Design
  begründen, falls anders.
- Schmale Fenster: Toolbar bricht sinnvoll um bzw. blendet Beschriftungen aus (kein horizontales Scrollen).

## Akzeptanz

- Vitest: Toolbar-Modell, Radiogroup-Tastatur.
- Playwright: Klick auf „Dark“ schaltet Vorschau und Menühaken; Export… öffnet den Dialog; keine zwei
  Undo-Schaltflächen im DOM; Kontrast/Fokus light und dark (a11y-Test aus 031 erweitern).
