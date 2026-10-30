# Design 061: Auswahlwerkzeug und sichtbarer Werkzeugstatus

> Prompt: [061-auswahlwerkzeug.md](061-auswahlwerkzeug.md) · Stand: 30.10.2026

## Befund (geprüft)

- Kein Auswahlwerkzeug, kein `v`/`a` in den Keymaps.
- Es gab bereits eine zentrale Stelle für „ein Werkzeug zur Zeit“: `CanvasTools` (Root, design 019 E3) – alle
  Zeiger-Werkzeuge (Sketch, Pen, Curvature, Trim/Extend, Fillet/Chamfer, Path-Edit, Cut, Shape Builder, Pattern,
  Transform, Dimension/Measure, Constraint, Live Fill) melden sich dort an, `stopAll(except)` schaltet die anderen ab.
  **Freehand** lief daneben (eigener Zeigerpfad in `CanvasView`) und wurde je Aktion von Hand abgeschaltet.
- Alle Werkzeug-Aktionen liefern `checked` – außer `add.freehand` (geprüft per Playwright-Durchlauf über den
  Katalog). Die Command Sidebar las `checked` nicht.

## Entscheidungen

- **E1 Kein neuer ToolStore:** `CanvasTools` ist der Werkzeugzustand je Fenster. Neu: `registerMode()` für Werkzeuge
  ohne Zeigerbehandlung dort (Freehand meldet sich im Konstruktor von `FreehandStore` an), `anyActive()` = ein
  Werkzeug oder Modus ist an. `stopAll` beendet auch Modi. Bestehende Stores bleiben unverändert.
- **E2 Auswahlwerkzeuge = Auswahlmodi:** `tool.select` (V) = `stopAll()` + Selection Mode „Boxed“; `tool.direct`
  (A) = `stopAll()` + „Point“. `checked` = kein Werkzeug an und Modus passt. Eine Quelle:
  `CanvasOptions.selectionMode` – View › Selection Mode zeigt denselben Zustand, die Einstellung bleibt persistent.
  Standard bleibt „Point“ (design 007 E4), also ist beim Start die Direktauswahl aktiv. Modus „None“ hakt keines an.
- **E3 Esc:** unverändert zweistufig (`canvas.escape`: Teilgeste, dann Werkzeug). Danach ist kein Werkzeug an – damit
  ist automatisch wieder das Auswahlwerkzeug des aktuellen Modus aktiv (kein Moduswechsel durch Esc).
- **E4 Aktiv-Status in der Sidebar:** Blätter tragen `checked` aus dem `ActionService`. Liste und Flyout:
  `aria-checked` (bei Optionen zulässig, `aria-pressed` nicht); eingeklappte Leiste: `aria-pressed` auf
  Schaltflächen. Stil: Akzentfarbe (`--color-accent` / `--color-accent-text`, Kontraste aus 015). Gruppen: Icon der
  aktiven Variante, sonst der zuletzt aktiven (Signal je Gruppe, gefüllt von einem Effekt), sonst der ersten;
  `aria-label` „Path, submenu, active: Pen“, Tooltip „Path – Pen“.
- **E5 Ort in der Sidebar:** neue Sektion `select` am Anfang von `ADD_LAYOUT`; das Add-Menü nutzt
  `ADD_MENU_LAYOUT` (ohne diese Sektion).
- **E6 Statuszeile:** Name des aktiven Werkzeugs (`activeToolId` über `TOOL_ACTION_IDS` = Layout + Transform-Werkzeuge,
  das erste angehakte). Ohne Werkzeug steht dort der Name des Auswahlwerkzeugs.
- **E7 Kürzel:** `v`, `a` global ohne Modifier; der KeyboardDispatcher ignoriert Einzeltasten in Textfeldern
  (wie `k`, `f`). Keine Konflikte in den drei Keymaps.

## Verträge

- `CanvasTools.registerMode(mode: ToolMode, destroyRef?)`, `CanvasTools.anyActive(): boolean`;
  `ToolMode { id; active(); stop() }`.
- `selectionToolActions(view, tools)` → Handler für `tool.select`, `tool.direct` (in `CanvasView` registriert).
- `ADD_MENU_LAYOUT`, `TOOL_ACTION_IDS`, `activeToolId(checked)` in `commands/add-layout.ts`.
- Aktionen (Gruppe Edit): `tool.select` „Selection Tool“ / „Auswahlwerkzeug“, `tool.direct` „Direct Selection
  Tool“ / „Direktauswahl-Werkzeug“. Über MCP wie jede Aktion erreichbar (`run_action`); der Tool-Schnappschuss
  listet keine Aktions-Ids, bleibt also unverändert.

## Tests

- Vitest: `selection-tools.spec.ts` (V beendet Werkzeug und Freehand-Modus, Modi, `stopAll(except)`),
  `add-layout.spec.ts` (Sektion, Add-Menü ohne Auswahl, `activeToolId`), `command-sidebar.spec.ts`
  (`aria-checked`, Gruppe mit aktiver und zuletzt benutzter Variante, `aria-pressed` eingeklappt),
  `menu-model.spec.ts` angepasst.
- Playwright `e2e/selection-tools.spec.ts`: Pen → `V` → Klick wählt aus, `A` = Punktmodus, Statuszeile; jedes
  Werkzeug (15 ohne Auswahl, Transform/Shape Builder mit Auswahl) ist an „checked“, steht in der Statuszeile und
  endet mit V; Sidebar offen und eingeklappt (Gruppe zeigt Pen, behält das Icon, Freehand gedrückt).

## Offen / später

- Gesamte Neuordnung der Werkzeugleiste (Rotate/Scale/Reflect in der Sidebar, Konstruktion einklappbar): 068.
- Clip-Bearbeitung ist ein Auswahl-Kontext, kein Werkzeug – V beendet sie nicht (Esc wie bisher); in 067 mit der
  Kontextleiste vereinheitlichen.
