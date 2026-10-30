# Prompt 076: Effekte und Masken je Element

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 009, 012, 014, 032, 064 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §1.7

## Ziel

Schatten, Unschärfe, Mischmodus und Masken an SVG-Elementen visuell bearbeiten – statt `url(#…)` in Rohtextfeldern.

## Ausgangslage (laut Analyse, zuerst bestätigen)

Der Sanitizer lässt `<filter>`, `feDropShadow`, `feGaussianBlur`, `<mask>` zu; im Panel (`property-defs.ts`) sind
`filter` und `mask` nur Textfelder unter „Advanced“.

## Umfang

- **Panel-Abschnitt „Effekte“:** Liste mit Schatten außen, Schatten innen, Unschärfe; je Effekt Farbe, Deckkraft,
  Versatz, Radius, an/aus; dazu `mix-blend-mode` und `opacity` des Elements. Verwaltete Filter in `<defs>` mit
  Kennzeichen (z. B. `data-ai-effect`), eine Filter-Definition je Element; geteilte Filter wie geteilte Verläufe (032)
  behandeln (Kopie beim Ändern, Hinweis). Fremde, nicht verwaltete Filter bleiben unangetastet und zeigen „eigener
  Filter – im SVG bearbeiten“.
- **Masken wie Clip Paths (014):** Maske aus Auswahl anlegen, Bearbeitungsmodus, `mask-type` Luminanz/Alpha,
  lösen/entfernen; Aktionen `mask.*`; Copy/Duplicate/Delete nehmen Masken mit (wie `clip-references`).
- **Export-Treue:** jeder Effekt wird von resvg (PNG) gerendert – Rust-Test je Effekt mit Pixelvergleich gegen
  erwartete Werte; wo resvg abweicht, im Design dokumentieren.
- Aktionen und Commands serialisierbar (`effect.add/set/remove`, `mask.*`).

## Akzeptanz

- Vitest: Filter-Erzeugung/-Lesen (rein), geteilter Filter → Kopie, Roundtrip fremder Filter.
- Rust: PNG-Export von Schatten, Unschärfe, Maske.
- Playwright: Schatten hinzufügen, Versatz ziehen (Geste = ein Undo), Maske anlegen und bearbeiten.
