# Prompt 087: Bild nachzeichnen – Pixel in Vektoren (wie von Hand)

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 018, 071, 080 · Design:
> [087-digitizing-image.design.md](087-digitizing-image.design.md) · Beispielbild: [087-img.png](087-img.png)

## Marcs Frage (02.11.2026)

> ich hätte gern eine Funktion, die ein Bild (aus der zwischenablage oder aus einer Datei) einliest und die
> Pixelwerte in unser Vektorformat in einem neuen Layer umwandelt.
>
> Quasi so, als würde ein guter User dies per Hand eingeben.
>
> Kann man eine solche Funktion bauen?
>
> nimm als Beispiel Bild: 087-img.png

Antwort (Chat 02.11.2026): ja, in drei Stufen – Marc: „bitte setze a, b und c um“.

## Ziel

Ein Rasterbild (Datei, Zwischenablage, PNG-Ebene) wird zu einer neuen SVG-Ebene.

- **Stufe A – Nachzeichnen:** Farbflächen und Umrisse wie Illustrators Bildnachzeichner (Kurven, gerade Kanten,
  Pixelstufen, Schwarzweiß), offline, deterministisch.
- **Stufe B – Formen erkennen:** Rechtecke, abgerundete Rechtecke, Ellipsen und Kreise als echte Elemente,
  Farbverläufe als `linearGradient` statt Farbbändern, gleiche Formen gleich groß und bündig, nahe Farben eine
  Farbe – so, wie ein guter User es zeichnen würde.
- **Stufe C – KI:** eine Vorlage (Referenzbild über der Zeichenfläche, nicht im Dokument), die die KI über MCP
  setzen und sehen kann, um das Bild mit `insert_svg`/`run_action` semantisch nachzubauen (Text als Text, Gruppen
  nach Bedeutung) – oder es mit Stufe A/B nachzeichnen lässt.

## Umfang

- Rust `ai-core::trace` (visioncortex, die Engine von vtracer): Command `trace_image(dataUrl, options)` →
  SVG + Größe + Zusammenfassung; Grenzen (Bildgröße, Elemente), Fehlercodes wie vorhanden.
- Frontend: Fassade `TraceApi` (+ Fake), Dialog „Bild nachzeichnen…“ mit Quelle, Stil, Details, Vorschau
  (echtes Ergebnis) und Zusammenfassung; neue Ebene in einem Undo-Schritt; Aktionen `trace.image` (mit Argumenten
  ohne Dialog), `trace.clipboard`.
- Vorlage: `TemplateStore`/`TemplateService`, Overlay im Canvas, Menü Ansicht › Vorlage, Aktionen `template.*`.
- MCP: Werkzeuge `set_template`, `get_template`; `trace.image` für die KI (nur Vorlage/Ebene als Quelle).

## Akzeptanz

- Rust: synthetische Bilder (Verlauf, Karte, Kreis, gleiche Tasten) – Stufe A nur Pfade, Stufe B Rechtecke mit
  Radius, Kreis, ein Verlauf, gleiche Maße; mit resvg zurückgerendert nah am Original; Grenzen und Fehler.
- Vitest: Presets, Plan (Ort, `position`, Undo), Service (Quellen, KI-Lauf), Dialog, Vorlage, MCP-Politik.
- Playwright: Vorlage deckungsgleich mit der Zeichenfläche, Dialog → neue Ebene → Undo.
- Echte App: `087-img.png` nachzeichnen.
