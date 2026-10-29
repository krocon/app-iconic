# Prompt 054: Verteilen und Ausrichten an Leinwand / Schlüsselobjekt

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 007 · Vorbild: Illustrator „Align“-Panel

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
