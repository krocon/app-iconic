# Design 084: Weitere Symbol-Sets und eigene Bibliothek

> Prompt: [084-symbol-bibliotheken.md](084-symbol-bibliotheken.md) · Stand: 30.10.2026 · baut auf 013 (E15–E22),
> 030 (Notices/Lizenzbericht), 033 (Pfadschutz), 082 (`ai_core::thumbnails` als Muster)

## Belege

- **Tabler Icons** – npm `@tabler/icons`, Lizenz **MIT** (`npm view @tabler/icons license`, `LICENSE` im Paket:
  „Copyright (c) 2020-2026 Paweł Kuna“). Neueste Version 3.50.0 (27.10.2026, jünger als zwei Wochen) → gewählt
  **3.49.0** (05.10.2026). 5 184 Outline-Icons (24 × 24, `stroke-width` 2, `round`), `tabler-nodes-outline.json`
  (nur `<path>`) + `icons.json` (Tags, Kategorie).
- **Phosphor** – npm `@phosphor-icons/core` (offizielles Katalog-/Asset-Paket), Lizenz **MIT** (`LICENSE`:
  „Copyright (c) 2023 Phosphor Icons“), Version **2.1.1** (29.03.2024, aktuell). 1 512 Icons je Gewicht
  (thin/light/regular/bold/fill/duotone) als einzelne SVG-Dateien (`viewBox 0 0 256 256`, ein gefüllter `<path>`),
  Metadaten (Tags, Kategorien) in `dist/index.mjs`.
- **Keine SF Symbols** (CLAUDE.md §7, legacy §8).

## Entscheidungen

- **E1 Registry:** `SYMBOL_PROVIDERS = [Lucide, Tabler, Phosphor]` (feste Sets, je mit `license.package` für den
  Notices-Test); „Meine Symbole“ (`mine`) hängt `SymbolService` an (braucht das Backend). Lucide bleibt Standard.
- **E2 Tabler: Outline** (Strich-Icons wie Lucide – das Gewicht ist die Strichbreite 0,5…3, Standard 2; Filled
  weggelassen: halbiert die Daten, Outline ist das Haupt-Set).
- **E3 Phosphor: nur „regular“** (gefüllte Konturen, keine Variante). Die Gewichte sind getrennte Zeichnungen;
  alle sechs hießen ≈ 4,7 MB Daten. Regular ist der Standard von Phosphor.
- **E4 Daten generiert, lazy:** Keines der Pakete liefert importierbare Daten (Tabler versteckt die JSON-Dateien hinter
  `exports`, Phosphor hat eine Datei je Icon). `scripts/symbol-data.mjs` erzeugt je Set eine kompakte JSON
  (`{ set, version, size, nodes, tags }`, Pfad = nur `d`) unter `features/symbols/data/`, eingecheckt wie die
  Fixture-Module; `pnpm symbols:check` (Teil von `pnpm check`) prüft, dass sie zum installierten Paket passen;
  bei unerwartetem Inhalt (anderes Element, anderer viewBox) bricht das Skript ab. Die Pakete stehen in
  `dependencies` (exakt), damit Notices und Lizenzbericht sie als ausgeliefert führen.
  **Bundle (`pnpm build`):** vorher Initial 1,32 MB, Lazy: icon-nodes 413,6 kB, tags 193,9 kB (Lucide). Nachher
  Initial **1,34 MB** (+20 kB: Provider, Picker, Bibliothek), neue Lazy-Chunks **tabler-outline 1,60 MB
  (≈ 261 kB übertragen)** und **phosphor-regular 779 kB (≈ 172 kB)** – geladen erst, wenn das Set (oder „Alle
  Sätze“) im Picker gewählt bzw. von der KI gesucht wird.
- **E5 Eigene Bibliothek in Rust** (`ai_core::symbols`): `<App-Konfig>/symbols/<id>.svg`, Name im `<title>`,
  Schlagwörter in `data-tags` – eine Datei je Symbol, kein Index, der auseinanderlaufen kann. Ids
  `[a-z0-9][a-z0-9-]{0,47}` aus dem Namen (`star`, `star-2`), nie ein Pfad; die WebView kennt nur Ids und das
  bereinigte Markup (Muster `thumbnails`, 082). Höchstens 500 Symbole; schreiben atomar (`write_atomic`); Links,
  Ordner und Fremddateien im Ordner werden ignoriert. Ein Mutex (`SymbolLock`) serialisiert Fenster.
- **E6 Bereinigung = Whitelist** (`symbols::clean`), beim **Speichern, Laden und Import**: XML über `roxmltree`
  (der Parser von resvg, über `usvg` re-exportiert – kein eigener Parser), DTD/Entities verboten, ≤ 256 KiB,
  ≤ 20 000 Knoten, ≤ 4 000 Elemente, Tiefe ≤ 32. Erhalten bleiben nur `<g>` und die Grundformen, nur Geometrie- und
  Farbattribute, deren Werte aus einer geschlossenen Zeichenmenge bestehen (kein `"`, `<`, `&`, `:`, `;`, `\`,
  `/`) und nie `url`, `var(` oder `expression` enthalten; alles andere (Skripte, Handler, `<style>`, `style`,
  `href`, `<use>`, `<image>`, Text, Verläufe, Filter, verschachtelte `<svg>`) fällt weg; das Ergebnis wird neu
  geschrieben. Im Frontend zusätzlich `sanitizeSvg` vor dem Zerlegen (E11).
- **E7 Commands** (`symbol_commands.rs`, alle `async` + `spawn_blocking`): `list_symbols`, `save_symbol`,
  `update_symbol`, `delete_symbol`, `record_symbol_use`, `import_symbols(path)`, `export_symbols(path)` – die
  beiden letzten prüfen den Pfad mit `allowed` (033 E1; im Quelltext-Test). Ordnerwahl über den vorhandenen Dialog
  `pick_export_dir` (Antwort wird freigegeben).
- **E8 Import:** die `*.svg` direkt im Ordner (keine Unterordner, keine Links, ≤ 2 000 Dateien), Name aus `<title>`
  sonst Dateiname, Tags aus `data-tags`; Unbrauchbares wird gezählt (`skipped`), bei voller Bibliothek `full`.
- **E9 Export:** in einen **neuen** Ordner „AppIconic Symbols“ (bzw. „… 2“) im gewählten Ordner – erst als
  versteckter Temp-Ordner, dann umbenannt; nichts des Nutzers wird überschrieben. Export → Import ergibt dieselben
  Namen und Tags (Rust-Test).
- **E10 „Zuletzt benutzt“ in Rust** (`symbols/recent.json`, 24 Einträge `{ set, id }`, neueste zuerst): geteilt von
  allen Fenstern und dauerhaft – `localStorage` wäre je WebView und ungeprüft, `settings.json` ist für
  Einstellungen. Eingetragen nach jedem erfolgreichen Einfügen; Löschen eines eigenen Symbols entfernt es.
- **E11 Provider „Meine Symbole“** (`MySymbolsProvider`, `symbol-flatten.ts`): das Markup wird mit `DOMParser`
  gelesen, mit `sanitizeSvg` nochmals bereinigt und in **eine** `<g fill="#000" stroke="none">` mit lauter
  `<path>` zerlegt – geerbte Farbe wird an den Pfad geschrieben, Transformationen als Text verkettet (der Browser
  rechnet, keine eigene Matrixkette), Deckkraft multipliziert. Eingefügt wird wie bei den anderen Sets
  (`placeSymbol`, eine Undo-Stufe „Add Symbol“); die eigenen Farben bleiben (Vorschau auch farbig: `colored`).
- **E12 „Als Symbol speichern…“** (`symbols.save`, Edit-Menü + Kontextmenü der Knoten): jede ausgewählte Node wird
  in ein `<g transform="matrix(…)">` mit der Matrix des Browsers (`nodeToDocument`, eigene Transformation
  enthalten) und der von den Vorfahren geerbten Farbe kopiert; viewBox = Vereinigung der Dokument-Bounds;
  `data-ai-*`, `id`, `class` fallen weg, `style`-Farben werden Attribute. Dialog: Name (Pflicht), Schlagwörter
  (Komma). Text, Bilder, Verläufe, Filter, Clips bleiben nicht erhalten (Hinweis im Dialog) – Folge-Idee.
- **E13 Picker:** Auswahl „Alle Sätze“ (eine Suche über alle geladenen Sets, gleiche Rangfolge wie 013 E18, Set je
  Treffer im Namen der Kachel), „Zuletzt benutzt“, Lucide, Tabler, Phosphor, Meine Symbole. Lizenzzeile: das Set
  bzw. das Set des aktiven Symbols. Vorschau als eigene Komponente `SymbolTile` (Bindungen, kein `innerHTML`);
  Vorschauen je Gewicht einmal berechnet (`computed`). Letzte Wahl (auch „Alle“/„Zuletzt“) für die Sitzung.
- **E14 Verwalten** im Picker (nur bei „Meine Symbole“): Umbenennen (Name + Tags inline), Löschen mit Bestätigung
  inline (nicht rückgängig zu machen), Ordner importieren/exportieren.
- **E15 KI:** `add.symbol.set` ist jetzt ein Enum `lucide | tabler | phosphor | mine` (unbekanntes Set = Argumentfehler
  statt Hinweis). Neues MCP-Tool **`find_symbols { id?, query?, set?, limit? }`** (≤ 200, Standard 40; leere Suche =
  zuletzt benutzt) liefert `{ set, id, name }` für `add.symbol`. Aktionen `symbols.save { name?, tags? }` und
  `symbols.rename { id, name, tags? }` sind der KI erlaubt (additiv, im App-Ordner); **`symbols.delete`,
  `symbols.import`, `symbols.export` sperrt `mcp-policy`** (nicht rückgängig zu machen bzw. Dateidialoge).

## Verträge

```rust
// ai-core/src/symbols/{mod,clean,recent}.rs
pub fn list(dir) -> Vec<LibrarySymbol>;           // LibrarySymbol { id, name, tags, svg }
pub fn save(dir, name, tags, svg) -> Result<LibrarySymbol, FsError>;
pub fn update(dir, id, name, tags) -> Result<LibrarySymbol, FsError>;
pub fn delete(dir, id) -> Result<bool, FsError>;
pub fn import_folder(dir, src) -> Result<ImportReport { imported, skipped, full }, FsError>;
pub fn export_folder(dir, target) -> Result<(PathBuf, usize), FsError>;
clean::parse(text) -> Result<Parsed, FsError>; clean::write(&Parsed, name, tags) -> String;
recent::{load, record, forget}                    // SymbolRef { set, id }
```

```ts
// core/symbols/symbol-library-api.ts
abstract class SymbolLibraryApi { list(); save(name, tags, svg); update(id, name, tags); remove(id);
  recordUse(ref); pickFolder(); importFolder(path); exportFolder(path) }
// DTOs: LibrarySymbol, SymbolRef, SymbolLibrary { symbols, recent }, SymbolImport, SymbolExport
// features/symbols: SymbolProvider (+ license.package, license null = eigene, all(), colored),
// NodeSetProvider (TABLER, PHOSPHOR), MySymbolsProvider, symbolFromMarkup, captureMarkup,
// SymbolLibraryService, SymbolService.find(query, set, limit), pickerItems, SaveSymbolDialog
```

Fehlercodes: vorhandene (`invalid_svg`, `too_large`, `not_found`, `invalid_request`, `not_allowed`).

## Tests

- Rust: Bereinigung mit feindlichen Eingaben (Skripte, Handler, `style`, `url(…)`, `javascript:`, Entities/DTD,
  externe Entity, verschachtelte `<svg>`, `<use>`, `<image>`, CSS-Escapes, Größe/Anzahl/Tiefe), Farbwerte als
  geschlossene Menge; Speichern/Listen/Umbenennen/Löschen, Ids nie Pfade, Laden bereinigt erneut (untergeschobene
  Datei), Links werden nicht verfolgt, Grenze 500, Import/Export inkl. Rundweg; recent; DTOs camelCase;
  `find_symbols`-Argumente; Pfadprüfung von `import_symbols`/`export_symbols`; Command-Regeln.
- Vitest: Provider-Registry + **Lizenzprüfung** (jedes Set: Paket in `dependencies`, Kopfzeile
  `<paket> <version> (<spdx>, npm)` in `THIRD-PARTY-NOTICES.txt`, Daten-Version = Paket-Version);
  `NodeSetProvider` (Strich/Füllung, Handler fallen weg) und **alle** echten Tabler-/Phosphor-Icons; Suche über
  mehrere Sets, „Zuletzt benutzt“, Vorschaufarbe; `symbolFromMarkup`, `captureMarkup`; Bibliothek
  (Speichern → Einfügen mit Farben, Fehler, Umbenennen/Löschen, KI-Sperren, Import/Export, `find`); Picker
  (alle Sätze, zuletzt benutzt, Umbenennen/Löschen inline); Fassade (Argumentnamen); Skript `symbol-data` (node:test).
- Playwright (`e2e/symbol-library.spec.ts`): Tabler-Symbol suchen und einfügen (+ danach unter „Zuletzt
  benutzt“); gedrehte Gruppe über Edit › Als Symbol speichern… sichern und aus „Meine Symbole“ wieder einfügen
  (gleiche Größe/Proportion und Farben), in „Alle Sätze“ gefunden; About nennt alle drei Sets.

## Fragen an Marc

1. Sollen weitere Phosphor-Gewichte (z. B. „bold“, „fill“) als Variante kommen? Kostet je Gewicht ≈ 0,8 MB Lazy-Chunk.
2. „Konturen in Pfade umwandeln“ für Strich-Sets (013 Folge-Idee) gilt jetzt auch für Tabler – weiter Folge-Idee?
