# Prompt 008: Elemente hinzufügen (Command Sidebar)

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 006 · Meilenstein 5 aus `000-init.md` · legacy §8

## Ziel

Die Command Sidebar (links) und das Menü „Add“ fügen Gruppen, Container und Grundformen mit den Defaults der
Vorlage ein – an der richtigen Stelle, zentriert im sichtbaren Bereich, als eine Undo-Aktion, danach ausgewählt.

## Umfang

- `features/commands/`: Liste der Add-Aktionen (Icon, Titel, Kürzel aus 005), Suche/Filter, Tastaturbedienung.
- **Einfügeort** (`insert-target.ts`, rein + Tests): gewählter Container → hinein (ans Ende); gewählte Node → direkt
  dahinter im selben Eltern; sonst Asset des aktuellen Layers; kein Dokument → neues Dokument anlegen (Design).
- **Zentrum** = Mitte des sichtbaren Canvas-Ausschnitts im Dokumentraum, umgerechnet in das lokale System des Ziels
  (Inverse CTM) – auch bei transformierten Ziel-Gruppen.
- Befehle und Defaults (c = Zentrum, Farbe schwarz wie legacy §8):
  - **Group** = neue Icon-Gruppe in `icon.json` mit einem Layer und neuem Asset `layer-N.svg` (1024er-Viewport),
    eingefügt hinter der Gruppe des aktuellen Layers; Namen über `unique_*` (002).
  - **Container** `<g>`, **Circle** r 128, **Ellipse** 160 × 120, **Rectangle** 256 × 256, **Path** (Dreieck ±140),
    **Line** ±160 stroke 12 round, **Polyline** (3 Punkte, stroke 10 round/round), **Polygon** (Dreieck ±160),
    **Text** „Text“, Schrift-Stack `system-ui, -apple-system, 'SF Pro', sans-serif`, 160, 400 (statt fest „SF Pro“).
  - **Image** (⌘I): Bild wählen (Rust-Dialog, ≤ 20 MiB, PNG/JPEG/WebP/SVG), als `<image href="data:…">` mit
    natürlicher Größe, eingepasst auf max. 512, zentriert.
  - **SVG Snippet**: Dialog „Paste SVG markup to append“ (Textarea, Live-Fehler), parsen, bereinigen, Nodes
    extrahieren (Wurzel-`<svg>` entpacken, `defs` mitnehmen, IDs eindeutig machen), auf die Bounds zentrieren,
    einfügen.
  - Freehand, Text to Path, Symbol: Einträge sichtbar, Umsetzung in 013.

## Tests

- Vitest: Einfügeort-Regeln, Default-Geometrie je Befehl (Tabelle), eindeutige Namen, Snippet-Extraktion
  (mehrere Wurzeln, `defs`, ID-Kollision, bösartiges Markup).
- Playwright: Rechteck in eine rotierte Gruppe einfügen → erscheint zentriert im sichtbaren Ausschnitt; Undo
  entfernt es; Group legt Gruppe + Layer + Asset an (icon.json-Vorschau/Store prüfen).

## Akzeptanz

- `docs/FEATURES.md` §5 (ohne Freehand/Text→Pfad/Symbol) abgehakt. `pnpm check` + `pnpm e2e` grün.
