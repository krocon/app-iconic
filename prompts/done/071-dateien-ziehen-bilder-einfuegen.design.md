# Design 071: Dateien ins Fenster ziehen, Bilder aus der Zwischenablage

> Prompt: [071-dateien-ziehen-bilder-einfuegen.md](071-dateien-ziehen-bilder-einfuegen.md) · Stand: 30.10.2026

## Ausgangslage (bestätigt)

- `lib.rs` behandelte `WindowEvent::DragDrop` nicht; `dragDropEnabled` ist nicht gesetzt (Tauri-Standard an). Der Baum
  zieht mit Pointer-Ereignissen – die Windows-Eigenheit (bei `dragDropEnabled` kein HTML5-DnD in WebView2) trifft ihn
  nicht, daher bleibt die Einstellung an.
- `ClipboardApi` las nur Text. Prompt 033 (erlaubte Pfade) ist noch offen.

## Entscheidungen

- **E1 Rust reicht weiter:** `drop_files::on_drag_drop` sendet je Phase `file-drop { phase, files, x, y }` nur an das
  Fenster, in dem gezogen wird – Position in CSS-Pixeln (durch `scale_factor` geteilt), Pfade opak mit Art nach Endung
  (`user_paths::drop_kind`; die Lese-Commands prüfen den Inhalt ohnehin über Magic Bytes/UTF-8). Abgelegte Pfade
  kommen in `UserPaths` (begrenzt auf 1 024, älteste zuerst raus) – 033 prüft die Datei-Commands später dagegen.
- **E2 Typ-Weiche** (`files/file-drop.ts`, rein): `.icon` → wie „Öffnen“ (`openRecent`: unberührtes neues Dokument
  wird ersetzt, sonst neues Fenster, 003 E8); SVG → E3; PNG/JPEG/WebP → `<image>` wie „Add › Image“ (008 E8) am
  Ablagepunkt bzw. in der sichtbaren Mitte; Unbekanntes → ein Hinweis mit der Anzahl. Mehrere Dateien laufen
  nacheinander, jede ein Undo-Schritt; weitere Platzierungen 16 Einheiten versetzt. „Als PNG-Layer“ folgt mit 080.
- **E3 SVG:** über der Zeichenfläche wird der Inhalt wie ein „SVG Snippet“ (008 E9: bereinigt, IDs eindeutig) mit
  seiner Mitte auf den Ablagepunkt gesetzt – in den Einfügeort aus 008, in seinen eigenen Einheiten. Außerhalb der
  Fläche (Seitenleisten, Baum) oder ohne Dokument: „Import SVG“ als neue Gruppe/Ebene/Asset (003 E15), ohne Dialog.
  Die Layer-`position` wird **nicht** geschrieben (Richtung von `translation-in-points` ist offene Frage 004/2 –
  konservativ beim Format). Neue Argumente `centerX`/`centerY` (Dokument-Koordinaten) für `add.image` und
  `add.svgSnippet` – die KI kann genauso platzieren.
- **E4 Hinweis:** `DropHint` (fest über dem Fenster, ohne Zeiger-Ereignisse): gestrichelter Rahmen und am Zeiger
  „Hier einfügen“ (mit Fadenkreuz) / „Als neue Ebene hinzufügen“ / „Öffnen“ / „Nur .icon-, .svg- …“; per
  `aria-live` angesagt.
- **E5 Einfügen:** `⌘V` nimmt zuerst **SVG-Text** (eigene Kopien sind Text, auch zwischen Fenstern – der häufigste
  Fall, und Bildquellen liefern höchstens Dateinamen/HTML als Text), sonst ein **Bild**: aus dem `paste`-Ereignis
  (`clipboardData.files`, macOS-Menü) oder über `read_clipboard_image` (Rust, `arboard`: RGBA → Grenzen 16 384 px
  Seite, 64 MP, PNG ≤ 20 MiB → Data-URL). Im Browser-Modus `navigator.clipboard.read()`. Bild-Blobs prüft das
  Frontend über Magic Bytes wie `image_file`. Ruft die KI `edit.paste { text }`, gibt es nie ein Bild.
- **E6 Fehler:** keine neuen Codes – `too_large`, `invalid_image`, `unavailable` (Zwischenablage nicht erreichbar)
  reichen; die Statuszeile zeigt `describeFsError`.

## Tests

- Rust: `clipboard_image` (Fake-Quelle: PNG mit Größe und Alpha, keine Daten, Grenzen, kaputter Puffer), `user_paths`
  (erlaubt, begrenzt, Arten), `drop_files` (CSS-Pixel, Arten im JSON).
- Vitest: `file-drop.spec` (Weiche, Versatz, Hinweisart, Service: Bild am Punkt + je Datei ein Undo-Schritt, SVG als
  Ebene, Meldung, Phasen), `paste-image.spec` (Text zuerst, dann Bild; KI-Text ohne Bild; Ereignis-Blob mit Magic
  Bytes; Grenzen).
- Playwright `e2e/file-drop.spec.ts` (Fake-Ereignis): SVG am Ablagepunkt + Hinweis, Bild → `<image>`, SVG über dem
  Baum → neue Gruppe, Unbekanntes gemeldet; `⌘V` mit Bild in der Zwischenablage.
- Ende-zu-Ende (Xvfb): Bild mit `xclip` in die X-Zwischenablage, `Ctrl+V` in der Debug-App → `<image>`. Ziehen aus einem
  Dateimanager ist im Container nicht möglich → offene Frage (Mac/Windows).
