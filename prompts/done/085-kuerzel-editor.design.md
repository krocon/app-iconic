# Design 085: Tastenkürzel in der App ändern

> Prompt: [085-kuerzel-editor.md](085-kuerzel-editor.md) · Stand: 30.10.2026 · baut auf 005 (Aktionen, Keymaps,
> Dispatcher, natives Menü, `keymap.json`), 015 (Einstellungen, Ereignis an alle Fenster), 068 (Aktions-Ids und
> Kürzel unverändert, kein Befehl doppelt im Menü)

## Belege

- **Apple HIG, „Keyboards“ – Standard keyboard shortcuts**
  (https://developer.apple.com/design/human-interface-guidelines/keyboards): „In general, don’t repurpose standard
  keyboard shortcuts for custom actions“; Tabelle der Standardkürzel (⌘Space Spotlight, ⌘Tab/⇧⌘Tab App-Wechsel,
  ⌥⌘Esc Sofort beenden, ⌘H/⌥⌘H Ausblenden, ⌘M Minimieren, ⌘Q Beenden, ⇧⌘Q Abmelden, ⌘\` Fensterwechsel, ⌃F1…⌃F7
  Tastaturzugriff, ⌘F5 VoiceOver, ⌥⌘D Dock, ⌃⌘F Vollbild, ⌃Space Eingabequelle, Tab/⇧Tab Fokus) – und: „Avoid using
  the Control key as a modifier. The system uses Control in many systemwide features“.
- **Microsoft Support, „Keyboard shortcuts in Windows“**
  (https://support.microsoft.com/en-us/accessibility/windows/keyboard-shortcuts-in-windows): Alt+F4 schließt das
  Fenster, Alt+Tab/Alt+Esc wechseln Fenster, Ctrl+Alt+Del Sicherheitsbildschirm, Ctrl+Shift+Esc Task-Manager,
  Ctrl+Esc Start, Alt+Space Fenstermenü, Windows-Taste + … Systemfunktionen, F10 Menüleiste.
- Linux (GNOME/KDE) folgt bei Alt+Tab, Alt+F4, Super+… denselben Regeln; die App behandelt Windows und Linux gleich
  (`Os = 'other'`, 005 E2).

## Entscheidungen

- **E1 Datenfluss:** Die Keymap eines Fensters ist weiter `buildKeymap(os, overrides)` (005 E14). Der Editor ändert
  die **wirksamen Kürzel je Aktion** (rein, `core/actions/keymap-edit.ts`), daraus werden die **Abweichungen** von den
  eingebauten Keymaps (`deviations`) und daraus der Patch an Rust: jede Katalog-Aktion mit ihren Kürzeln, wenn sie
  abweicht, sonst `null` (= Eintrag entfernen). So enthält `keymap.json` nur Abweichungen, und Rust muss die
  Keymap-Syntax nicht kennen (ein Parser, 005 E14). Eine Aktion, der ein Kürzel genommen wurde, weicht ab und steht
  mit ihrem Rest (ggf. `[]`) in der Datei – das Laden ist damit unabhängig von der Reihenfolge.
- **E2 Rust `keymap_file::save(dir, changes)`**: liest die Datei als JSON-Objekt (Reihenfolge erhalten,
  `preserve_order`), ersetzt bzw. entfernt nur die genannten Einträge unter `bindings`, **alle anderen Felder und
  Einträge bleiben** (unbekannte Aktionen, eigene Felder wie `"comment"`), `version: 1` falls fehlend, schreibt
  formatiert und **atomar** (`write_atomic`) und gibt die neu geladene Datei zurück. Eingaben geprüft: Ids wie im
  Menü, ≤ 8 Kürzel, Kürzeltext wie beim Laden, ≤ 1000 Einträge → sonst `invalid_keymap` (neuer Fehlercode). Kaputte
  Datei → wie beim Laden als `.bad` beiseite und neu; nicht lesbare Datei → Fehler, nichts überschrieben; Ergebnis
  > 64 KiB → `too_large`. Der Pfad ist intern (`app_config_dir()/keymap.json`), der Command nimmt keinen Pfad an.
- **E3 Command `save_keymap(changes)`** (`menu_commands.rs`, async + `spawn_blocking`) sendet danach
  `keymap-changed { bindings, warning }` an **alle** Fenster. Jedes Fenster baut daraus seine Keymap neu
  (`ActionService.applyOverrides`); das Menümodell hängt an der Keymap, also schickt jedes Fenster eine neue Spec,
  und auf macOS setzt `app_menu` die Accelerators des vorderen Fensters neu (005 E6) – ohne neuen Rust-Code im Menü.
- **E4 Aufnahme ohne Auslösen** (CLAUDE.md: genau ein globaler `keydown`-Listener): der `KeyboardDispatcher` hat
  einen **Aufnahme-Modus** (`record(sink)` → Stopp-Funktion, Signal `recording`). Solange er läuft, löst `handle`
  keine Aktion aus und `keyup` fokussiert die Menüleiste nicht. Das Aufnahmefeld (ein Knopf in der Zeile) gibt
  seine Tastenereignisse an `dispatcher.capture(e)`: Kürzel per `chordOf` (dieselbe Notation wie die Keymaps),
  `preventDefault` + `stopPropagation` – so schließt Esc nicht den Dialog und Tab verlässt das Feld nicht. Esc allein
  bricht die Aufnahme ab, einzelne Modifier werden ignoriert. Auf macOS fangen native Menü-Accelerators ⌘-Kürzel vor
  der WebView ab: während der Aufnahme schickt der `MenuService` eine Spec **ohne Accelerators** (Frage 1).
- **E5 Konflikte** (`conflicts`): eine andere Aktion mit demselben Kürzel in einem Kontext, der **gleichzeitig aktiv**
  sein kann (`key-contexts.ts`: `dialog` allein; `hierarchy`+`global`; `drawing`+`canvas`+`global`). Angebot in der
  Zeile: **Ersetzen** (die anderen verlieren das Kürzel), **Tauschen** (nur bei genau einer anderen Aktion und wenn
  ein altes Kürzel ersetzt wird: sie bekommt das alte Kürzel – wenn das bei ihr selbst keinen Konflikt und keine
  Sperre ergibt), **Abbrechen**. Bestehende, gewollte Überdeckungen der eingebauten Keymaps (Esc global/Canvas)
  bleiben unangetastet, solange niemand sie ändert.
- **E6 Reservierte Kürzel** (`core/actions/reserved-shortcuts.ts`, Quelle je Eintrag): **gesperrt** = das System oder
  das native Menü nimmt sie vor der App (macOS: ⌘Tab, ⇧⌘Tab, ⌘Space, ⌥⌘Space, ⌃⌘Space, ⌥⌘Esc, ⌃⌘Q, ⇧⌘Q, ⌘H,
  ⌥⌘H, ⌘M, ⌘Q, ⌃Space; Windows/Linux: Alt+F4, Alt+Tab, Alt+Shift+Tab, Alt+Esc, Alt+Space, Ctrl+Esc,
  Ctrl+Shift+Esc, Ctrl+Alt+Delete, jede Windows-/Super-Taste; überall Tab und ⇧Tab – Fokuswege, Barrierefreiheit).
  **Gewarnt** = Standardbedeutung laut HIG/Microsoft (⌘\`, ⌃F1…⌃F7, ⌘F5, ⌥⌘D, ⌃⌘F, ⌘W, ⌘,; F10 unter
  Windows/Linux, Ctrl als Modifier auf macOS): Aufnahme erlaubt, die Zeile zeigt den Hinweis. **Feste Aktionen** auf
  macOS: `app.quit` (⌘Q fest im App-Menü, `app_menu.rs`), `edit.cut/copy/paste/selectAll` (vordefinierte
  Cocoa-Einträge, 005 E7) – ihre Kürzel sind nicht änderbar, die Zeile zeigt ein Schloss.
- **E7 Dialog** (`ShortcutsDialog`, ⌘/): Filter nach Name **und** Kürzel (in der Schreibweise des OS, `⌘⇧P` wie
  `Ctrl+Shift+P`), Ansicht **je OS** (Segment „macOS / Windows & Linux“; das eigene OS ist bearbeitbar, das andere
  zeigt dieselbe `keymap.json` auf den Keymaps des anderen OS, nur lesend), „Nur geänderte“. Jede Zeile
  (`ShortcutRow`): Kürzel-Chips (Klick = dieses Kürzel neu aufnehmen, × = entfernen), „+“ = weiteres aufnehmen,
  „Zurücksetzen“ wenn abweichend; Konfliktleiste mit Tauschen/Ersetzen/Abbrechen; unten „Alle zurücksetzen…“ (fragt).
  Aktionen mit Pflicht-Argumenten (`settings.set`, `edit.runCommand` …) erscheinen nicht – ein Kürzel kann sie nicht
  ausführen. Die Tabelle zeigt nun **alle** Aktionen (auch ohne Kürzel), sonst könnte man keinem ein Kürzel geben.
- **E8 Aktionen** (KI-Regel): `keymap.set { action, chords }` (setzt genau diese Kürzel, Konflikte werden ersetzt;
  gesperrte Kürzel und feste Aktionen → nicht ausgeführt), `keymap.reset { action? , confirm? }` (eine bzw. alle;
  alle fragt, außer `confirm: false`). Beide sind für die KI gesperrt (`mcp-policy`: Kürzel gehören dem Nutzer, wie
  `mcp.*`). `keymap.set` nicht in der Palette.
- **E9 Fakes:** `FakeKeymapApi.save(changes)` wendet den Patch wie Rust an (unbekannte Einträge bleiben) und meldet
  `onChanged` an alle Zuhörer. Im Browser-Modus liegt die „keymap.json“ in `localStorage`; ein zweites Fenster
  (zweiter Tab derselben Herkunft) bekommt die Änderung über das `storage`-Ereignis – das ist im Browser die
  Nachbildung von `keymap-changed` an alle Fenster.
- **E10 Dateigrößen:** `app.ts` (414 Zeilen) bleibt unverändert – das Abonnieren von `keymap-changed` gehört in
  `ActionService.loadOverrides` (startet ohnehin dort).

## Verträge

```rust
// ai-core::keymap_file
pub type KeymapChanges = BTreeMap<String, Option<Vec<String>>>;
pub fn save(config_dir: &Path, changes: &KeymapChanges) -> Result<KeymapOverrides, FsError>;
// app: menu_commands.rs
#[tauri::command] pub async fn save_keymap(app, changes: KeymapChanges) -> Result<KeymapOverrides, FsError>;
pub const KEYMAP_CHANGED: &str = "keymap-changed";   // payload KeymapOverrides, an alle Fenster
// error.rs: FsErrorCode::InvalidKeymap ("invalid_keymap")
```

```ts
// core/menu/menu-api.ts
abstract class KeymapApi { loadOverrides(); save(changes: KeymapChanges): Promise<KeymapOverrides>;
                           onChanged(fn: (o: KeymapOverrides) => void): Promise<() => void> }
type KeymapChanges = Record<string, string[] | null>;            // menu.models.ts
// core/actions/keymap-edit.ts (rein)
type ChordMap = Map<string, string[]>;                            // Aktion → Kürzel
chordMap(keymap): ChordMap; defaults(os): ChordMap; overlaps(a, b): boolean;
conflicts(map, id, chord): string[]; assign(map, os, { id, chord, old?, resolution? }): AssignResult;
removeChord(map, id, chord); resetAction(map, os, id); deviations(map, os): Record<string, string[]>;
changesFor(map, os): KeymapChanges; editable(os, id): boolean; bindable(def): boolean
// core/actions/reserved-shortcuts.ts (rein)
reservation(os, chord): { level: 'blocked' | 'warn'; reason: ReservedReason; source: 'apple' | 'microsoft' | 'app' } | null
FIXED_ACTIONS_MAC: ReadonlySet<string>
// KeyboardDispatcher: recording: Signal<boolean>; record(sink): () => void; capture(e): void
// ActionService: applyOverrides(o); overrides(): Record<string, string[]> (zuletzt geladen)
// features/menus/keymap-editor.service.ts: KeymapEditor { map, set(id, chords), assign(…), remove(id, chord),
//   reset(id), resetAll(), deviating(id) }
```

## Tests

- Rust `keymap_file`: nur Abweichungen (null entfernt, gesetzt ersetzt), handgeschriebene Datei mit eigenen Feldern,
  unbekannter Aktion und Reihenfolge übersteht ein Speichern; leerer Patch = semantisch gleiche Datei;
  feindliche Eingaben (`../x`, 9 Kürzel, Steuerzeichen, zu viele Einträge) → `invalid_keymap`; kaputte Datei → `.bad`;
  zu groß → `too_large`; Command-Regel (5 async Commands).
- Vitest: `keymap-edit` (Konflikte je Kontext, Ersetzen, Tauschen, Abweichungen und Roundtrip über `buildKeymap`,
  Zurücksetzen nimmt das Kürzel zurück, Patch für alle Katalog-Aktionen), `reserved-shortcuts`,
  `KeyboardDispatcher` (Aufnahme: keine Aktion, Esc bricht ab, Modifier allein ignoriert),
  `ActionService.applyOverrides` + `keymap-changed`, `KeymapEditor` mit Fake (speichert Patch, wendet an),
  `ShortcutsDialog` (Filter nach Kürzel, Aufnahme → Konflikt → Ersetzen/Tauschen, Zurücksetzen, OS-Ansicht nur
  lesend), `MenuService` (Spec ohne Accelerators während der Aufnahme), Policy; `keymaps.test.mjs` bleibt grün.
- Playwright `e2e/shortcut-editor.spec.ts`: Kürzel von „Rotate Tool“ auf `q` ändern → `q` aktiviert das Drehwerkzeug
  sofort, ⇧R nicht mehr; ein zweiter Tab (zweites Fenster) übernimmt es über das Ereignis; Zurücksetzen → ⇧R wieder.

## Fragen an Marc

1. **macOS-Aufnahme**: fängt das native Menü ⌘-Kürzel trotz Spec ohne Accelerators während der Aufnahme (E4)? Unter
   Xvfb nicht prüfbar. Falls das Umbauen des Menüs (150 ms) zu langsam wirkt: erst nach kurzer Pause aufnehmen?
2. Sperren vs. warnen (E6): ⌘W/⌘, nur warnen (das sind unsere eigenen Close/Settings), ⌘Q gesperrt – passt das?

3. Esc beendet die Aufnahme und lässt sich deshalb nicht als neues Kürzel aufnehmen (nur über `keymap.json` oder
   Zurücksetzen) – ok?

## Fortschritt

- [x] Design
- [x] Rust: `keymap_file::save` (7 Tests: nur Patch, handgeschriebene Datei mit eigenen Feldern/unbekannter Aktion/
      Reihenfolge, leerer Patch = gleiche Datei byte-genau, feindliche Eingaben, `.bad`, zu groß, unlesbar), Command
      `save_keymap` + `keymap-changed`, Fehlercode `invalid_keymap`
- [x] Frontend: `keymap-edit`, `reserved-shortcuts`, Aufnahme-Modus im Dispatcher, `ActionService.applyOverrides` +
      Ereignis, `KeymapEditor`, `ShortcutsDialog` + `ShortcutRow` + `shortcuts-model`, Aktionen `keymap.*`, Menü ohne
      Accelerators während der Aufnahme, Fake mit `localStorage`/`storage`-Ereignis; `app.ts` 414 → 400 Zeilen
      (`shell/shell-actions.ts`)
- [x] Playwright `e2e/shortcut-editor.spec.ts` (2 Tests), `actions.spec` an die neue Liste angepasst
- [x] Doku

## Abweichungen und Grenzen

- Die Kürzel-Liste ist keine Tabelle mehr, sondern eine Liste von Zeilen-Komponenten (je Zeile Knöpfe und eine
  Konfliktleiste); Überschriften je Menü als `h3`.
- Die echte App (Xvfb) wurde nicht durchgespielt: das Verhalten über mehrere Fenster hängt nur am Ereignis
  `keymap-changed` (wie `settings-changed`, 015), im Browser-Modus über zwei Tabs geprüft. Das native macOS-Menü ist
  unter Linux nicht prüfbar (Frage 1).
- Tauschen nur bei genau einer anderen Aktion und wenn ein vorhandenes Kürzel ersetzt wird (beim Hinzufügen gibt es
  nichts zurückzugeben).
