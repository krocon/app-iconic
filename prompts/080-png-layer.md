# Prompt 080: PNG-Layer importieren und Layer auf dem Canvas transformieren

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 002, 007, 010 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §1.5 (P2) · Folge-Idee aus `prompts/README.md`
> („Icon-Composer-Projekte mit PNG-Assets bearbeiten“)

## Ziel

Rasterbilder als eigene `.icon`-Layer (wie in Icon Composer) anlegen und Layer mit der Maus verschieben/skalieren.

## Ausgangslage (laut Analyse, zuerst bestätigen)

- `Assets/*.png` werden durchgereicht; File › Import SVG… nimmt nur `.svg`; Add › Image… bettet `<image data:…>` in
  ein SVG-Asset ein.
- Layer werden nur über `position` (Zahlenfelder im Inspector) bewegt.

## Umfang

- **File › Import Image as Layer…** (`file.importImageLayer`): PNG/JPEG über `read_image_file` (Grenzen, Magic Bytes),
  neues Asset im Bundle mit eindeutigem Namen (`names.rs`/`unique-names.ts`), neuer Layer in der aktiven Gruppe; ein
  Undo-Schritt. Speichern schreibt die Bilddatei verlustfrei ins Bundle/ZIP (Rust-Roundtrip-Test).
- **Bild eines PNG-Layers ersetzen** (gleiche Position).
- **Layer-Handles auf dem Canvas** für jeden Layer (SVG und PNG), wenn der Layer im Baum gewählt ist: verschieben,
  gleichmäßig skalieren um die Mitte; schreibt `position` (`scale`, `translation-in-points`) über
  `SetIconJsonValue`, Geste = ein Undo-Schritt, Snapping wie 007. Semantik von `position` aus 004 (offene Frage
  004/2) übernehmen.
- Vorschau, Export (SVG/PNG) und 078/079 berücksichtigen PNG-Layer.

## Akzeptanz

- Rust: Bundle und ZIP mit neuem PNG-Asset speichern und wieder öffnen, byte-gleich.
- Vitest: Layer-Anlage, Namen, position-Rechnung.
- Playwright: PNG importieren (Fake), Layer ziehen → `position` ändert sich, Undo; Export-SVG enthält das Bild.
