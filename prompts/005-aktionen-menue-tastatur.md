# Prompt 005: Aktionen, Menü und Tastatur

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 003 · legacy §4 · Vorbild: editlicious 005 /
> comic-commander 008 (Code darf übernommen werden, mit Herkunftsvermerk)

## Ziel

Jede Funktion ist eine **Aktion** mit Id, Text, Kontext und Kürzel. Daraus entstehen das native macOS-Menü, die
HTML-Menüleiste unter Windows/Linux, die Befehlspalette und die Tastatur – aus **einem** Modell. Damit sind alle
Kürzel der Vorlage (legacy §4) an einer Stelle.

## Umfang

- `core/actions/`: `action-catalog.ts` (Ids, Gruppen, Kontexte `global`/`canvas`/`hierarchy`/`dialog`),
  `keymap.base.json` + `keymap.mac.json` + `keymap.other.json` (`Mod` = ⌘ bzw. Ctrl), `ActionService`
  (Handler registrieren mit `DestroyRef`, `enabled`/`checked` als Signals), `KeyboardDispatcher` (der **einzige**
  globale `keydown`-Listener; ruht in Textfeldern, CodeMirror und offenen Dialogen), `shortcut.ts` (Anzeige je OS).
- Optional `keymap.json` im Config-Ordner zum Überschreiben (Rust `keymap_file.rs`, ≤ 64 KiB, geprüft).
- Menümodell (`features/menus/menu-model.ts`, rein): **File** (New Window ⇧⌘N, New ⌘N, Open… ⌘O, Open Recent ›,
  Import SVG… ⇧⌘I, Export SVG…, Export PNG…, Save ⌘S, Save As… ⇧⌘S, Close ⌘W), **Edit** (Undo „Undo <Aktion>“ ⌘Z,
  Redo ⇧⌘Z, Cut/Copy/Paste/Duplicate/Delete, Select All, Deselect), **View** (Command Sidebar ⌘1, Hierarchy ⌘2,
  Properties ⌘3, Rulers, Guides, Background, Cross Cursor, Show Handles, Snap to Grid, Magic Snap, Zoom In/Out/
  Actual Size/Center Canvas, Appearance Light/Dark, Platform Mask), **Add** (alle Add-Befehle, ⌘I = Image),
  **Arrange** (Bring to Front, Send to Back, Group <g>, Align …), **Help** (Shortcuts, About).
  Einträge, deren Funktion erst ein späterer Prompt liefert, sind vorhanden und deaktiviert.
- Rust `app_menu.rs`: `set_app_menu(spec)` (Spec geprüft: Größe, Tiefe, Ids, Texte), Ereignis `menu-action`; auf
  macOS **kein** vordefiniertes Edit-Menü, damit ⌘Z in der WebView nicht doppelt wirkt (editlicious-Erfahrung);
  Kopieren/Einfügen in Textfeldern trotzdem funktionsfähig halten (Design-Dokument).
- HTML-Menüleiste (Windows/Linux) nach APG, Befehlspalette (⇧⌘P, filterbar), Dialog „Keyboard Shortcuts“.
- „View Options“-Popover in der Canvas-Toolbar mit denselben Toggle-Aktionen (legacy).

## Tests

- Vitest: Keymap-Auflösung je OS, Konflikte (Test: keine doppelten Kürzel je Kontext), Dispatcher ruht in Eingaben,
  Menümodell (alle Aktionen haben Texte, Kürzel nur mit Modifier/F-Taste im nativen Menü), Palette filtert.
- Rust: Spec-Validierung (feindliche Eingaben), Accelerator-Umsetzung.
- Playwright: Kürzel ⌘1/⌘2/⌘3 blenden Panels, Palette führt eine Aktion aus.

## Akzeptanz

- Alle Kürzel aus legacy §4 funktionieren (soweit die Funktion existiert), macOS-Menü unter Xvfb nicht prüfbar →
  Spec-Test + Sichtprüfung auf dem Mac im Bericht anfragen. `pnpm check` + `pnpm e2e` grün.
