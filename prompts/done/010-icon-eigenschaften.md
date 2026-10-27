# Prompt 010: Icon-Eigenschaften (icon.json-Inspector)

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 004, 009 · Meilenstein 6 aus `000-init.md` ·
> legacy §2, §7.6

## Ziel

Root, Gruppen und Layer werden im Properties-Panel bearbeitet – **im Apple-Format**. Die Vorlage hat dafür ein
eigenes Modell (`mode: solid|gradient|auto|system`, Blend-Modes, Strategien) erfunden und dieses zurück in
`icon.json` geschrieben; das ist inkompatibel mit Icon Composer und wird nicht übernommen (legacy §2, §13.2).

## Umfang

- **Formatkenntnis zuerst:** Im Design-Dokument die Felder von `icon.json` aus Apples Dokumentation und echten
  Icon-Composer-Dateien belegen (Fill-Arten, `fill-specializations` je Appearance, Gruppen-Felder wie Blend-Mode,
  Lighting, Specular, Blur-Material, Hidden, Name, Position; Layer-Felder wie Glass, Opacity, Blend-Mode, Hidden,
  Fill). Nur Belegtes wird bearbeitbar; alles andere bleibt unangetastet und wird in einer „Other properties
  (read-only)“-Liste angezeigt. Offene Punkte als Fragen an Marc.
- **Root / Hintergrund:** `automatic`, `system-light`, `system-dark`, `solid` (Farbe), `automatic-gradient`
  (Farbe), `linear-gradient`/`radial-gradient` (Farben + ggf. Orientierung); Farbformat `extended-srgb:r,g,b,a`
  (und `srgb`, `display-p3`, `gray` lesen; schreiben in der Form, in der gelesen wurde). Specializations für
  Dark (und Tinted, falls belegt). Ein Fill-Editor-Modell ist nur eine **Sicht**: es liest aus dem `Value` und
  schreibt das Apple-Format zurück; unbekannte Fill-Formen → read-only mit Hinweis.
- **Gruppe:** Shadow (`kind` neutral|chromatic|none, `opacity`), Translucency (`enabled`, `value`), weitere belegte
  Felder.
- **Layer:** Name (eindeutig), Opacity (Slider 0…1 – die Vorlage hat sie verloren), Asset-Zuordnung (Asset
  wechseln/umbenennen mit Umbenennen der Datei), weitere belegte Felder.
- **Supported Platforms:** `squares` (`shared` u. a. belegte Werte) und `circles` (Liste, z. B. `watchOS`).
- **icon.json Preview:** Live-Ansicht des JSON (read-only, Monospace, kopierbar), Hervorhebung der letzten Änderung.
- **Canvas-Vorschau:** Fill (aus 004) für Light/Dark; Gruppen-Schatten und Transluzenz als **Annäherung**
  (SVG-Filter `feDropShadow`, Opacity) – im UI als „Preview approximation“ gekennzeichnet, da Apples
  Liquid-Glass-Rendering nicht nachgebaut wird.
- Alle Änderungen als `SetIconJsonValue`-Commands mit sprechenden Undo-Namen.

## Tests

- Vitest: Fill-Sicht ↔ `Value` (jede Art hin und zurück bytegleich, unbekannte Formen unverändert), Farbformate,
  Plattformen, Layer-Opacity, eindeutige Namen beim Umbenennen.
- Rust (002 erweitern): Fixture mit allen bekannten Feldern + Zusatzfeldern übersteht Bearbeiten an anderer Stelle.
- Playwright: Fill auf linear-gradient setzen → Canvas zeigt Verlauf; Undo; JSON-Vorschau aktualisiert.

## Akzeptanz

- `docs/FEATURES.md` §8 abgehakt; ein in AppIconic bearbeitetes Icon öffnet in Icon Composer (Test durch Marc auf
  dem Mac, im Bericht anfragen). `pnpm check` + `pnpm e2e` grün.
