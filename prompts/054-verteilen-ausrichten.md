# Prompt 054: Verteilen und Ausrichten an Leinwand / Schlüsselobjekt

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 007 · Vorbild: Illustrator „Align“-Panel

## Stand

- ✅ 29.10.2026: **Verteilen** (Menü Arrange › Verteilen, Abschnitt „Ausrichten“ im Properties-Panel): Mitten
  horizontal/vertikal gleichmäßig, Abstände gleich (äußere bleiben), fester Abstand (Feld mit − / +, zwei Knöpfe).
  **Ausrichten an** Auswahl / Leinwand (1024 × 1024, auch für ein einzelnes Element) / Basisobjekt (das zuletzt
  zur Auswahl gekommene Element, mit dickem Rahmen markiert); Wahl im Panel und im Menü (`arrange.alignTo.*`),
  `arrange.align.* {to}` und `arrange.distribute.spacing {axis, gap}` für die KI. Ausrichten/Verteilen aus der
  EditService in eine eigene AlignService verlegt; ein Undo-Schritt „Transform ändern“.

## Ziel

Ausrichten gibt es nur untereinander (Auswahlrahmen). Für Icons braucht es gleichmäßige Abstände und die
Ausrichtung an der Leinwand-Mitte bzw. an einem festen Objekt.

## Umfang

- **Verteilen** horizontal/vertikal: Mitten gleichmäßig, Abstände gleich, Abstand fest (Wert).
- **Ausrichten an:** Auswahl (heute), Leinwand (1024 × 1024 bzw. Icon-Raster), Schlüsselobjekt (das zuletzt
  geklickte Element der Auswahl, sichtbar markiert).
- Im Properties-Panel ein Abschnitt „Ausrichten“ mit Knöpfen, Menü Arrange, Aktionen mit Argumenten.

## Akzeptanz

- Vitest: Abstände/Verteilung rein. Playwright: drei Kreise gleich verteilen, an der Leinwandmitte ausrichten,
  an Schlüsselobjekt.
