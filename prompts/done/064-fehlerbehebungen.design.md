# Design 064: Fehler in vorhandenen Werkzeugen

> Prompt: [064-fehlerbehebungen.md](064-fehlerbehebungen.md) · Stand: 30.10.2026

## Befunde und Entscheidungen

1. **Gesperrte Objekte** – bestätigt: Trim (`sceneShapes`), Fillet (`near`) und alle auswahlbasierten Werkzeuge
   veränderten gesperrte Knoten, sobald der Baum sie auswählte (der Canvas lässt sie nicht auswählen).
   - **E1** `editableRefs(doc, refs)` in `lock/lock.ts` (eine Hilfsfunktion): `PathEditService.targets()` (damit
     Pathfinder, Shape Builder, Cuts/Knife, Offset, Anker/Schere/Smooth/Radierer, In Pfad umwandeln),
     `TransformService.refs()` (Transform-Werkzeug/-Dialog; Box-Kopf 062 prüfte schon), Corners (Anwenden,
     `canApply`, Widgets).
   - **E2** `SceneShape.locked`: Trim und Extend schneiden **an** gesperrten Umrissen, aber nie **sie**; Fillet/
     Chamfer bieten sie nicht an. Live Fill nutzt gesperrte Umrisse weiter als Begrenzung (gewollt).
2. **Display-P3 im Farbwähler** – bestätigt für den nativen Picker. **E3** Der Picker bekommt sRGB
   (`srgbHexOf`: P3 → sRGB, geklemmt) und schreibt umgerechnet zurück (`withSrgbHex`: sRGB → P3; erweitertes P3
   behält Werte außerhalb 0…1, normales P3 wird geklemmt). Das Hex-**Textfeld** bleibt bei den Kanälen der Datei
   (design 010 E8, Icon-Composer-Kanäle exakt tippbar); Werte werden nur bei einer Änderung geschrieben
   (Roundtrip unverändert). Liegt eine P3-Farbe außerhalb von sRGB, zeigt das Feld „⚠“ mit Erklärung.
3. **Pattern-Grenze** – bestätigt. **E4** `patternValid` (rein): Anzahl (kreisförmig) und Spalten × Zeilen zählen
   das Original mit, beide bis `MAX_PATTERN_COPIES + 1` – wie Stepper und KI-Argumente.
4. **Blend-Modes im PNG-Export** – **widerlegt**: resvg 0.48 rendert `style="mix-blend-mode:…"` auf `<g>` und
   verschachteltem `<svg>` (Rust-Test `blend_modes_in_a_style_attribute_are_rendered`: multiply Cyan auf Gelb =
   Grün, screen Blau auf Rot = Magenta). Keine Änderung; `plus-darker` folgt in 077.
5. Drag-Leistung: Prompt 033.

## Tests (zuerst rot)

- Playwright: `trim.spec` (gesperrte Linie leuchtet nicht auf, bleibt beim Klick, schneidet aber die andere –
  ohne Fix rot), `fillet.spec` (`fillet.at` auf gesperrter Linie ändert nichts – ohne Fix rot), `corners.spec`
  (über den Baum ausgewähltes gesperrtes Rechteck: `corners.set` → `false` – ohne Fix rot).
- Vitest: `lock.spec` (`isLocked`, `editableRefs`), `icon-color-text.spec` (P3 ↔ sRGB, außerhalb, Textfeld
  unverändert), `pattern-dialog.spec` (Grenzen).
- Rust: Blend-Modes im PNG.
