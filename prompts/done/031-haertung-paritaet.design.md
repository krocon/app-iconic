# Design 031: Härtung und Feature-Parität

Status: umgesetzt · Datum: 27.10.2026

## Ausgangslage

002–030 sind umgesetzt. Offen waren der Nachweis der Parität gegen `docs/FEATURES.md` und die Vorlage, ein Review
durch einen Agenten, der die Arbeit nicht gemacht hat, feindliche Dateien, Leistung großer SVGs, Barrierefreiheit
und die Doku.

## Entscheidungen

- **E1 Parität als Matrix** (`docs/parity.md`, von einem eigenen Agenten erstellt): je Punkt aus `FEATURES.md`
  Vorlage (legacy §), Neuauflage (Modul/Aktion), Stand ✅/◐/✗, Beleg (Testname) und Abweichung mit Entscheidung.
  Was nur auf dem Mac prüfbar ist, steht gesammelt am Ende. `FEATURES.md` ist abgehakt bis auf den eigenen
  Verlaufseditor (begründet offen → Prompt 032).
- **E2 Review durch einen separaten Agenten** (Code + Verhalten gegen CLAUDE.md §4): 16 Befunde. Erledigt in 031:
  1. MCP-Brücke: jede Verbindung ließ einen Socket-Klon zurück (Dateideskriptoren), Hello ohne Zeitlimit. Jetzt
     Klone je Verbindungs-Id, erst nach gültigem Token, entfernt beim Ende; Hello ≤ 1 KiB in 5 s; höchstens 16
     offene Sockets (`host.rs`, Tests zählen `/proc/self/fd`).
  2. `setAttribute`/`setAttributes`/`setText` prüfen Werte wie der Import-Sanitizer (`unsafeAttribute`): kein
     `javascript:`, keine externen Links/URLs, kein Text für `<style>`/`<script>`. Markup-Commands (Einfügen,
     Ersetzen, Clip, „Edit SVG…“) laufen über `parseFragment`, das jetzt säubert.
  3. Sanitizer: XHTML-/MathML-Elemente fort, `image-set(`/`-webkit-image-set(`/`src(`/`image(` und `xml:base` gelten
     als extern, CSS-Escapes (`\75 rl(`) werden vor der Prüfung aufgelöst, `attributeName` getrimmt, Animationen
     auf `style`/`src`/`*base` fort.
  4. Asset-Namen: neue Namen ohne Windows-Zeichen (`<>:"|?*`), ohne reservierte Namen (`con`, `nul.svg` … →
     `_con.svg`), ohne Punkt/Leerzeichen am Ende, höchstens 200 Bytes (Tabelle `testdata/unique-names.json`, Rust
     und TS). Beim Lesen bleiben Einträge, die ein Dateisystem ohne Groß-/Kleinschreibung nicht trennen kann
     (`a.svg` neben `A.svg`, eine Datei `ASSETS`, `Icon.json`), mit Warnung `ignored_entry` draußen – Speichern
     überschreibt nie eine Datei mit einer anderen.
  5. Virtualisierter Baum: die Zeile mit Tab-Index 0 bleibt im DOM, auch weit weggescrollt.
  7. KI `open_document` fragt wie Speichern/Export („Vor Dateizugriff fragen“).
  8. SVG-Assets über 16 MiB (Grenze des Imports) bleiben Bytes ohne Text (`unreadable_asset`), Roundtrip bleibt.
  9. Ein ZIP mit demselben Namen zweimal ist ungültig (der zip-Crate behält still den letzten: Vergleich mit der
     Anzahl im End-of-Central-Directory).
  10. Dateigröße vor `ZipArchive::new` (liest das Zentralverzeichnis ganz).
  12. Parsen und Rendern mit resvg auf eigenem Thread mit 256 MiB Stack (`png::deep`): 1 000 verschachtelte Gruppen
      brachen auf 2 MiB den ganzen Prozess ab.
  13. „busy“ im Export als Katalogtext.
  15. Tote Exporte entfernt (`degFromDocAngle`, `toMatrix`, `clipGroupAround`, `itemTarget`, `effectiveTheme`,
      `JsonObject`, `LANGUAGES`).
  16. MCP-Token: vier Werte aus je eigenem Thread (eigene OS-Schlüssel) – 256 statt 128 Bit.

  Als Prompt 033 erfasst: 6 (Pfade nur aus vertrauten Quellen), 11 (eigene Transform-Rechnung in
  `transform-list.ts`), 14 (Dateien über ~400 Zeilen) und die Leistungsmessung auf dem Mac.
- **E3 Feindliche Dateien** je Fall ein Test: Rust (ZIP-Bombe mit falscher Größe, Zip-Slip, Verschlüsselung,
  Grenzen, doppelte Einträge, Groß-/Kleinschreibung, übergroße Datei, tiefe Verschachtelung beim Rendern), Vitest
  `hostile-documents.spec.ts` (fehlende/kaputte Assets, seltsames `icon.json`, aktive Inhalte, Tiefe 1 000 und
  20 000 Geschwister, lange und Unicode-Namen), Playwright `hardening.spec.ts` (Tiefe 5 000 in Chromium →
  sauberer Fehlerdialog, App bleibt bedienbar).
- **E4 Roundtrip-Garantie**: unveränderte Assets gehen als `unchanged` zurück und werden byteweise geschrieben
  (Rust `save.rs`); ein bearbeitetes Asset ist seine DOM-Serialisierung plus genau die Änderung
  (`round-trip-diff.spec.ts`, alle Fixtures; Undo → wieder `unchanged`). Die DOM-Serialisierung normalisiert beim
  ersten Bearbeiten Leerraum innerhalb von Tags, das Prolog-Leerzeichen und leere Elemente (`<path></path>` →
  `<path/>`) – bewusst (003 E3: kein eigener Serializer).
- **E5 Leistung** (`scripts/big-svg.mjs`, 6,8 MB, 20 000 Formen in 400 transformierten Gruppen, wahlweise ohne
  `opacity`): Maßnahmen in 031 – Zeichenfläche als eigene Ebene (`will-change: transform`), Schatten auf einer
  Geschwister-Ebene statt `filter` über allem, Treffertest verwirft Elemente über `getBoundingClientRect` vor dem
  teuren `isPointInFill`, der Ebenenbaum wird während einer Geste nicht neu gebaut. Zahlen in
  `docs/architecture.md` „Performance“. Headless Chromium im Container rastert in Software; das Ziel ≥ 50 fps beim
  Ziehen ist dort nicht erreichbar und wird auf dem Mac gemessen (033).
- **E6 Barrierefreiheit**: `e2e/a11y.spec.ts` – Tab erreicht Commands, Hierarchy, Properties, Fokus immer sichtbar
  (`:focus-visible` mit Outline/Schatten); Dialoge `role="dialog"` + `aria-modal`, Fokus bleibt drin, Esc schließt
  und gibt den Fokus zurück. Kontraste: `scripts/theme-contrast.test.mjs` (015).

## Tests

- Rust: `host.rs` (Deskriptoren, Hello-Grenzen, Zeitlimit, Höchstzahl), `zip_io_tests.rs` (doppelte Einträge,
  Größe, Groß-/Kleinschreibung), `names.rs` (Tabelle), `mod.rs` (großes SVG-Asset), `png.rs` (Tiefe).
- Vitest: `sanitize-svg.spec.ts`, `set-attributes.spec.ts`, `set-text.spec.ts`, `unique-names.spec.ts`,
  `hierarchy-tree.spec.ts`, `mcp.store.spec.ts`, `hostile-documents.spec.ts`, `round-trip-diff.spec.ts`.
- Playwright: `hardening.spec.ts`, `a11y.spec.ts`; `node --test scripts/big-svg.test.mjs`.

## Fragen an Marc

1. Leistung auf dem Mac messen (`PLAYWRIGHT_BROWSERS_PATH=… pnpm e2e e2e/hardening.spec.ts` gibt die Zahlen aus;
   in der echten App: großes SVG importieren, ziehen mit Snap) – reicht das für 033?
2. Die Normalisierung beim ersten Bearbeiten eines Assets (E4) akzeptabel, oder soll ein eigener, formerhaltender
   Serializer her (Abweichung von 003 E3)?
