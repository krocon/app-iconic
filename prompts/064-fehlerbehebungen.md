# Prompt 064: Fehler in vorhandenen Werkzeugen

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 010, 012, 049, 050, 051, 055 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §2.5 (P0, Aufwand S–M)

## Ziel

Die konkreten Fehler aus der Analyse beheben – jeder zuerst mit rotem Test (CLAUDE.md §5).

## Umfang

1. **Gesperrte Objekte werden zerschnitten** (geprüft: `trim/trim-scene.ts` `sceneShapes()` fragt `isLocked()`
   nicht ab). Alle Werkzeuge prüfen, die Geometrie verändern: Trim, Extend, Fillet, Chamfer, Knife, Scissors, Shape
   Builder, Smooth, Corners, Offset, Pathfinder, Join. Gesperrte und ausgeblendete Elemente dürfen **Begrenzung**
   sein (Schnittpunkte), aber nie **Ziel**. Eine gemeinsame Hilfsfunktion statt Prüfungen je Werkzeug.
2. **Display-P3 im Farbwähler** (`inspector/icon-color-text.ts`): P3-Kanäle gehen ungewandelt als Hex an das
   sRGB-`<input type="color">`, sRGB-Werte vom OS-Picker werden ungewandelt als `display-p3:` zurückgeschrieben.
   Umrechnung P3 ↔ sRGB (linearisieren, 3×3-Matrix, Gamma) rein in `shared/`; außerhalb des sRGB-Gamuts
   klemmen und im Feld anzeigen („außerhalb sRGB“); unveränderte Werte nie neu schreiben (Roundtrip).
3. **Pattern-Grenze** (geprüft: Stepper erlaubt `MAX_PATTERN_COPIES + 1`, die Prüfung verlangt beim Kreismuster
   `count <= MAX_PATTERN_COPIES`): eine Definition (zählt das Original mit?), Stepper, Prüfung und
   `shared/geometry/pattern.ts` darauf ausrichten.
4. **Blend-Modes im PNG-Export** (`export-svg.ts` schreibt `style="mix-blend-mode:…"` auf `<g>`). Die Analyse
   behauptet, resvg ignoriere das. **Erst prüfen**: Rust-Test, der ein SVG mit `multiply`-Gruppe über resvg 0.48
   rendert und Pixel vergleicht. Wirkt es, nur den Test behalten; sonst eine resvg-taugliche Schreibweise wählen
   (Attribut oder `<feBlend>`). `plus-darker` folgt in 077.
5. **Drag-Leistung bei großen SVGs mit `opacity`** gehört zu [033](033-haertung-folgen.md) – hier nicht bearbeiten.

## Akzeptanz

- Je Punkt ein zuvor roter Test (Vitest bzw. Rust), danach grün.
- Playwright: gesperrte Linie bleibt nach Trim unverändert, dient aber als Schnittkante; P3-Farbe öffnen, nichts
  ändern, speichern → `icon.json` byte-gleich.
