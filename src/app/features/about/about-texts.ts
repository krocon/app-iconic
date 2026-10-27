import { translatable } from '../../core/i18n/i18n';

/** Texts of the About dialog (English = source, German beside it; design 015 E13). */
const EN = {
  title: 'About AppIconic',
  tagline: 'Editor for Apple .icon app icons with SVG layers.',
  version: (v: string, os: string, arch: string) => `Version ${v} · ${os} / ${arch}`,
  noBackend: 'Version: desktop backend not available',
  copyright: '© 2026 Marc Kronberg · MIT License',
  symbols: 'Symbols:',
  notices: 'Third-party notices: THIRD-PARTY-NOTICES.txt',
  close: 'Close',
} as const;

export const ABOUT_TEXTS = translatable('about', EN, {
  de: {
    title: 'Über AppIconic',
    tagline: 'Editor für App-Icons im Apple-Format .icon mit SVG-Ebenen.',
    version: (v: string, os: string, arch: string) => `Version ${v} · ${os} / ${arch}`,
    noBackend: 'Version: Desktop-Backend nicht verfügbar',
    copyright: '© 2026 Marc Kronberg · MIT-Lizenz',
    symbols: 'Symbole:',
    notices: 'Hinweise zu Fremdwerken: THIRD-PARTY-NOTICES.txt',
    close: 'Schließen',
  },
});
