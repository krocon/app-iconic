# Prompt 061: Auswahlwerkzeug und sichtbarer Werkzeugstatus

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 005, 007, 008 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §3.1 (P0, Aufwand S)

## Ziel

Jederzeit mit einem Klick oder einer Taste zurück zur normalen Auswahl – und immer sehen, welches Werkzeug aktiv ist.

## Ausgangslage (geprüft am 30.10.2026)

- Es gibt kein Auswahl-/Zeigerwerkzeug: weder in der Command Sidebar noch in `keymap.base.json` (kein `v`/`a`).
  Aus Pen, Trim, Constraint, Live Fill … kommt man nur per `Esc` (oft zweimal) oder über dasselbe Werkzeug zurück.
- `CommandSidebar` (`command-sidebar.ts`/`.html`) liest `checked` der Aktionen nicht aus – weder in der offenen
  Liste noch in der eingeklappten 40-px-Leiste. `add.freehand` meldet nicht einmal `checked`.
- Die Auswahlmodi stehen versteckt unter View › Selection Mode › Point / Boxed / None.

## Umfang

- **Werkzeugzustand an einer Stelle:** ein Root-naher `ToolStore` je Fenster (oder Erweiterung eines vorhandenen
  Stores) mit genau einem aktiven Werkzeug; alle Werkzeuge (Freehand, Sketch, Pen, Curvature, Trim, Fillet,
  Constraint, Live Fill, Clip-Bearbeitung, Messen, Bemaßen, Shape Builder, Knife, Scissors, Smooth, Rotate/Scale/
  Reflect …) melden sich dort an und ab. Werkzeugwechsel beendet das vorige sauber (Teilgeste verwerfen, kein
  halber Undo-Schritt). Bestehende Stores nicht umbauen, nur anbinden.
- **Auswahl (`V`)**: Box/Verschieben – entspricht Selection Mode „Boxed“. **Direktauswahl (`A`)**: Punktmodus –
  entspricht „Point“. Beide an erster Stelle der Sidebar, als Aktionen `tool.select` und `tool.direct` mit
  `checked`. View › Selection Mode bleibt als Menü, zeigt aber denselben Zustand (eine Quelle).
- `Esc` bleibt zweistufig (Teilgeste → Werkzeug beenden), landet am Ende immer bei `tool.select`.
- **Aktiv-Status sichtbar:** aktive Zeile/Schaltfläche mit Akzentfarbe (Token aus `styles.css`, Kontrast light/dark
  prüfen), `aria-pressed="true"`; bei Gruppen-Schaltflächen (Flyouts) zeigt die Gruppe Icon und Status des zuletzt
  bzw. aktuell gewählten Unterwerkzeugs. Alle Werkzeug-Aktionen liefern `checked` (auch `add.freehand`).
- Statuszeile nennt das aktive Werkzeug.
- Kürzel `v`/`a` nur ohne Modifier und nicht in Textfeldern (KeyboardDispatcher-Regeln wie bei `K`/`F`); Konflikte
  mit vorhandenen Einzeltasten prüfen und im Design auflösen. Namen in `action-catalog.de.ts`.

## Akzeptanz

- Vitest: ToolStore (Wechsel beendet Vorgänger, Esc-Kette, `checked` aller Werkzeug-Aktionen – Test über den
  ganzen Katalog: jede Aktion mit Kategorie „Werkzeug“ hat `checked`), Sidebar rendert `aria-pressed`.
- Playwright: Pen aktiv → `V` → Klick wählt aus; Gruppen-Schaltfläche zeigt aktives Unterwerkzeug, auch eingeklappt;
  `A` → Punkte einer Form sichtbar.
- MCP: `tool.select` über die KI erreichbar (Schnappschuss `tools.snapshot.json` aktualisieren, falls betroffen).
