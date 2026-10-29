# Prompt 032: Verlaufseditor

> Lies zuerst [000-arbeitsweise.md](../000-arbeitsweise.md). Braucht: 009, 011 · legacy §10 · Folge aus 031 (Parität)

## Stand

- ✅ 29.10.2026: `features/gradient/` – gradient-model (lesen inkl. `href`-Kette, Nutzer zählen, Farbe an Position),
  GradientService (Commands, Live-Geste = ein Undo-Schritt), GradientSection im Properties-Panel, GradientOverlay
  (Griffe über Element-CTM · `gradientTransform` · Begrenzungsrahmen, über den Auswahl-Griffen), gradient-handles
  (rein), Aktionen `gradient.create/set/addStop/setStop/removeStop/makeUnique/editOnCanvas`. Bewusst anders:
  `gradientTransform` als Textfeld (nicht die Transform-Liste), Griffe ohne Snapping, geteilte Verläufe mit Hinweis +
  Knopf „Nur hier (duplizieren)“ statt Rückfrage bei jeder Änderung; Griffe nur auf Wunsch („Auf der Zeichenfläche
  bearbeiten“), weil Start/Ende sonst auf den Eck-Griffen der Auswahl liegen.

## Ziel

`linearGradient`/`radialGradient` im Properties-Panel und auf der Zeichenfläche bearbeiten, ohne „Edit SVG…“.
Die Vorlage hatte nur das Modell (§10); heute zeigen Verläufe im Panel nur ihre `id`, Stops sind einzeln über
`stop` bearbeitbar (`docs/parity.md` §10, ✗).

## Umfang

- **Panel:** Abschnitt „Gradient“ für die Verlaufs-Definition und für jedes Element, dessen `fill`/`stroke` auf einen
  Verlauf zeigt: Art (linear/radial), `gradientUnits`, `spreadMethod`, `gradientTransform` (Transform-Liste aus
  009), Stop-Leiste (hinzufügen, entfernen, verschieben, Farbe, Deckkraft), `href`-Ketten sichtbar (geerbte Stops).
- **Zeichenfläche:** Griffe für Start/Ende bzw. Mitte/Radius/Fokus über die CTM des Elements (Browser-Geometrie,
  keine eigene Transform-Kette), Snapping wie 007, Gesten = ein Undo-Schritt (`setAttributes`).
- **Geteilte Verläufe:** Ändern eines Verlaufs, den mehrere Elemente nutzen, fragt „für alle / nur hier
  (duplizieren)“; Aktion `gradient.*` mit serialisierbaren Argumenten (KI).
- **Anlegen:** Fill/Stroke → „Linear Gradient“ legt einen Verlauf in `<defs>` an (eindeutige `id`, 014-Muster).

## Akzeptanz

- `docs/FEATURES.md` §10 „Eigener Verlaufseditor“ abgehakt, `docs/parity.md` aktualisiert.
- Vitest für Modell/Commands, Playwright für die Griffe bei Zoom 50/100/150 % und transformierten Gruppen.
- Roundtrip: unbekannte Attribute der Verläufe bleiben erhalten; `pnpm check` + `pnpm e2e` grün.
