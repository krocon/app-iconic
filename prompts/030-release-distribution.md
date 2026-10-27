# Prompt 030: Release und Distribution

> Lies zuerst [000-arbeitsweise.md](000-arbeitsweise.md). Braucht: 012 · Meilenstein 9 aus `000-init.md` ·
> Vorbild: editlicious 012 + 014 (Skripte und Workflows übernehmen, mit Herkunftsvermerk)

## Ziel

AppIconic lässt sich als fertige App für macOS, Windows und Linux bauen und veröffentlichen – mit einer Version aus
einer Quelle, Lizenzhinweisen, Dateizuordnung für `.icon` und vorbereiteter Signierung/Notarisierung.

## Umfang

- Skripte aus editlicious: `scripts/version.mjs` (`version:check`/`version:set`, Quelle `package.json`),
  `release-notes.mjs`, `notices.mjs` (`THIRD-PARTY-NOTICES.txt`, im Paket, `notices:check` in `pnpm check`),
  `licenses.mjs` (`docs/licenses.md`), jeweils mit `node --test`-Tests.
- `.github/workflows/release.yml`: Tag `vX.Y.Z` → Entwurf; Modus `dry-run` per `workflow_dispatch` (kein Release);
  macOS universal (`--target universal-apple-darwin`, dmg/app), Windows (msi/nsis), Linux (deb/rpm/AppImage);
  Prüfsummen, Paketprüfung, Release-Notes automatisch.
- **Signierung/Notarisierung** vorbereitet: Secrets als Platzhalter (`APPLE_CERTIFICATE`, `APPLE_SIGNING_IDENTITY`,
  `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, Windows-Zertifikat), Entitlements (Hardened Runtime, nur
  benutzerausgewählte Dateien), `docs/release.md` mit Ablauf. Ohne Secrets baut der Workflow unsigniert.
- **Dateizuordnung**: `.icon` als Dokumenttyp (macOS: Package/Bundle-Typ `com.apple.iconcomposer.icon` o. ä. –
  UTI im Design belegen, AppIconic als „Editor“, nicht „Owner“), Windows/Linux für ZIP-`.icon`; Öffnen per
  Doppelklick/„Öffnen mit“ inkl. zweitem Start (`tauri-plugin-single-instance`) → Dokument in neuem Fenster.
- **Share** (macOS, optional): exportierte Datei über das Share-Sheet teilen (nur wenn ohne großen Aufwand möglich;
  sonst „Im Finder zeigen“).
- About-Dialog: Version, Lizenzen (inkl. Icon-Set aus 013), Link zum Repo.

## Tests

- `scripts/*.test.mjs`, `pnpm check` inkl. `version:check` und `notices:check`; Workflow `dry-run` einmal grün
  (Link im Bericht).

## Akzeptanz

- Dry-Run des Release-Workflows erzeugt Pakete für alle drei OS; `.icon` öffnet per Doppelklick (Test durch Marc
  auf dem Mac, im Bericht anfragen). `docs/FEATURES.md` §1 „Dateizuordnung“ und §11 „Share“ abgehakt.
