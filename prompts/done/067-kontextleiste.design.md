# Design 067: Einheitliche Kontextleiste

> Prompt: [067-kontextleiste.md](067-kontextleiste.md) · Stand: 30.10.2026

## Entscheidungen

- **E1 Ort:** `ContextBar` liegt oben in der Zeichenfläche über dem Canvas (absolut, mit Schatten) – kein Layout-Sprung
  beim Ein-/Ausschalten (Zoom und Pan bleiben). Gezeigt für das aktive Werkzeug (`activeToolId` aus 061, ohne die
  Auswahlwerkzeuge) und für den Clip-Bearbeitungsmodus (014).
- **E2 Daten statt Komponenten je Werkzeug:** `ToolContext { options: ToolOption[], tip?, note?, testId? }`,
  `ToolOption { key, label, kind: number|color|toggle|choice, min/max/step, choices, value(), set(v) }`. Features
  registrieren Provider in `ToolContexts`; die Provider stehen gesammelt in `tools/tool-context-providers.ts` und lesen/
  schreiben die vorhandenen Signale: Zeichenwerkzeuge (`sketch.*`, Pen, Curvature) → Füllung, Kontur, Stärke aus dem
  Stil-Gedächtnis ihrer Form (`settings.drawing.styles`, d. h. für alle Fenster), Zieh-Werkzeuge mit Zähler → Ecken/
  Zacken/Windungen/Teilungen/Eckenradius (`SketchStore.setCount`, neu); Freehand → Glättung, Stärke, geschlossen;
  Fillet/Chamfer → Radius/Abstand (`FilletService.size` – der Dialog startet damit, die Leiste stellt ihn vor dem
  Klick ein); Abhängigkeiten → Beziehung (Knöpfe mit Symbolen wie vorher); Füllen → Farbe + „offene Fläche“.
- **E3 KI-fähig:** `tool.option { key, value }` setzt eine Option des aktiven Werkzeugs über dieselbe `set`-Funktion
  (prüft Typ und Bereich), `tool.done` beendet das Werkzeug (Clip: verlässt den Modus), `tool.focusOptions` (F6)
  bringt die Tastatur in die Leiste, Esc dort zurück auf die Zeichenfläche (das Werkzeug bleibt an).
- **E4 Abgelöst:** Freehand-Optionen in der Canvas-Toolbar (`freehand-options.ts` gelöscht), die schwebenden Leisten
  von Abhängigkeiten (K) und Füllen (F), das Clip-Banner. Test-Ids blieben, wo Tests sie nutzen (`freehand-options`,
  `freehand-closed`, `constraint-bar` mit `data-type`, `fill-color`, `clip-banner`).
- **E5 Statuszeile** behält Koordinaten, Zoom und die Schritt-Hinweise der Werkzeuge; die Leiste zeigt rechts einen
  kurzen Tipp (Modifier).

## Tests

- Vitest `tool-context-providers.spec`: alle Zeichenwerkzeuge haben Füllung/Kontur/Stärke, Schreiben ins
  Stil-Gedächtnis mit Prüfung, Zähler, Fillet-Radius, Freehand, Beziehung, Füllfarbe; Aktionen im Katalog.
- Playwright `context-bar.spec`: Fillet-Radius 20 vor dem Klick → Verrundung 20; Rechteck-Werkzeug: Füllung und
  (per `tool.option`) Stärke in der Leiste → neue Form hat sie; sechs Werkzeuge zeigen Leiste mit Namen, „Fertig“
  beendet; F6 und Esc. Bestehende Tests (Freehand, K, F, Clip) laufen mit der Leiste weiter.
