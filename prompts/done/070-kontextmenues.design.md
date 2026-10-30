# Design 070: Kontextmenü auf dem Canvas, einheitlich mit dem Baum

> Prompt: [070-kontextmenues.md](070-kontextmenues.md) · Stand: 30.10.2026

## Ausgangslage (bestätigt)

- Die Zeichenfläche öffnete bei Rechtsklick kein Menü (das Browsermenü war unterdrückt).
- Das Baum-Menü hatte acht fest verdrahtete Einträge.

## Entscheidungen

- **E1 Ein Modell** (`menus/context-menu-model.ts`, rein): `contextMenuFor(target)` liefert Einträge aus Aktions-Ids
  (optional Argumente, Beschriftung, Trenner, eine Ebene Untermenü). Ziele: `nodes` (Auswahl vorhanden: Cut/Copy/
  Paste/Duplicate/Delete…, Group/Ungroup, Anordnen ▸, Sperren/Isolieren/Sichtbarkeit, In Pfad umwandeln,
  Pathfinder ▸, Offset, Ecken, Als Clip Path, SVG bearbeiten…, XML kopieren), `items` (Baum ohne SVG-Auswahl:
  Icon-Gruppen/Layer – Duplizieren, Löschen, Sichtbarkeit, Verschieben, neue Icon-Gruppe), `empty` (Einfügen, Alles
  auswählen, Ansicht einpassen/100 %, Hilfslinien sperren, Konstruktionslinien), `tool` (Fertig, Auswahl V/A).
  Ob ein Eintrag geht, entscheidet die Aktion (`enabled`) – deaktivierte Einträge werden **ausgegraut**, nie verborgen.
- **E2 Ausführung** nur über `ActionService.run(id, args)`; das Menü emittiert den Eintrag, der Aufrufer gibt den Fokus
  zurück und führt aus.
- **E3 Canvas:** Rechtsklick (macOS auch `Ctrl+Klick`, beides ist `contextmenu`) macht den Hit-Test aus 007; ein nicht
  gewähltes Element wird zuerst gewählt (im Bearbeitungskontext), leere Fläche öffnet `empty`. **Während eines
  Werkzeugs** öffnet das Werkzeug-Menü (`tool`) – Rechtsklick wird nicht an das Werkzeug durchgereicht, die Optionen
  stehen in der Kontextleiste (067).
- **E4 Tastatur:** `Shift+F10` und die Kontextmenütaste (Aktion `canvas.menu`, Kontext `canvas`) öffnen das Menü an der
  Auswahl (Mitte oben der Auswahl-Box, sonst Mitte der Fläche). APG-Menu: ↑/↓/Home/End, Enter/Space, → öffnet ein
  Untermenü (auch Hover/Klick), ← und Esc gehen zurück, Esc/Tab/Klick daneben schließen. Im Baum bleibt `Shift+F10`
  wie bisher und öffnet nun dasselbe Modell.
- **E5 Ereignisse:** Das Canvas-Menü liegt im Viewport; Zeiger-Ereignisse im Menü werden dort angehalten, damit der
  Viewport (Auswahl, Rahmen) einen Klick auf einen Menüeintrag nicht als Klick ins Leere wertet.

## Tests

- Vitest: `context-menu-model.spec` (je Ziel, alle Ids im Katalog, Untermenüs), `hierarchy-tree.spec` (Menü aus dem
  Modell, Delete… und Arrange ▸, ausgegraut).
- Playwright `e2e/context-menu.spec.ts`: Rechtsklick wählt + Menü, „Ungroup“ ausgegraut bei Einzelauswahl; zwei Formen
  → Pathfinder ▸ Unite; leere Fläche; `Shift+F10` an der Auswahl, Anordnen ▸ per Tastatur, Fokus zurück.
