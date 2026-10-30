# Design 068: Werkzeuge und Einmal-Aktionen trennen

> Prompt: [068-werkzeugleiste-ordnen.md](068-werkzeugleiste-ordnen.md) · Stand: 30.10.2026

## Entscheidungen

- **E1 Abschnitte** (`ADD_LAYOUT`, eine Quelle für Sidebar und Menüs):
  - **Auswahl:** V, A (061).
  - **Werkzeuge:** Formen ▸ (alle Zieh-Werkzeuge aus 041/044: Rechteck, abgerundet, Ellipse, Polygon, Stern, Linie,
    Bogen, Spirale, Raster), Zeichenstift ▸ (Pen, Curvature), Freihand, Füllen, Shape Builder, Pfad bearbeiten ▸
    (Trim, Extend, Fillet, Chamfer, Anker, Schere, Glätten, Radierer), Schneiden ▸, Transformieren ▸ (Rotate, Scale,
    Reflect – vorher nur im Arrange-Menü), Abhängigkeiten, Messen ▸.
  - **Konstruktion** (einklappbar, `sidebar.constructionOpen` in `settings.json`, Standard zu): Linie, Rechteck,
    Kreis, Bogen, Polygon in den Varianten aus 019.
  - **Einfügen:** Icon-Gruppe, Container, Form in der Mitte ▸, Text, Text in Pfad, Symbol, SVG-Schnipsel, Bild.
  - **Ändern:** Offset, Kontur in Fläche, Ecken, Pfad optimieren, Verbinden, In Pfad umwandeln, Muster ×3, Klonen,
    Abhängigkeiten lösen, Füllung lösen – in der Sidebar nur beim Filtern, sonst im neuen Menü **Modify** (dazu
    Pathfinder ▸) und in der Palette.
- **E2 Menüs:** „Add“ = Werkzeuge · Konstruktion · Einfügen; „Modify“ neu (die Einträge kamen aus Edit); Rotate/Scale/
  Reflect nur noch in Add (kein Befehl doppelt – native Menüs registrieren Kürzel einmal).
- **E3 Aktions-Ids unverändert** (Keymaps der Nutzer, MCP); Kürzel unverändert. Ein Konflikt T (Text/Trim) bestand
  nicht – Text hat kein Kürzel; ein Text-Werkzeug folgt in 075.
- **E4 Einklappen:** die Kopfzeile ist eine Option der Liste (Pfeiltasten, Enter klappt) bzw. ein Knopf in der
  eingeklappten Leiste (`aria-expanded`).

## Tests

- Vitest: `command-sidebar.spec` (neue Reihenfolge, Konstruktion zu/auf + Einstellung, Filter findet auch „Ändern“,
  Tastatur, eingeklappte Leiste), `menu-model.spec` (Add-Untermenüs, Modify ohne Werkzeuge, kein Befehl doppelt),
  `app.spec` (sieben Menüs).
- Playwright `toolbar-layout.spec`: Rotate aus der Sidebar, Offset nur über Filter/Menü; Konstruktion bleibt nach
  Neustart offen.
