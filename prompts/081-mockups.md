# Prompt 081: Icon im Kontext – Mockup-Vorschau

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 057, 077 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §1.4 (P3)

## Ziel

Das Icon so sehen, wie es später erscheint: zwischen anderen Icons, vor hellem und dunklem Hintergrund, klein.

## Ausgangslage

`preview/small-preview.ts` zeigt 16/32/64/128 px in der Canvas-Ecke (057).

## Umfang

- **Vorschau-Fenster oder -Panel „Im Kontext“** (`view.mockups`): Szenen macOS-Dock, iOS-Home-Screen (hell/dunkel),
  Spotlight/Mitteilung, Windows-Taskleiste – jeweils in den echten Pixelgrößen, Appearance je Szene (Light/Dark/
  Tinted aus 077).
- **Eigene, neutrale Grafik:** keine Apple-/Microsoft-Hintergründe, -Icons oder -Logos nachbauen (Marken/Lizenz);
  Nachbar-Icons als neutrale Platzhalter oder aus „Zuletzt benutzt“ (eigene Dateien des Nutzers); optional eigenes
  Hintergrundbild über den Öffnen-Dialog (Rust, Grenzen).
- Gerendert aus demselben Export-SVG wie 057 (gedrosselt nach Änderungen).
- „Szene als PNG kopieren/speichern“ für Präsentationen (nutzt 078).

## Akzeptanz

- Vitest: Szenen-Modell (Größen, Positionen), keine fremden Assets im Bundle (Test über `public/`/Assets).
- Playwright: Kreis hinzufügen → alle Szenen aktualisiert; Dark-Szene zeigt Dark-Variante.
