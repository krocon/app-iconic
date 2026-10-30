# Prompt 070: Kontextmenü auf dem Canvas, einheitlich mit dem Baum

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 005, 006, 061 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §3.4 (P1)

## Ziel

Rechtsklick auf dem Canvas bietet die passenden Befehle zur Auswahl; der Baum nutzt dasselbe Menü.

## Ausgangslage (laut Analyse, zuerst bestätigen)

- `canvas-view.ts` öffnet bei Rechtsklick kein Menü.
- Das Baum-Kontextmenü (`hierarchy/context-menu.ts`) hat 8 feste Einträge.

## Umfang

- **Ein Menümodell** (rein, aus Aktions-Ids wie das Hauptmenü in 005), abhängig von der Auswahl: Ausschneiden/
  Kopieren/Einfügen/Duplizieren/Löschen; Gruppieren/Gruppierung aufheben; Anordnen ▸ (vorn/hinten); Sperren,
  Isolieren, Ein-/Ausblenden; In Pfad umwandeln; Pathfinder ▸; Versatz…, Ecken…; Als Clip Path verwenden;
  SVG bearbeiten…; bei Layer/Gruppe deren Befehle (Umbenennen, neuer Layer …). Deaktivierte Einträge ausgrauen
  statt verbergen.
- **Canvas:** Rechtsklick auf ein nicht ausgewähltes Element wählt es zuerst (Hit-Test aus 007), auf leerer Fläche
  Menü für Einfügen/Alles auswählen/Ansicht. Während eines Werkzeugs: Werkzeug-Menü (Fertig, Optionen) oder
  durchreichen – im Design entscheiden.
- **Baum:** das alte Menü durch das Modell ersetzen.
- Tastatur: `Shift+F10` und Kontextmenütaste öffnen das Menü an der Auswahl; APG-Menu-Muster (Pfeile, Esc,
  Untermenüs); macOS `Ctrl+Klick`.
- Ausführung nur über `ActionService.run(id, args)`.

## Akzeptanz

- Vitest: Menümodell je Auswahl (leer, ein Pfad, zwei Formen, Gruppe, Layer, gesperrt), alle Ids existieren im
  Katalog.
- Playwright: Rechtsklick auf Kreis → Auswahl + Menü → „Gruppieren“ ausgegraut bei Einzelauswahl; zwei Formen →
  Pathfinder ▸ Vereinigen; `Shift+F10` im Baum öffnet dasselbe Menü.
