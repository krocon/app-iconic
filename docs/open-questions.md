# Offene Fragen an Marc (Nacht 26./27.10.2026, Prompts 002–015 und 018)

> Gesammelt aus den Design-Dokumenten in `prompts/done/` (dort jeweils mit Begründung unter „Fragen an Marc“).
> Die Umsetzung hat jeweils die empfohlene Variante gewählt. Punkte mit **Mac** kann nur ein Test auf dem Mac klären.
> Erledigtes bitte streichen oder beantworten – der nächste Prompt nimmt die Antworten auf.

## Prompt 002 (2cf3992)

1. Neue Dokumente circles [watchOS], squares shared statt iOS/macOS?
2. Schlüsselreihenfolge bei geänderten Dokumenten wie gelesen – oder alphabetisch wie Icon Composer?
3. Leere Arrays [] und / unescaped (kein Beleg).
4. macOS echter atomarer Tausch renamex_np(RENAME_SWAP)?
5. **Mac**: Auf dem Mac prüfen: Öffnen-Dialog zeigt .icon-Bundles als Datei.

## Prompt 003 (2fe7241)

1. Öffnen ersetzt nur ein unberührtes neues Dokument, sonst neues Fenster – gewollt?
2. Speichern unter: Format per Dialog – oder zwei Menüpunkte?
3. Gruppenreihenfolge: oberste Gruppe zuerst in icon.json?
4. **Mac** prüfen: Punkt im roten Schließknopf, App bleibt ohne Fenster offen, Dock-Klick öffnet Fenster (macOS-Code im Container nicht kompiliert, CI macos prüft).
5. Schatten/Transluzenz für importierte Gruppen ok?

## Prompt 004 (9308df7)

1. Erste Gruppe in Icon Composer oben?
2. Layer-position: y nach unten, Skalierung um die Mitte?
3. Farben für automatic/system-* passend?
4. Squircle-Radius 22,37 % passend?
5. Sanftes Pinch + gestufte Knöpfe ok?
6. **Mac** prüfen: Trackpad-Pinch/Zwei-Finger-Pan, Maske + Verlaufs-IDs in WKWebView, Retina-Schärfe der Lineale.

## Prompt 005 (51ae49d)

1. **Mac**: natives Menü, Kürzel, „Undo <Aktion>“, Fensterwechsel, Open… ohne Fenster.
2. ⌘C/⌘V in Textfeldern?
3. Quit mit zwei geänderten Dokumenten fragt zweimal? Quit über das Dock umgeht die Frage?
4. Kürzel ok: ⇧⌘↑/⇧⌘↓ Bring to Front/Send to Back, ⌘/ Kürzelliste, Esc Deselect?
5. HTML-Menüleiste unter Windows/Linux immer sichtbar ok?
   (Linux-Debug: Ctrl+Shift+I öffnet den Inspector statt Import SVG.)

## Prompt 006 (066830f)

1. ~~SVG-Nodes umgekehrt sortieren (vorderste oben)?~~ Entschieden mit Prompt 063 (30.10.2026): ja, oben = vorn.
2. Schreibt Icon Composer `hidden` für Gruppen/Layer?
3. Ungenutzte Assets beim Löschen von Layern/Gruppen mit entfernen ok?
4. Ungroup nur bei schlichten <g> – Attribute auf Kinder verteilen?
5. **Mac**: ⌘C/⌘X/⌘V im Baum über natives Menü, Einfügen zwischen Fenstern.
6. Kürzel Move Up/Down/Into/Out (Alt+Pfeile, Mac ⌘⌥+Pfeile), Show/Hide ⇧⌘H ok?
7. Layer-Duplikat mit eigener Asset-Kopie ok?

## Prompt 007 (6a6f0f8)

1. Klick wählt oberstes Element im Layer (Gruppe) statt Blatt – ok?
2. Verschieben über transform statt Geometrie-Attribute ok?
3. Box-Skalierung per angehängter matrix ok?
4. Pivot darf beim Ziehen springen?
5. Bedeutung Selection Mode none richtig?
6. **Mac**: Trackpad-Ziehen, ⌥-Klick.

## Prompt 008 (b879849)

1. Aktueller Layer ohne Auswahl = erster Layer der obersten Gruppe – oder zuletzt benutzten merken?
2. Text mit text-anchor=middle um die Mitte ok?
3. Neue Icon-Gruppe mit Schatten/Transluzenz-Defaults ok?
4. Explizite KI-Koordinaten im Benutzerraum des Elternelements – lieber Dokumentraum?
5. Bilder nur verkleinern (max. 512), nicht vergrößern ok?
6. **Mac**: nativer Bild-Dialog, ⌘I im Menü, <image> mit Data-URL in Icon Composer.

## Prompt 009 (b5b2d1e; Fix Windows-Ordnerprüfung 90f74a5)

1. Hex mit Alpha als #RRGGBBAA (CSS) statt #AARRGGBB – ok?
2. Reset = Wert entfernen statt Default schreiben – ok?
3. (in 010 behoben: style-Bereinigung jetzt textuell, verlustfrei)
4. Hinweis „top applies first“ so lassen?
5. **Mac**: nativer Farbwähler, Ziehen am Label per Trackpad.

## Prompt 010 (274d1bb) – Belege: github.com/dfabulich/unofficial-apple-icon-composer-json-schema

1. Bearbeitete Datei in Icon Composer öffnen und prüfen.
2. Legt Bearbeiten in Dark wirklich eine Variante an (X-specializations)?
3. Kennt Icon Composer radial-gradient? (nicht belegt, nur lesbar)
4. Angenommene Defaults für fehlende Felder korrekt?
5. squares als Liste – welche Form?
6. Farben im Farbraum der Datei als Hex zeigen oder umrechnen?

## Prompt 011 (d6129a7)

1. Quelltext roh mit Format-Knopf statt vorformatiert ok?
2. Optimierer-Abweichungen ok (runden statt abschneiden, Linienzüge auch in Kurvenpfaden, Vorlagen-Bug „L nach Kurve entfernt“ behoben, CGPathSimplify nicht portiert)?
3. „Copy XML“ formatiert, „Copy“ roh ok?

## Prompt 012 (a28660d; WebKit-Fix f03fe11)

1. Ordner als Ziel für SVG- und PNG-Export ok?
2. Maske beim Export standardmäßig „keine“ (App Store) oder Squircle?
3. Effekte als ein Schalter, standardmäßig aus, ok?
4. **Mac**: „Effects Preview“ zeigt jetzt die Ebenen in WKWebView? Ordner-Dialog, Systemschriften im PNG.

## Prompt 013 (18aefec)

1. Lucide als erstes Symbol-Set – oder lieber Tabler?
2. Fehler bei fehlenden Glyphen statt Ersatzschrift ok?
3. Text bis 256 Zeichen (Vorlage 12) ok?
4. Freehand: Abtastung 3 px UND 1/120 s, Werkzeug bleibt nach einem Strich aktiv – ok?
5. **Mac**: Schriftenliste mit macOS-Schriften/.ttc, SF Pro, Apple Color Emoji, Zeichnen mit Trackpad.
   (Abweichung: harfrust + skrifa statt ttf-parser – von resvg schon genutzt, echtes Kerning.)

## Prompt 014 (65dc468)

1. Opt-out über Teilen der Clip-Gruppe statt clip-path="none" (hebt Vorfahren-Clip nicht auf) – einverstanden?
2. Layer-Clip ohne Marker, an der Struktur erkannt (wie Figma-Export) – gewünscht?
3. Duplicate kopiert den Clip statt ihn zu teilen – so lassen?
4. **Mac**: Bearbeitungsmodus in WKWebView.
5. Layer-Clip nur für die Auswahl statt aller Kinder?

## Prompt 015 (b4c08e6)

1. Start-Zoom „Fit (max. 100 %)“ als Default richtig?
2. Cross Cursor standardmäßig an (wie Vorlage) richtig?
3. Export-Ordner dauerhaft merken oder nur je Sitzung?
4. **Mac**: natives Menü wechselt Sprache, Titelleiste folgt Theme, ⌘, im App-Menü.
5. Felder einer neueren App-Version in settings.json gehen beim Speichern verloren – akzeptabel?

## Prompt 018 (a49601c)

1. „Vor Dateizugriff fragen“ standardmäßig an lassen?
2. Fensterlabel (main, doc-2) als Dokument-Id ok?
3. **Mac**: `claude mcp add` einmal prüfen (Signierung des Sidecars kommt mit 030); Einrichtungszeilen in docs/mcp.md gegen aktuelle Claude-Code-Doku prüfen.
4. System-Zwischenablage für die KI gesperrt lassen?

## Prompt 030

1. **Mac**: `mdls -name kMDItemContentType <datei>.icon` – welcher UTI steht dort? (Dann `LSItemContentTypes`
   statt nur der Endung.)
2. **Mac**: Nach Installation des dmg: „Öffnen mit › AppIconic“ für ein `.icon`, Icon Composer bleibt Standard?
3. Signier-Secrets anlegen, wenn signiert werden soll (Liste in `docs/release.md`).

## Prompt 031

1. ~~Leistung auf dem Mac messen~~ – erledigt (Marc, 27.10.2026: ohne `opacity` 84 ms, mit 341 ms je Zieh-Schritt;
   `docs/architecture.md` „Performance“). Offen: dasselbe in der echten App (WKWebView) – großes SVG aus
   `node scripts/big-svg.mjs > big.svg` importieren und mit Snap ziehen; fühlt es sich wie in Chromium an?
2. Beim ersten Bearbeiten eines Assets normalisiert die DOM-Serialisierung Leerraum in Tags und leere Elemente
   (danach ändert jede Bearbeitung nur ihre Stelle) – akzeptabel, oder ein formerhaltender Serializer?
3. Verlaufseditor (Prompt 032) und Review-Folgen (Prompt 033) – Reihenfolge/Umfang so recht?


## Prompt 071

1. **Mac/Windows**: eine `.svg`, ein `.png` und ein `.icon` aus Finder/Explorer ins Fenster ziehen – erscheint der
   Hinweis am Zeiger an der richtigen Stelle (Retina/HiDPI) und landet das Element dort? (Im Container nur mit
   Fake-Ereignis geprüft.)
2. **Mac**: Screenshot mit `⌘⇧4` + `Ctrl` in die Zwischenablage, dann `⌘V` im Fenster – kommt ein `<image>`? Und ein
   in Vorschau/Safari kopiertes Bild?

## Prompt 074

1. Eine eigene Palette reicht vorerst? Mehrere benannte Paletten bräuchten Objekte in Listen in `settings.json`
   (das nachsichtige Lesen kennt nur Listen von Texten/Zahlen) – lieber eine Datei `palettes.json` daneben?
2. **Mac**: Pipette auf einem PNG-Layer und auf einem Verlauf – stimmt die Farbe mit dem Bildschirm überein
   (resvg rendert sRGB; Display-P3-Farben aus `icon.json` erscheinen umgerechnet)?

## Prompt 075

1. **Mac**: Text per Doppelklick bearbeiten mit japanischer IME (Kandidatenfenster) – sitzt das Feld richtig?
2. Verschachtelte `tspan`s (ein farbiges Wort) gehen beim Bearbeiten in der Zeile auf – reicht das, oder soll das
   Bearbeiten dann gesperrt sein (nur „SVG bearbeiten …“)?

## Prompt 076

1. Masken bearbeiten: reicht „lösen – ändern – wieder maskieren“ (plus Auswahl im Baum unter „Definitionen“), oder
   soll es einen Bearbeitungsmodus wie bei Clip Paths geben?
2. `mix-blend-mode` an einzelnen SVG-Elementen (nur als CSS-Stil möglich, Icon Composer ignoriert es) – gewünscht?
