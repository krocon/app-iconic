# Prompt 077: `.icon` vollständig darstellen – Layer-Fill, Tinted, Radialverlauf, Glas-Annäherung

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 004, 010, 012, 069 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §1.1 Punkt 1, §1.3 (P2) · **Format konservativ**: nur mit Beleg
> (Fixture, Icon-Composer-Datei), sonst Frage an Marc.

## Ziel

Was der Inspector bearbeiten lässt, ist in Vorschau und Export auch zu sehen.

## Ausgangslage (geprüft am 30.10.2026)

- `canvas/appearance.ts`: „tinted“ wird bearbeitet, aber nicht dargestellt (010 E2); `export-options.ts` kennt kein
  Tinted.
- `effects.ts` `blendCss()` gibt für `plus-darker` `null` zurück.
- `inspector/fill-model.ts`: `radial-gradient` nur lesbar (010 E7), obwohl `fill-preview.ts` ihn rendert.
- Laut Analyse ignorieren `effects.ts`, `layer-stack.ts`, `export-svg.ts` Layer-`fill`, Gruppen-`lighting`,
  `specular`, `blur-material` und Layer-`glass`.

## Umfang

- **Layer-`fill`:** färbt den Layer ein (Layer-Inhalt wirkt als Maske, Fläche = Fill: Farbe, Verlauf, automatic).
  Gleiche Umsetzung in Vorschau und Export-SVG (z. B. Maske oder `feFlood` + `feComposite in`), resvg-tauglich.
- **Tinted-Vorschau und -Export:** Appearance „Tinted“ in der Toolbar (069) und im Export; Annäherung: Luminanz der
  Komposition × wählbare Tönung (Vorschau-Einstellung, nicht im Dokument). Specializations für `tinted` wirken.
  Als „Annäherung“ kennzeichnen. Clear/Liquid-Glass-Varianten nur, wenn das Format sie belegt.
- **`plus-darker`:** Annäherung als Linear Burn (`feComposite operator="arithmetic" k2=1 k3=1 k4=-1`) in Vorschau
  und Export; prüfen, ob WKWebView den Wert nativ kann.
- **Radialverlauf anlegen:** im Fill-Editor freigeben, Standardwerte nur aus belegten Dateien (Fixture
  `all-fields.icon` oder neue Testdatei aus Icon Composer – Marc fragen).
- **Glas, Licht, Glanz, Blur-Material:** sichtbare Annäherung in der Vorschau (Glanzkante, weiche Aufhellung,
  Hintergrund-Unschärfe); im Export als Option „Effekte annähern“ (Standard aus) – Apple rendert sie auf dem Gerät.
- Neue Export-Varianten in `export-options` (rein) + Dateinamen; KI-Argumente erweitern.

## Akzeptanz

- Vitest: Layer-Fill-Aufbau, Tinted-Matrix, Fill-Modell radial (anlegen, lesen, unbekannte Felder bleiben).
- Rust: PNG-Export mit Layer-Fill und Tinted (Pixelprüfung), Roundtrip aller Fixtures unverändert.
- Playwright: einfarbiger Layer + Layer-Fill Rot → rot in Vorschau und Export-SVG; Umschalten auf Tinted.
