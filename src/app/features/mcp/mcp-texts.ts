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
    },
  },
);
