# Prompt 006: Hierarchie (Ebenenbaum)

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 004, 005 · Meilenstein 5 aus `000-init.md` ·
> legacy §7.1–§7.3

## Ziel

Das Hierarchy-Panel zeigt das ganze Dokument als Baum und ist neben dem Canvas der zweite Weg zur Auswahl und zum
Umordnen – vollständig per Tastatur und Maus bedienbar.

## Umfang

- Baum: **Root** (Hintergrund-Fill) → **Icon-Gruppen** → **Layer** (Asset) → **SVG-Nodes** rekursiv (`defs`,
  `clipPath`, Verläufe in einem eingeklappten Knoten „Definitions“, nicht selektierbar für Canvas-Aktionen).
  Baummodell rein aus dem Dokument abgeleitet (`hierarchy-model.ts`, `computed`), Zeilen virtualisiert ab ~500.
- Zeile: Typ-Icon, Name (`id`, sonst Elementname + Kurzinfo), **Farb-Swatches** für Fill und Stroke (Weiß mit Rand,
  `none` durchgestrichen, Verlauf als Mini-Verlauf), **Sichtbarkeit** (`display: none` an/aus; Alt-Klick rekursiv;
  für Layer/Gruppe über `icon.json` `hidden`, falls im Format – sonst Design entscheidet).
- **Auswahl** synchron mit dem Canvas (beidseitig, `DocumentStore.selection`), ⇧ = Bereich, ⌘/Ctrl = einzeln,
  Pfeiltasten/Home/End/←/→ (auf-/zuklappen) nach APG Tree-Pattern, Auto-Scroll zur Auswahl.
- **Drag & Drop** mit Einfügelinie: vor / nach / hinein (nur in Container); Gruppen und Layer in `icon.json`,
  Nodes im SVG, auch über Asset-Grenzen (Node wechselt das Asset; Referenzen `url(#…)` melden); Schutz gegen
  Einfügen in eigene Nachfahren (`TreeReorderServiceTests` der Vorlage als Testfälle). Ein Command „Reorder Node“.
  Tastatur-Alternative: Aktionen „Move Up/Down“, „Move Into/Out of Group“.
- **Kontextmenü** (APG Menu): Duplicate, Group <g> (Surround with Group), Bring to Front, Send to Back,
  Edit SVG… (öffnet 011), Copy XML, Delete… (Bestätigung „removes the node and its children“). Gleiche Aktionen
  im Menü „Arrange“/„Edit“ (005).
- **Löschen** mit Folge-Auswahl: nächster Sibling, sonst vorheriger, sonst Eltern.
- **Copy/Paste** als SVG-XML über die Zwischenablage (`navigator.clipboard.writeText`/`readText`; im Tauri-Fenster
  prüfen, sonst schmaler Rust-Command mit `arboard`): Einfügen bereinigt (`sanitize-svg`), vergibt neue IDs, löst
  `id`-Kollisionen, funktioniert zwischen Dokumenten/Fenstern.
- **Ausrichten** (≥ 2 Nodes): links, horizontal zentriert, rechts, oben, vertikal zentriert, unten – Bezug ist die
  Vereinigung der Bounding-Boxes **im Dokumentraum inkl. Transforms** (über `getBBox` + CTM), umgesetzt als
  vorangestelltes `translate` im lokalen Koordinatensystem jeder Node (Inverse der Eltern-CTM). Eine Undo-Aktion.

## Tests

- Vitest: Baummodell, Reorder-Regeln (Nachfahren, Asset-Wechsel, Gruppen/Layer), Folge-Auswahl, Duplicate/Paste
  (ID-Konflikte), Swatch-Ableitung.
- Playwright: Ausrichten mit `nested_g.svg` (transformierte Gruppen) – Ergebnis-Bounds per `getBBox`/CTM gleich auf
  ± 0,5; Drag & Drop mit Maus; Tastaturbedienung des Baums.

## Akzeptanz

- Alle Punkte aus `docs/FEATURES.md` §6 abgehakt. `pnpm check` + `pnpm e2e` grün.
