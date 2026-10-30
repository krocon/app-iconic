# Prompt 085: Tastenkürzel in der App ändern

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 005, 015, 068 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §3.6 (P3)

## Ziel

Kürzel direkt im Kürzel-Dialog ändern statt `keymap.json` von Hand zu bearbeiten.

## Ausgangslage

`menus/shortcuts-dialog.ts` liest die Keymaps inkl. `keymap.json` (Rust `keymap_file.rs`) und zeigt sie an.

## Umfang

- In der Tabelle: Eintrag wählen → „Neues Kürzel drücken“ (Aufnahme ohne dass der KeyboardDispatcher auslöst),
  Konfliktwarnung mit Angebot zu tauschen oder zu ersetzen, „Zurücksetzen“ je Eintrag und für alle, Entfernen.
  Reservierte/System-Kürzel (z. B. ⌘Q, ⌘H, ⌘W auf macOS) gesperrt oder gewarnt.
- **Rust:** `save_keymap` schreibt nur die Abweichungen nach `keymap.json` (atomar, bestehendes Format, unbekannte
  Einträge erhalten); Ereignis an alle Fenster; natives Menü aktualisiert Accelerators (005).
- Filter nach Name/Kürzel; Anzeige je OS.

## Akzeptanz

- Rust: Speichern nur der Abweichungen, Roundtrip mit handgeschriebener Datei.
- Vitest: Konflikterkennung, Aufnahme, Zurücksetzen; `keymaps.test.mjs` bleibt grün.
- Playwright: Kürzel für „Rotate Tool“ ändern → wirkt sofort, auch im zweiten Fenster; zurücksetzen.
