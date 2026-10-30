# Prompt 083: Automatische Sicherung und Wiederherstellung nach Absturz

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 002, 003, 015 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §1.10 (P3)

## Ziel

Kein Datenverlust bei Absturz oder Stromausfall – ohne das Original ungefragt zu überschreiben.

## Ausgangslage

Ungespeicherte Änderungen leben nur im `DocumentStore` der WebView.

## Umfang

- **Wiederherstellungs-Schnappschuss:** solange ein Dokument geändert ist, alle N Sekunden nach der letzten Änderung
  (Einstellung, Standard z. B. 30 s; 0 = aus) ein vollständiger Schnappschuss (`icon.json` + Assets, wie Speichern)
  nach `<App-Konfig>/recovery/<id>/` mit Meta (Originalpfad, Zeit, Fenster). Atomar (CLAUDE.md §4, „Speichern ist
  heilig“), Größe begrenzt.
- **Aufräumen:** nach Speichern, nach „nicht speichern“ beim Schließen, beim regulären Beenden.
- **Beim Start:** vorhandene Schnappschüsse anbieten („Wiederherstellen“ öffnet als geändertes Dokument mit
  Originalpfad, „Verwerfen“, „Später“); funktioniert auch für nie gespeicherte Dokumente.
- **Rust-Commands** (`write_recovery`, `list_recovery`, `open_recovery`, `discard_recovery`), async +
  `spawn_blocking`, Logik in `ai-core`; Fassade, Fake, DTOs, Fehlercodes beidseitig. Der Pfadschutz aus 033
  gilt (Recovery-Verzeichnis ist intern).
- Mehrere Fenster/Instanzen: keine gegenseitigen Überschreibungen (eigene Ids, Sperrdatei oder Prozess-Id).

## Akzeptanz

- Rust: Schnappschuss schreiben/lesen/aufräumen mit `tempfile`, abgebrochener Schreibvorgang hinterlässt nichts
  Halbes, Roundtrip mit Fixtures.
- Vitest: Zeitsteuerung (Fake-Timer), Aufräumregeln, Startdialog.
- Ende-zu-Ende im Container: App ändern, Prozess hart beenden (`kill -9`), neu starten → Angebot, Wiederherstellen
  zeigt die Änderung.
