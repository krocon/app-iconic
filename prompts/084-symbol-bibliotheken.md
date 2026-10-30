# Prompt 084: Weitere Symbol-Sets und eigene Bibliothek

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 013, 030 · Quelle:
> [Analyse 30.10.2026](2026.10.30%20-%20analyse.md) §1.11 (P3) · Folge-Idee aus `prompts/README.md`

## Ziel

Mehr freie Symbole im Picker und eigene, wiederverwendbare Formen.

## Ausgangslage

`symbols/symbol-provider.ts` ist eine Plugin-Schnittstelle; einziger Provider: Lucide (lazy aus `lucide-static`).

## Umfang

- **Weitere Sets:** Tabler Icons und Phosphor (beide MIT – Lizenz und Version prüfen); Daten lazy wie Lucide, nur
  Stroke- bzw. eine Gewichtung im Design entscheiden (Bundle-Größe messen und nennen). Lizenz in
  `THIRD-PARTY-NOTICES.txt` (`pnpm notices`, `pnpm licenses:report`) und im About-Dialog; Abhängigkeit in
  `docs/architecture.md` begründen. Keine SF Symbols (CLAUDE.md §7).
- **Eigene Bibliothek:** Auswahl „Als Symbol speichern…“ (Name, Schlagwörter) → SVG im App-Konfig-Verzeichnis
  `symbols/` über Rust (atomar, Grenzen, Bereinigung beim Laden wie beim Import); Provider „Meine Symbole“ mit
  Umbenennen/Löschen; Import/Export eines Ordners.
- Picker: Set-Auswahl, Suche über alle Sets, zuletzt benutzt.

## Akzeptanz

- Rust: Symbole speichern/listen/löschen, feindliches SVG wird bereinigt.
- Vitest: Provider-Registry, Suche über mehrere Sets, Lizenzprüfung (Test, dass jedes Set einen Eintrag in den
  Notices hat).
- Playwright: Tabler-Symbol einfügen; eigene Auswahl speichern und wieder einfügen.
