# Design 065: Abhängigkeiten ohne stille Brüche

> Prompt: [065-abhaengigkeiten-robust.md](065-abhaengigkeiten-robust.md) · Stand: 30.10.2026

## Befunde

- `holds()` war ungenutzt (bestätigt). Ein Klick auf ein Maß öffnete sofort das Eingabefeld; Entf hing zwar auch am
  Maß, war aber nur per Tab erreichbar (bestätigt).
- **Nicht bestätigt:** Die Lage der Symbole – `sketchElements` rechnet über `nodeToDocument` (CTM), auch in
  transformierten Gruppen bei 150 % (neuer Playwright-Test). Bestätigt: Symbole auch für ausgeblendete Elemente/Layer.
- Waisen nach `ReplaceNode`/Löschen und doppelte `data-cid` nach Duplizieren (bestätigt).

## Entscheidungen

- **E1 Mehrere Follower:** `UndoService.setFollower(fn, key = 'default', order = 0)`; alle laufen nach jeder Änderung
  in `order`-Reihenfolge, jeder sieht, was der vorige tat; ein Schritt mit der Ursache. Reihenfolge:
  Constraint-Aufräumen 5, Nachlösen 10, Live Fill 20.
- **E2 Aufräumen (immer):** `constraintHousekeeping(doc)` (rein, nur Attribute): Beziehungen, deren Element fehlt oder
  kein Linien-/Rechteck-/Kreis-/Polygon-Element mehr ist, fallen weg (Hinweis „n Abhängigkeiten wurden entfernt“).
  Wiederholte `data-cid`: das erste Element im DOM behält sie, Kopien bekommen frische; Beziehungen, deren Elemente
  alle in derselben Kopie-Menge liegen (k-te Kopie je Element), werden mitkopiert – außer `fix`. Ändert 059.
- **E3 Nachlösen (optional):** Einstellung `constraints.autoSolve` (Rust `ConstraintSettings`, TS-Modell und -Regeln,
  `settings-cases.json`, Dialog „Canvas“), Standard aus. An: Assets, deren Beziehungen nicht gelten, werden im selben
  Schritt gelöst (`ConstraintService.solveCommands`); ein Widerspruch lässt die Änderung stehen (rot).
- **E4 Sichtbar:** `ConstraintService.broken(asset)` (Residuen je Beziehung); Symbole/Maße mit `.broken` (Token
  `--color-error`); Hinweis unten auf dem Canvas „n Abhängigkeiten gelten nicht“ + „Jetzt lösen“ (`constraint.solve`).
  Die einheitliche Kontextleiste (067) kann ihn später aufnehmen.
- **E5 Maße:** Klick wählt und fokussiert (WebKit fokussiert Buttons nicht von selbst), Doppelklick oder Enter
  bearbeitet, Entf/Rücktaste entfernt (ein Undo-Schritt).
- **E6 Nur Gemaltes:** Overlay nur für Assets in `paintedRoots` und Beziehungen, deren Elemente `isRendered` sind.
- **E7 Properties:** Abschnitt „Abhängigkeiten“ (nur wenn die Auswahl welche hat): Symbol, Typ, Wert, „gilt nicht“,
  Partner (Klick wählt ihn), Entfernen. Pausieren (aus dem Prompt) bewusst nicht: ein Zustand mehr im Format ohne
  klaren Nutzen – Entfernen + Undo reicht.

## Tests

- Vitest: `undo.service.spec` (Follower in Reihenfolge), `constraint-follower.spec` (geordnet, Löschen = ein Schritt +
  Hinweis, ersetzt durch Pfad, Duplikat mit frischen cids und kopierten Beziehungen, Nachlösen, `broken`).
- Playwright `constraints.spec`: rot + „Jetzt lösen“ + Einstellung; Maß wählen und mit Entf entfernen, Undo; Symbole
  bei 150 % in transformierter Gruppe, ausgeblendetes Element und Layer; Abschnitt im Panel; Löschen eines Elements
  nimmt die Metadaten mit (Undo bringt sie zurück). Bestehender Test: Doppelklick statt Klick zum Bearbeiten.
