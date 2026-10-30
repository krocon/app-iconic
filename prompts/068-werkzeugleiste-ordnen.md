# Prompt 068: Werkzeuge und Einmal-Aktionen trennen

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 061, 067 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §3.2 (P1)

## Ziel

Eine schlanke Werkzeugleiste mit echten Werkzeugen; Einfüge-Aktionen und Dialoge an ihrem eigenen Ort; die
CAD-Varianten stören Gelegenheitsnutzer nicht.

## Ausgangslage (laut Analyse, zuerst bestätigen)

- `commands/add-layout.ts` (`ADD_LAYOUT`) mischt in denselben Flyouts Ein-Klick-Einfügen („Circle at Center“),
  Aufzieh-Werkzeuge („Rectangle Tool“), Mehrklick-CAD-Werkzeuge („3-Tangent Circle“) und destruktive Befehle/
  Dialoge („Outline Stroke“, „Offset Path…“, „Circular Pattern…“). Für „Rechteck“ gibt es sechs Varianten.
- Rotate (`⇧R`), Scale (`⇧S`), Reflect (`⇧O`) gibt es nur im Menü Arrange, nicht in der Sidebar.
- Kürzelkonflikt in der Analyse: Text und Trim beide `T`.

## Umfang

- **Primäre Werkzeuge** (in dieser Reihenfolge, Gruppen als Flyout mit zuletzt benutztem Unterwerkzeug): Auswahl `V`,
  Direktauswahl `A`, Formen (Rechteck, abgerundet, Ellipse, Polygon, Stern …), Pen `P`, Curvature, Freehand, Text,
  Live Fill `F`, Shape Builder `⇧M`, Trim/Extend/Fillet/Chamfer, Constraints `K`, Rotate/Scale/Reflect, Messen/
  Bemaßen.
- **Sektion „Konstruktion“** (einklappbar, Zustand in den Einstellungen): 2-/3-Punkt-, Mittelpunkt- und
  Tangenten-Varianten aus 019.
- **Einfügen** (Add): Icon-Gruppe, Layer, Grundform in der Mitte, Bild, SVG-Snippet, Symbol – als Liste oder Menü.
- **Ändern** (Modify): Outline Stroke, Offset, Pattern, Corners, Pathfinder, Optimize Path … – im Menü und in der
  Befehlspalette, nicht in der Werkzeugleiste.
- **Aktions-Ids bleiben unverändert** (MCP, Keymaps der Nutzer). Nur Layout, Kategorien und Menüs ändern sich.
- Kürzel: Konflikte auflösen (Vorschlag im Design, alle drei Keymaps), Kürzel-Dialog und `keymaps.test.mjs`
  aktualisieren. Suche in der Sidebar findet weiterhin alles.

## Akzeptanz

- Vitest: Layout-Modell (jede Aktion genau einem Ort zugeordnet, keine Werkzeug-Aktion unter „Ändern“), keine
  doppelten Kürzel je OS.
- Playwright: Rotate-Werkzeug aus der Sidebar; Konstruktion einklappen bleibt nach Neustart (Browser-Modus:
  Fake-Settings); Offset… nur über Menü/Palette erreichbar.
