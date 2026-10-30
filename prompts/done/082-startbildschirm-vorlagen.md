# Prompt 082: Startbildschirm mit zuletzt benutzten Icons und Vorlagen

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 003, 015, 056 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §1.11 (P3)

## Ziel

Beim Start ohne Datei sofort ins Richtige: ein zuletzt bearbeitetes Icon oder eine passende Vorlage.

## Ausgangslage

`FilesService.start()` öffnet ohne Datei sofort ein leeres Dokument.

## Umfang

- **Startbildschirm** (im Fenster, kein Modal): zuletzt benutzte Icons mit **Vorschaubild**, Name, Ort; Vorlagen;
  „Leeres Icon“, „Öffnen…“. Tastatur und Screenreader (Grid-Muster). Einstellung „Beim Start: Startbildschirm |
  leeres Dokument“ (`settings.json` beidseitig + `settings-cases.json`); auch über File › New from Template….
- **Vorschaubilder:** beim Speichern ein kleines PNG (z. B. 128 px) in einen Cache im App-Konfig-Verzeichnis (Rust,
  atomar, Größe begrenzt, aufräumen mit `recent.json`); nie ins `.icon` schreiben.
- **Vorlagen:** iOS-App-Icon mit Keylines (Hilfslinien/Raster aus 056), macOS-Squircle mit Schatten, watchOS rund,
  Light/Dark-Paar. Als `.icon` im Bundle der App (Ressource) oder aus TS erzeugt – im Design entscheiden; Format
  konservativ, eigene Inhalte (keine fremden Logos). Neues Dokument aus Vorlage ist „unbenannt“.

## Akzeptanz

- Rust: Thumbnail-Cache (schreiben, begrenzen, aufräumen), Einstellung.
- Vitest: Startlogik (argv-Datei → kein Startbildschirm, 030), Vorlagenliste.
- Playwright: Start im Browser-Modus zeigt Startbildschirm; Vorlage öffnen → Dokument „Unbenannt“ mit Keylines.
