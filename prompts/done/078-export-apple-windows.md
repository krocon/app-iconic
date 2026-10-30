# Prompt 078: Export für Xcode, macOS und Windows; PNG in die Zwischenablage

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 012, 077 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §1.1 Punkt 2 (P2)

## Ziel

Fertige Pakete für Entwickler statt loser PNGs, und das Icon mit einem Kürzel in Slack, PRs oder Figma einfügen.

## Ausgangslage

`ExportDialog` schreibt nur lose `.png` (16–1024) oder `.svg` in einen Ordner.

## Umfang

- **Xcode `AppIcon.appiconset`:** Ordner mit `Contents.json` und PNGs – iOS als Einzelgröße 1024 mit Varianten
  Dark und Tinted (`appearances` / `luminosity`), macOS-Größen 16–512 @1x/@2x, optional watchOS. Regeln mit Quelle
  belegen (Apple-Doku per Websuche prüfen): iOS-Marketing-Icon ohne Alpha (auf Hintergrund flach rechnen, keine
  Maske); macOS mit Maske und Rand nach Apple-Raster. Hinweis im Dialog: Xcode 26 nimmt `.icon` direkt.
- **`.icns`** (macOS) und **`.ico`** (Windows: 16, 24, 32, 48, 64, 256, PNG-kodiert): eigene kleine Writer in
  `ai-core/export/` (Formate sind einfach) oder Crates – Entscheidung in `docs/architecture.md` begründen; Tests
  lesen die Dateien zurück.
- **PNG in die Zwischenablage** (`file.copyPng`, `⇧⌘C` falls frei): Rust rendert (resvg) und legt das Bild in die
  System-Zwischenablage (z. B. `arboard`, mit 071 teilen); Größe wählbar (Standard 1024), aktuelle Appearance.
- **Schnell-Export** (`file.exportAgain`): letzten Export mit denselben Einstellungen wiederholen (Wahl je Dokument
  in der Sitzung, 012).
- Alles mit Fortschritt/Abbruch wie 012 (Channel), atomar, Überschreiben fragen; KI-Argumente in
  `export-action-args` erweitern; Fehlercodes auf beiden Seiten.

## Akzeptanz

- Rust: `Contents.json` gegen Referenz (Schnappschuss), PNG-Größen und Alpha (iOS ohne Alpha), `.icns`/`.ico`
  zurücklesen.
- Vitest: Export-Optionen (rein), Dateinamen.
- Playwright (Fake-Export): Dialog mit neuen Formaten; Ende-zu-Ende im Container: appiconset erzeugen und
  Struktur prüfen. Mac: Xcode-Import als offene Frage im Bericht.
