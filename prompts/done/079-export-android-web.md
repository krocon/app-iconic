# Prompt 079: Export für Android (Adaptive Icons) und Web/PWA

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 078 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §1.1 Punkt 2 (P2)

## Ziel

Ein `.icon` liefert auch die Icon-Sätze für Android und das Web.

## Umfang

- **Android Adaptive Icon:** `foreground`, `background`, `monochrome` getrennt (108 dp, sichere Zone 66 dp), PNGs je
  Dichte (mdpi–xxxhdpi) in `mipmap-*`, `mipmap-anydpi-v26/ic_launcher.xml` (+ `_round`), Legacy-Icons 48–192 px,
  Play-Store 512. Zuordnung im Design: Empfehlung Hintergrund = Icon-Fill, Vordergrund = alle Gruppen, wählbar je
  Gruppe; Monochrom aus der Tinted-Rechnung (077). Werte mit Quelle (Android-Doku) belegen.
- **Web/PWA:** `favicon.ico` (16/32/48), `favicon.svg` mit `prefers-color-scheme` (Light/Dark aus dem Dokument),
  `apple-touch-icon.png` (180, ohne Transparenz), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`
  (sichere Zone), `manifest.webmanifest`-Ausschnitt und HTML-Snippet (`<link>`-Tags) zum Kopieren.
- Gleiche Export-Infrastruktur wie 012/078 (Fortschritt, Abbruch, atomar); KI-Argumente.

## Akzeptanz

- Rust: Ordnerstruktur und XML/JSON gegen Schnappschuss, Größen, sichere Zone (Pixel außerhalb leer bei maskable).
- Vitest: Zuordnung Gruppen → Ebenen, Optionen.
- Ende-zu-Ende: Satz erzeugen, `favicon.svg` im Browser (Playwright) hell/dunkel prüfen.
