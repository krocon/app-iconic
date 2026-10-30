# Prompt 086: KI-Anbindung mit einem Klick und KI-Verlauf

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 018 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §3.6 (P3) · Doku: `docs/mcp.md`

## Ziel

Die MCP-Steuerung ohne Handarbeit in Claude Desktop oder Cursor eintragen und sehen, was die KI zuletzt getan hat.

## Umfang

- **Einrichten** im Tab Settings › AI control: Ziel wählen (Claude Desktop, Cursor; Pfade je OS aus der jeweiligen
  Doku belegen), Vorschau der Änderung (Diff), dann Eintrag `app-iconic` mit dem Sidecar-Pfad schreiben – JSON
  zusammenführen (andere Server und unbekannte Felder bleiben), Sicherungskopie, atomar, nur nach Bestätigung.
  Rust-Command (`mcp_install { target }`), Pfad nur aus der festen Liste (Pfadschutz 033). Entfernen ebenso.
- **Verbindung testen:** Sidecar starten und Handshake prüfen; Ergebnis verständlich anzeigen.
- **KI-Verlauf:** Popover am „AI“-Badge mit den letzten N KI-Aufrufen (Zeit, Werkzeug, Kurzbeschreibung, Ergebnis,
  Fehler) aus dem `McpStore`; Eintrag mit Undo-Gruppe → „Rückgängig“ springt dorthin, wenn es der letzte Schritt ist.
  Nur im Speicher.

## Akzeptanz

- Rust: Zusammenführen in vorhandene Konfig (mit fremden Servern, Kommentaren nicht erlaubt → Fehler statt
  Zerstören), Sicherungskopie, Entfernen.
- Vitest: Verlaufsmodell, Popover.
- Ende-zu-Ende: `scripts/mcp-e2e.mjs` gegen die App, danach Verlauf zeigt die Aufrufe.
