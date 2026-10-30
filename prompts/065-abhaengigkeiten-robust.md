# Prompt 065: Abhängigkeiten ohne stille Brüche

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 059, 060 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §2.3 (P0, Aufwand M)

## Ziel

Constraints aus 059 sind im Alltag verlässlich: man sieht, wenn sie verletzt sind, kann jedes Maß löschen, die
Symbole sitzen an der richtigen Stelle, und Werkzeuge hinterlassen keine Reste.

## Ausgangslage

- Geprüft: `ConstraintService.holds()` und `CONSTRAINT_TEXTS.notHolding` existieren, werden aber nirgends benutzt.
  Freies Verschieben/Skalieren löst nicht nach (bewusste Entscheidung in 059).
- Laut Analyse: Klick auf ein treibendes Maß öffnet sofort das Zahlenfeld; `Delete`/`Backspace` (`badgeKey()`)
  hängt nur an Beziehungs-Symbolen. `ConstraintOverlay` rechnet rohe Attribute mit `toView()` um – ohne
  `assetPlacement`, Eltern-`transform`, Layer-`position` – und zeigt Symbole auch für ausgeblendete Layer.
  `ReplaceNode` (Corners, Trim, Fillet, Offset) lässt verwaiste Einträge in `<metadata>`; `Duplicate` kopiert `data-cid`.

## Umfang

- **Verletzt sichtbar machen:** nach jedem Undo-Schritt `holds()` je betroffenem Asset; verletzte Beziehungen/Maße
  rot im Overlay, Hinweis in der Statuszeile bzw. Kontextleiste (067) mit Schaltfläche „Jetzt lösen“
  (`constraint.solve`).
- **Optional live nachlösen:** Einstellung `constraints.autoSolve` (Standard aus; Rust `settings.rs` + TS
  `settings-rules` + `testdata/settings-cases.json`). An: Solver als Follower im selben Undo-Schritt. Der
  UndoService hat heute **einen** Follower (Live Fill, 060) – auf eine geordnete Liste umstellen
  (Constraints vor Live Fill), mit Test.
- **Maße löschbar:** Maß-Badges fokussierbar; Klick wählt, Doppelklick/`Enter` bearbeitet, `Delete`/`Backspace`
  entfernt (ein Undo-Schritt); dasselbe im Kontextmenü (070, falls schon da).
- **Overlay über die CTM:** Punkte über `nodeToDocument`/Screen-CTM wie die Auswahl-Handles (007); nichts zeichnen
  für ausgeblendete Elemente, Layer oder Gruppen.
- **Abhängigkeiten im Properties-Panel:** Abschnitt „Abhängigkeiten“ für die Auswahl – Liste (Typ, Partner, Wert),
  je Eintrag Löschen und Partner auswählen.
- **Keine Waisen:** Commands, die ein Element ersetzen oder löschen, entfernen im selben Command die Beziehungen,
  die nicht mehr gelten (Pfade tragen keine Constraints – Hinweis an den Nutzer). `Duplicate`/Paste vergeben neue
  `data-cid`; Beziehungen innerhalb der kopierten Menge werden mitkopiert, nach außen fallen weg. Das ändert die
  Entscheidung aus 059 („Kopien tragen dieselbe `data-cid`“) – im Design begründen.

## Akzeptanz

- Vitest: Follower-Reihenfolge, Waisen-Bereinigung bei ReplaceNode/Delete, Duplicate mit neuen cids, autoSolve-Regeln
  in beiden Sprachen gegen `settings-cases.json`.
- Playwright: Rechteck mit Maß frei skalieren → rot + „Jetzt lösen“ stellt her; Maß löschen per Tastatur; Overlay
  in transformierter Gruppe bei Zoom 150 % deckungsgleich; ausgeblendeter Layer → keine Symbole.
