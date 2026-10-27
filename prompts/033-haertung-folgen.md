# Prompt 033: Folgen aus dem Review von 031

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 031 · Befunde in [031-Design](done/031-haertung-paritaet.design.md)

## Ziel

Die Befunde des Reviews aus 031, die dort bewusst nicht mehr behoben wurden.

## Umfang

- **Pfade nur aus vertrauten Quellen (Befund 6, Tiefenverteidigung):** `open_icon`, `save_icon`, `read_svg_file`,
  `read_image_file`, `export_*` nehmen heute jeden absoluten Pfad. Rust führt eine Menge erlaubter Pfade: Antworten
  der `pick_*`-Dialoge, „Open Recent“, argv/`RunEvent::Opened`, vom Nutzer erlaubte KI-Zugriffe, Pfade offener
  Dokumente; alles andere → `FsError { code: "not_allowed" }` (neu in `error.rs`, `fs-error.ts`,
  `describeFsError()`). Vorbild: `reveal.rs` (nur exportierte Dateien).
- **Eigene Transform-Rechnung (Befund 11):** `properties/transform-list.ts` (`setPivot`, `stepMatrix`/`listMatrix`)
  rechnet Matrizen aus selbst geparstem `transform`-Text. Auf `SVGTransformList`/`DOMMatrix` des Browsers umstellen
  (CLAUDE.md §4), die reinen Tests als Playwright-Fälle behalten.
- **Dateien über ~400 Zeilen (Befund 14, ohne Tests):** `src-tauri/src/mcp.rs` (Argumentprüfung ↔ Router),
  `src-tauri/core/src/settings.rs`, `src-tauri/src/commands.rs` (Fenster- und Menü-Commands in eigene Dateien),
  `src/app/core/actions/action-catalog.ts` (je Bereich), `canvas-view.ts`, `edit.service.ts` – teilen, ohne Verhalten
  zu ändern.
- **Leistung auf echter Hardware:** die Messung aus `e2e/hardening.spec.ts` auf Marcs Mac (WKWebView, GPU) wiederholen
  und in `docs/architecture.md` „Performance“ eintragen; liegt Ziehen mit Snap unter 50 fps, die Ursache messen
  (eigene Ebenen durch `opacity`, Neuaufbau der Auswahl-Overlays) und beheben.

## Akzeptanz

- Befunde 6, 11, 14 erledigt, Messung eingetragen; `pnpm check` + `pnpm e2e` grün.
