# Prompt 071: Dateien ins Fenster ziehen, Bilder aus der Zwischenablage

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 003, 008, 030 · Beachten: Pfadregel aus
> [033](033-haertung-folgen.md) · Quelle: [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §1.9 (P1)

## Ziel

`.icon`, `.svg`, `.png`/`.jpg` aus Finder/Explorer ins Fenster ziehen; kopierte Bilder und Screenshots mit `⌘V`
einfügen.

## Ausgangslage (geprüft am 30.10.2026)

- `src-tauri/src/lib.rs` behandelt `WindowEvent::DragDrop` nicht; `dragDropEnabled` ist nicht gesetzt (Tauri-Standard
  an, Ereignisse gehen ins Leere). Der Baum zieht mit Pointer-Ereignissen, nicht mit HTML5-DnD – Windows-Eigenheit
  von `dragDropEnabled` trotzdem prüfen.
- `ClipboardApi` liest nur Text (`navigator.clipboard.readText()`).

## Umfang

- **Rust:** DragDrop-Ereignis (Enter/Over/Drop/Leave) an das Fenster weiterreichen; Pfade gelten als vom Nutzer
  gewählt (in die erlaubte Menge aus 033 aufnehmen, falls 033 schon umgesetzt ist, sonst vorbereiten).
- **Frontend:** Ablage-Hinweis über dem Canvas während des Ziehens (Position = Einfügeort).
  - `.icon` → in neuem Fenster öffnen (wie Öffnen; unberührtes neues Dokument wird ersetzt, 003).
  - `.svg` → wie Import SVG an der Ablageposition (Größen-/Grenzregeln aus 002, Bereinigung aus 003).
  - `.png`/`.jpg` → wie Add › Image (008) an der Position; mit 080 zusätzlich „als PNG-Layer“ (Modifier oder
    Rückfrage).
  - Mehrere Dateien: nacheinander, ein Undo-Schritt je Datei; unbekannte Typen → Hinweis.
- **Bild-Zwischenablage:** `⌘V` prüft zuerst Bild, dann Text (Reihenfolge im Design begründen). Bild lesen in Rust
  (Plattform-Zwischenablage, z. B. `arboard` – neue Abhängigkeit in `docs/architecture.md` begründen) oder über
  `navigator.clipboard.read()` mit Prüfung in WKWebView/WebView2/WebKitGTK; Sicherheitsregel aus CLAUDE.md §4: kein
  Tauri-Clipboard-Plugin für die WebView. Größe begrenzen, Magic Bytes prüfen wie `image_file`.
- Fassade erweitern (`ClipboardApi.readImage()`), Fake + DTOs auf beiden Seiten, neue Fehlercodes in `error.rs`,
  `fs-error.ts`, `describeFsError()`.

## Akzeptanz

- Rust: Drop-Pfade landen in der erlaubten Menge; Bild aus Zwischenablage mit Grenzen (Test mit Fake-Quelle).
- Vitest: Typ-Weiche, Einfügeort aus Ablagepunkt.
- Playwright (Browser-Modus mit Fake-Ereignis): SVG ablegen → Element an der Position; Bild einfügen → `<image>`.
- Ende-zu-Ende im Container (Xvfb) soweit möglich; Mac/Windows-Prüfung als offene Frage im Bericht.
