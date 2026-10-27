# Design 010: Icon-Eigenschaften (icon.json-Inspector)

Status: in Arbeit · Datum: 27.10.2026

## Belege für das Format

Apple dokumentiert `icon.json` nicht. Belegt wird mit echten Icon-Composer-Dateien:

- `testdata/fixtures/camscanner.icon/icon.json` (002) und die Datei aus dem Proxmox-Patch (002).
- **Inoffizielles JSON-Schema** [dfabulich/unofficial-apple-icon-composer-json-schema][schema] (ISC, aus Beispielen
  und Ausprobieren in Icon Composer / Xcode 26.2 abgeleitet) mit sechs echten Dateien aus öffentlichen Repos
  (Spacedrive, gb-studio, Horizon, Loop, Turntable) und `New.icon` (frisch angelegt, ungeändert gespeichert).
- Drei weitere echte Dateien in [peterpoliwoda/icon-composer-template][tpl] (Test-Fixtures eines Swift-Modells).
- [ethbak/icon-composer-mcp][mcp] (Typen, Blend-Mode-Liste, UI-Namen).

Auswertung aller Dateien (Skript im Bericht, nicht im Repo):

| Ebene | Feld | Werte (belegt) |
|---|---|---|
| Root | `fill` | `"automatic"`, `"system-light"`, `"system-dark"`, `"none"` (= automatic, `New.icon`), `{ "solid": C }`, `{ "automatic-gradient": C }`, `{ "linear-gradient": [C, C], "orientation"?: { start: {x,y}, stop: {x,y} } }` (erste Farbe = `start`, Icon-Composer-Standard `start (0.5, 0)`, `stop (0.5, 0.7)`) |
| Root | `fill-specializations` | `[{ appearance?, idiom?, value }]` |
| Root | `supported-platforms` | `squares`: `"shared"` (belegt) oder Liste aus `iOS`/`macOS`/`shared` (nur Schema); `circles`: `["watchOS"]` |
| Root | `color-space-for-untagged-svg-colors` | `display-p3`, `srgb`, `extended-gray` |
| Gruppe | `name`, `hidden`, `opacity` (0…1), `blend-mode`, `lighting` (`combined`/`individual`), `specular` (bool), `blur-material` (`null` = aus, 0…1), `shadow { kind: neutral/layer-color/none, opacity }`, `translucency { enabled, value }`, `position { scale, translation-in-points: [x, y] }`, `layers` | |
| Layer | `name`, `image-name`, `hidden`, `opacity`, `blend-mode`, `glass` (bool), `fill` (wie Root; färbt das Asset), `position` | |
| beide | `<feld>-specializations` für jedes Feld außer `name`/`layers` (Layer zusätzlich `image-name-specializations`) | `appearance`: `dark`, `tinted` (einmal auch `light`); `idiom`: `square`, `watchOS` |

Blend-Modes: `normal, multiply, screen, overlay, darken, lighten, color-dodge, color-burn, soft-light, hard-light,
difference, exclusion, plus-darker, plus-lighter`. Farben: `display-p3:r,g,b,a` (häufigst), `extended-gray:w,a`,
`srgb:r,g,b,a`, `extended-srgb:r,g,b,a`; immer 5 Nachkommastellen.

Beobachtete Regeln (in **allen** Dateien):

1. **Nie** `X` und `X-specializations` gleichzeitig – sobald ein Feld je Appearance variiert, steht es nur noch
   als Liste da.
2. Die Liste beginnt mit dem Eintrag ohne `appearance` (falls vorhanden), dann `dark`, dann `tinted`. Listen ohne
   Grundeintrag kommen vor (`[{ appearance: dark, value }]` – sonst gilt der eingebaute Standard).
3. Alle Objekte alphabetisch sortiert; leere Liste als `[\n\n  ]` (`New.icon` – beantwortet Frage 3 aus 002).
4. **`radial-gradient` kommt in keiner Datei vor** und fehlt im Schema (nur die Vorlage kennt es).

[schema]: https://github.com/dfabulich/unofficial-apple-icon-composer-json-schema
[tpl]: https://github.com/peterpoliwoda/icon-composer-template
[mcp]: https://github.com/ethbak/icon-composer-mcp

## Entscheidungen

- **E1 Nur Belegtes ist bearbeitbar.** Bearbeitbar: Root `fill` (+ Appearances), `supported-platforms`,
  `color-space-for-untagged-svg-colors`; Gruppe `name`, `hidden`, `opacity`, `blend-mode`, `lighting`, `specular`,
  `blur-material`, `shadow`, `translucency`, `position`; Layer `name`, `image-name` (Asset), `hidden`, `opacity`,
  `blend-mode`, `glass`, `fill`, `position`. Alles andere (unbekannte Schlüssel, unbekannte Unterschlüssel bleiben
  ohnehin) steht in „Other properties (read-only)“ als JSON. Unbekannte Werte eines bekannten Felds (z. B. ein
  Fill-Objekt mit fremden Schlüsseln, ein Blend-Mode, den wir nicht kennen) werden angezeigt, aber nicht
  umgedeutet: Fill → read-only mit Hinweis, Auswahl → zusätzliche Option (wie 009 `SelectField`).
- **E2 Appearance-Umschalter im Inspector** (Default · Dark · Tinted), gemeinsam für alle Felder; Default/Dark
  schalten auch die Canvas-Vorschau (`view.appearance.*`), Tinted wird nicht gerendert (Hinweis „not previewed“).
  Angezeigt wird der wirksame Wert: Eintrag mit genau dieser Appearance (ohne `idiom`) → Grundeintrag → `X` →
  eingebauter Standard (grau, „default“). Einträge mit `idiom` oder unbekannter Appearance bleiben unangetastet
  und werden beim Lesen übergangen (Hinweis „has platform-specific variants“).
- **E3 Schreiben je Appearance wie Icon Composer** (Regeln 1–2): In **Default** wird der Grundwert geschrieben
  (`X` bzw. der Grundeintrag der Liste; fehlt dieser bei vorhandener Liste, wird er vorn eingefügt). In **Dark /
  Tinted** schreibt jede Änderung den Eintrag dieser Appearance; fehlt er, wird er angelegt – aus `X` wird dabei
  `X-specializations: [{ value: X }, { appearance, value }]`, `X` entfällt (Belege: viele Dateien haben Dark-Einträge
  gleich dem Grundwert – so entstehen sie in Icon Composer). Ein Knopf ✕ „Use default for Dark“ entfernt den
  Eintrag; bleibt nur der Grundeintrag übrig, wird daraus wieder `X` (Hin und Zurück ist bytegleich), bleibt nichts,
  entfällt der Schlüssel. Neue Einträge in der Reihenfolge Grund → dark → tinted. Rein in
  `document/model/specializations.ts` (`resolveSpecialized`, `specializedEdits`, `removeVariantEdits`).
- **E4 Neue Schlüssel alphabetisch** (`setIn`): ist ein Objekt sortiert (wie jede Icon-Composer-Datei), kommt ein
  neuer Schlüssel an seine alphabetische Stelle, sonst ans Ende. Damit bleibt eine Icon-Composer-Datei auch nach
  dem Bearbeiten sortiert, und `fill` → `fill-specializations` landet an derselben Stelle (beantwortet 002 Frage 2
  für neue Schlüssel; vorhandene Reihenfolgen bleiben, wie sie sind).
- **E5 Änderungen = `SetIconJsonValue`** (003), mehrere als `composite` mit **einem** sprechenden Undo-Namen
  (Change Background, Change Shadow, Change Translucency, Change Group Opacity, Change Layer Opacity, Change Blend
  Mode, Change Lighting, Change Specular, Change Blur, Change Glass, Change Position, Change Layer Fill, Rename
  Group, Rename Layer, Change Layer Asset, Change Platforms, Change Color Space, Remove Appearance Variant;
  Sichtbarkeit nutzt das vorhandene „Toggle Visibility“). Unterfelder werden einzeln geschrieben (`…/shadow/opacity`),
  damit unbekannte Unterschlüssel bleiben; fehlt das Objekt, wird es mit den Standardwerten angelegt (das Schema
  verlangt `kind`+`opacity`, `enabled`+`value`, `scale`+`translation-in-points`). Getippte Werte und Slider sind
  Gesten wie in 009 (E4: `begin`/`update`/`commit`/`cancel`, `merge` gleicher Pfade → ein Schritt).
- **E6 Fill-Sicht** (`inspector/fill-model.ts`, rein): `readFill(value) → FillModel` (`preset` automatic/
  system-light/system-dark/none · `solid` · `automatic-gradient` · `linear-gradient` mit Farben und optionaler
  Orientierung · `radial-gradient` (nur gelesen, E7) · `unknown`). `writeFill(model)` gibt für ein ungeändertes Modell
  **denselben Wert** zurück (die Sicht hält Rohtexte der Farben und das Original-Objekt; geschrieben werden nur
  geänderte Teile, Schlüsselreihenfolge des Originals). Artwechsel übernimmt Farben sinnvoll (solid ↔ erste Farbe,
  → linear: [Farbe, Farbe um 14 % dunkler], Orientierung Icon-Composer-Standard). Neue Farbe ohne Vorlage:
  `display-p3:0.00000,0.53333,1.00000,1.00000` (Palette der Vorlage, im häufigsten Format).
- **E7 `radial-gradient`** ist nicht belegt: wird gelesen, in der Vorschau gezeigt und seine Farben sind
  bearbeitbar, als **neue** Art aber nicht wählbar (Frage an Marc).
- **E8 Farben** (`inspector/icon-color-text.ts`, rein; Lesen über `canvas/icon-color.ts` aus 004): Anzeige als Hex
  der Kanäle **im Farbraum der Datei** (der Raum steht daneben, z. B. „display-p3“) – kein Umrechnen, damit Hin und
  Zurück verlustfrei ist. Schreiben in der gelesenen Form: gleicher Präfix, gleiche Anzahl Komponenten,
  5 Nachkommastellen; ein Grau (`gray`/`extended-gray`) mit Buntwert wird zu `srgb`/`extended-srgb`. Werte außerhalb
  0…1 (extended) bleiben als Text sichtbar und editierbar (Textfeld nimmt auch die Apple-Schreibweise an).
- **E9 Layer:** Name eindeutig (`uniqueLayerName` aus 003, Vergleich ohne den eigenen Namen). Asset wählen = Auswahl
  aus den Assets des Dokuments (`image-name`, je Appearance wie E3 → `image-name-specializations`). **Asset
  umbenennen** = neuer Command `renameAsset { from, to }` (registriert, JSON-Roundtrip) plus `SetIconJsonValue` für
  jede Referenz (`image-name` und `image-name-specializations` aller Layer) als ein Schritt „Rename Asset“; der Name
  wird eindeutig gemacht (`uniqueAssetName`), die Endung bleibt, wenn keine getippt wurde. Beim Speichern meldet das
  Frontend ein umbenanntes, sonst unverändertes Asset als `{ name: neu, unchanged: true, source: alt }` – Rust nimmt
  die Bytes aus der Sitzung unter dem alten Namen (DTO-Erweiterung, E11), so überlebt auch ein PNG das Umbenennen.
- **E10 Plattformen** (`inspector/platforms.ts`, rein): Squares = Auswahl `shared` · `iOS` · `macOS` · `iOS + macOS`
  · Off (Schlüssel entfällt); Listen werden als Liste geschrieben (`["iOS"]`). Circles = Schalter watchOS (fügt
  `watchOS` in die Liste ein bzw. entfernt es; leere Liste → Schlüssel entfällt; andere Einträge bleiben). Ein
  unbekannter Wert wird gezeigt und bleibt, bis man ihn ändert.
- **E11 Rust:** (a) `SaveAssetDto.source?` (E9) → `AssetInput.source`; (b) leere Listen wie Icon Composer
  `[\n\n<indent>]` (Regel 3; leere Objekte bleiben `{}` – nicht belegt); (c) Fixture `testdata/fixtures/
  all-fields.icon` mit allen belegten Feldern auf jeder Ebene, Specializations mit `idiom`, `appearance: light` und
  Zusatzfeldern (`x-future`); Test: lesen → ein Feld ändern → speichern → alles andere gleich, Format wie Icon
  Composer, und unverändert = bytegleich.
- **E12 icon.json Preview** (`inspector/json-preview.ts`): der ganze `icon.json`-Text im Icon-Composer-Format
  (`icon-json-text.ts`, rein, gleiches Format wie Rust `json_format.rs` – Test gegen `camscanner.icon` bytegleich),
  Monospace, read-only, Knopf „Copy“ (`ClipboardApi` aus 006). Die Zeilen der letzten Änderung (Diff des
  vorigen gegen den neuen Text: gemeinsamer Anfang/Ende) werden hervorgehoben und ins Bild gescrollt.
- **E13 Canvas-Vorschau** (`canvas/effects.ts`, rein, + `LayerStack`): Gruppen- und Layer-Werte je Appearance
  (Opacity, Hidden, Position, Blend-Mode jetzt auch aus Specializations). **Annäherung**, Ansichtsoption
  „Effects Preview (approximation)“ (`view.effects`, Standard an): Schatten als SVG-Filter je Layer im eigenen
  Shadow Root (`feDropShadow` schwarz bei `neutral`; `layer-color` = Weichzeichnung des Layers, abgedunkelt, mit der
  Opacity des Schattens) – je Layer statt je Gruppe, weil jeder Layer eigenen Tree Scope hat und so die Längen in
  Dokumenteinheiten bleiben (zoomfest); Transluzenz als Opacity-Verlauf über die Gruppe (CSS `mask-image`, oben 1,
  unten `1 − value/2`), Blend-Mode als CSS `mix-blend-mode` (`plus-darker` ohne CSS-Gegenstück → `normal`),
  Gruppen-`position` als SVG-Transform vor der des Layers. Liquid Glass (`specular`, `blur-material`, `lighting`,
  `glass`) und Layer-`fill` werden nicht nachgebaut. Im Inspector steht bei Schatten/Transluzenz „Preview
  approximation“.
- **E14 Aktionen** (KI-Regel), Handler im `IconInspectorService` (Root):
  `icon.setFill { fill, appearance? }`, `icon.set { target?, field, value, appearance? }` (alle Felder aus E1 außer
  Namen; `target` = `{ group }` | `{ group, layer }`, ohne = Root; `value` JSON, geprüft je Feld),
  `icon.removeVariant { target?, field, appearance }`, `icon.renameGroup { group, name }`,
  `icon.renameLayer { group, layer, name }`, `icon.renameAsset { from, to }`,
  `icon.setPlatforms { squares?, circles? }`, `icon.copyJson`. Jede Aktion = ein Undo-Schritt.
- **E15 009-Nacharbeit (Roundtrip):** `styleWithout` entfernt die Deklaration jetzt **textuell**
  (`svg/style-props.ts`: Deklarationen an `;` außerhalb von Strings, Klammern und Kommentaren getrennt, Name vor
  dem ersten `:`, Groß-/Kleinschreibung egal); der Rest des `style`-Attributs bleibt Zeichen für Zeichen (auch
  `-inkscape-…`). Nur wenn danach eine Kurzschreibweise den Wert noch setzt (CSSOM fragt, z. B. `font` für
  `font-size`), wird diese über das CSSOM entfernt (der einzige Fall mit Verlust; vorher immer).

## Verträge

```ts
// document/model/specializations.ts (rein)
type AppearanceKey = 'default' | 'dark' | 'tinted';
interface Resolved { value: unknown; source: 'variant' | 'base' | 'default'; path: JsonPath | null; hasIdiom: boolean }
resolveSpecialized(obj, objPath, key, appearance, fallback): Resolved
specializedEdits(obj, objPath, key, appearance, value): JsonEdit[]     // E3
removeVariantEdits(obj, objPath, key, appearance): JsonEdit[]
specialized(specs, appearance, fallback)                               // (004, jetzt idiom-sicher)
interface JsonEdit { path: JsonPath; value: unknown /* undefined = remove */ }
editsCommand(edits, label): DocCommand | null                         // SetIconJsonValue | composite

// features/inspector/
icon-fields.ts      FieldDef { key, label, kind: number|enum|toggle|text|fill|asset|shadow|translucency|position|blur,
                    targets, default, undo, options?, min?, max?, step? }; FIELDS; fieldsFor(target)
fill-model.ts       FillModel; readFill(v); writeFill(m); switchKind(m, kind); FILL_KINDS
icon-color-text.ts  hexOf(raw); withHex(raw, hex); spaceOf(raw); DEFAULT_COLOR
platforms.ts        readSquares(v); squaresValue(choice, old); hasWatch(v); circlesWith(v, on)
icon-json-text.ts   formatIconJson(value): string; changedLines(before, after): { from, to } | null
inspector-edit.ts   setFieldEdits(doc, target, field, value, appearance); renameLayer/Group/Asset commands; validators
icon-inspector.service.ts  appearance signal, Gesten (edit/commit/cancel), set/removeVariant/rename… (Aktionen)
icon-inspector.ts, fill-editor.ts, icon-color-field.ts, json-preview.ts, other-properties.ts, inspector-texts.ts

// document/commands
RenameAsset { from, to }   // type 'renameAsset', label renameAsset; Asset behält Position, `source` für das Speichern
AssetState.source?: string // Name in der Backend-Sitzung (E9)
SaveAsset.source?: string  // TS + Rust SaveAssetDto
```

Rust: `SaveAssetDto { name, text?, unchanged, source? }`, `AssetInput { …, source: Option<String> }`;
`format_icon_json` mit Icon-Composer-Leerlisten. Kein neuer Command, keine neue Abhängigkeit.

## Tests

- Vitest: `specializations` (alle Wege aus E3 hin und zurück bytegleich, idiom/light unangetastet, Reihenfolge),
  `setIn` sortiert/unsortiert, `fill-model` (jede Art lesen → schreiben = gleicher Wert, unbekannte Formen
  unverändert, Artwechsel), `icon-color-text` (alle Präfixe, Präzision, Grau → sRGB, extended), `platforms`,
  `icon-json-text` (camscanner bytegleich, Leerlisten, `changedLines`), `inspector-edit` (Layer-Opacity,
  Unterfelder, eindeutige Namen, Asset umbenennen + Referenzen, Undo = Original), `RenameAsset` (Registry,
  Roundtrip, Speichern mit `source`), Inspector-Komponente (Root/Gruppe/Layer, read-only-Liste, Appearance),
  `effects`, `style-props` (E15, zuerst rot).
- Rust: `all-fields.icon` (E11), `source` beim Speichern (auch PNG), Leerlisten-Format (`New.icon`-Text).
- Playwright `e2e/inspector.spec.ts`: Fill auf linear-gradient → Canvas zeigt Verlauf (Pixelfarben oben/unten);
  Undo → wieder automatic; JSON-Vorschau zeigt und markiert die Änderung; Dark-Variante anlegen/entfernen;
  Layer-Opacity-Slider → Canvas-Opacity; Schatten-Vorschau als Filter vorhanden.

## Fragen an Marc

1. **Auf dem Mac prüfen:** eine in AppIconic bearbeitete Datei (Fill linear-gradient mit Dark-Variante, Gruppen-
   Schatten/Transluzenz geändert, Layer-Opacity, umbenanntes Asset) in Icon Composer öffnen – sieht sie aus wie
   erwartet?
2. **Bearbeiten in Dark/Tinted legt eine Variante an** (E3, wie es die Dateien nahelegen). Ist das Icon Composers
   Verhalten, oder gibt es dort einen eigenen Schalter „für alle Appearances“?
3. **`radial-gradient`** (E7): kennt Icon Composer das? Bis dahin nur lesen.
4. **Eingebaute Standards** fehlender Felder sind angenommen (Anzeige, nichts wird geschrieben): `specular` an,
   `blur-material` aus, `lighting` combined, `glass` an, `opacity` 1, `blend-mode` normal, Schatten neutral 0,5,
   Transluzenz an 0,5, Layer-`fill` automatic. Stimmt das mit Icon Composer überein?
5. **`squares` als Liste** (`["iOS"]` …) steht nur im Schema – in welcher Form schreibt Icon Composer es?
6. Farben werden im Raum der Datei als Hex gezeigt (E8), nicht in sRGB umgerechnet. Lieber umrechnen?

## Fortschritt

- [x] Design
