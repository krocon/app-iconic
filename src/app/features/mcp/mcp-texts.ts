import { translatable } from '../../core/i18n/i18n';

/** Texts of AI control in the window (design 018 E13/E16). English is the source. */
export const MCP_TEXTS = translatable(
  'mcp',
  {
    /** Header badge while an AI is connected. */
    badge: 'AI',
    badgeTitle: (n: number) =>
      n === 1 ? 'An AI assistant is connected (MCP)' : `${n} AI assistants are connected (MCP)`,
    askTitle: 'Allow the AI?',
    askOpen: (path: string) => `The AI wants to open\n${path}`,
    askSave: (path: string) => `The AI wants to save this document to\n${path}`,
    askExport: (kind: string, dir: string) => `The AI wants to export ${kind} into\n${dir}`,
    allow: 'Allow',
    deny: 'Deny',
    // the AI history at the badge (prompt 086)
    historyTitle: 'AI History',
    historyEmpty: 'No AI calls in this window yet.',
    historyHint: 'The last calls of this window – kept only while it is open.',
    historyOk: 'done',
    historyUndo: 'Undo',
    historyUndoLabel: (tool: string) => `Undo the AI call ${tool}`,
    historyClear: 'Clear',
    historyMs: (ms: number) => `${ms} ms`,
    // setting up AI apps (prompt 086)
    setupTitle: 'Connect an AI app',
    targets: { claudeDesktop: 'Claude Desktop', cursor: 'Cursor' },
    target: 'App',
    state: {
      absent: 'Not set up – the configuration file does not exist yet.',
      missing: 'Not set up.',
      installed: 'Set up for this AppIconic.',
      other: 'Set up for another copy of AppIconic (different program path).',
      invalid: 'The configuration file is not plain JSON – AppIconic does not change it.',
    },
    file: 'Configuration file',
    install: 'Set Up…',
    update: 'Update…',
    remove: 'Remove…',
    previewInstall: 'This change will be written:',
    previewRemove: 'This entry will be removed:',
    nothing: 'Nothing to change – the file is already like this.',
    backupHint: 'A backup copy of the old file is kept next to it.',
    apply: 'Apply',
    cancel: 'Cancel',
    installed: (app: string) => `Done. Quit and restart ${app} to load AppIconic.`,
    removed: (app: string) => `Removed. ${app} no longer starts AppIconic after a restart.`,
    backup: (path: string) => `Backup: ${path}`,
    noSidecar:
      'The helper program app-iconic-mcp is missing next to the app – reinstall AppIconic.',
    noSidecarDev:
      'The helper program app-iconic-mcp is missing next to the debug app – build it with “pnpm mcp:sidecar:dev”.',
    testTitle: 'Connection test',
    test: 'Test Connection',
    testing: 'Testing…',
    probeOk: (server: string, version: string, tools: number, docs: number) =>
      `Connection works: ${server} ${version}, ${tools} tools, ${docs === 1 ? '1 document' : `${docs} documents`}.`,
    probeOff:
      'The helper program works, but AppIconic does not answer – turn on “Allow AI control (MCP)”.',
    probeStart: 'The helper program could not be started.',
    probeTimeout: 'The helper program did not answer in time.',
    probeBad: 'The helper program did not answer like an MCP server.',
    probeFailed: (code: string) => `The connection test failed (${code}).`,
  },
  {
    de: {
      badge: 'KI',
      badgeTitle: (n: number) =>
        n === 1
          ? 'Ein KI-Assistent ist verbunden (MCP)'
          : `${n} KI-Assistenten sind verbunden (MCP)`,
      askTitle: 'KI erlauben?',
      askOpen: (path: string) => `Die KI möchte diese Datei öffnen:\n${path}`,
      askSave: (path: string) => `Die KI möchte dieses Dokument speichern unter\n${path}`,
      askExport: (kind: string, dir: string) => `Die KI möchte ${kind} exportieren nach\n${dir}`,
      allow: 'Erlauben',
      deny: 'Ablehnen',
      historyTitle: 'KI-Verlauf',
      historyEmpty: 'In diesem Fenster gab es noch keine KI-Aufrufe.',
      historyHint: 'Die letzten Aufrufe dieses Fensters – nur solange es offen ist.',
      historyOk: 'erledigt',
      historyUndo: 'Widerrufen',
      historyUndoLabel: (tool: string) => `KI-Aufruf ${tool} widerrufen`,
      historyClear: 'Leeren',
      historyMs: (ms: number) => `${ms} ms`,
      setupTitle: 'KI-App verbinden',
      targets: { claudeDesktop: 'Claude Desktop', cursor: 'Cursor' },
      target: 'App',
      state: {
        absent: 'Nicht eingerichtet – die Konfigurationsdatei gibt es noch nicht.',
        missing: 'Nicht eingerichtet.',
        installed: 'Für dieses AppIconic eingerichtet.',
        other: 'Für eine andere AppIconic-Kopie eingerichtet (anderer Programmpfad).',
        invalid: 'Die Konfigurationsdatei ist kein reines JSON – AppIconic ändert sie nicht.',
      },
      file: 'Konfigurationsdatei',
      install: 'Einrichten…',
      update: 'Aktualisieren…',
      remove: 'Entfernen…',
      previewInstall: 'Diese Änderung wird geschrieben:',
      previewRemove: 'Dieser Eintrag wird entfernt:',
      nothing: 'Nichts zu ändern – die Datei ist schon so.',
      backupHint: 'Eine Sicherungskopie der alten Datei bleibt daneben liegen.',
      apply: 'Übernehmen',
      cancel: 'Abbrechen',
      installed: (app: string) =>
        `Erledigt. ${app} beenden und neu starten, um AppIconic zu laden.`,
      removed: (app: string) =>
        `Entfernt. ${app} startet AppIconic nach einem Neustart nicht mehr.`,
      backup: (path: string) => `Sicherung: ${path}`,
      noSidecar:
        'Das Hilfsprogramm app-iconic-mcp fehlt neben der App – bitte AppIconic neu installieren.',
      noSidecarDev:
        'Das Hilfsprogramm app-iconic-mcp fehlt neben der Debug-App – mit „pnpm mcp:sidecar:dev“ bauen.',
      testTitle: 'Verbindungstest',
      test: 'Verbindung testen',
      testing: 'Teste…',
      probeOk: (server: string, version: string, tools: number, docs: number) =>
        `Verbindung klappt: ${server} ${version}, ${tools} Werkzeuge, ${docs === 1 ? '1 Dokument' : `${docs} Dokumente`}.`,
      probeOff:
        'Das Hilfsprogramm läuft, aber AppIconic antwortet nicht – „KI-Steuerung (MCP) erlauben“ einschalten.',
      probeStart: 'Das Hilfsprogramm ließ sich nicht starten.',
      probeTimeout: 'Das Hilfsprogramm hat nicht rechtzeitig geantwortet.',
      probeBad: 'Das Hilfsprogramm hat nicht wie ein MCP-Server geantwortet.',
      probeFailed: (code: string) => `Der Verbindungstest ist fehlgeschlagen (${code}).`,
    },
  },
);
