import { computed, inject, Injectable, signal } from '@angular/core';
import { RecentFilesApi } from '../../core/recent/recent-files-api';
import { RecentEntry } from '../../core/recent/recent.models';
import { StartupChoice } from '../../core/settings/settings.models';
import { DocumentStore } from '../document/document.store';
import { IconDocument } from '../document/icon-document';
import { exportSvg } from '../export/export-svg';
import { FilesService } from '../files/files.service';
import { svgDataUrl } from '../mockups/mockup-svg';
import { startMode } from './start-mode';
import { TEMPLATE_IDS, TEMPLATE_PREVIEW, templateDocument, TemplateId } from './start-templates';

/** Which part of the start screen gets the focus. */
export type StartSection = 'recent' | 'templates';

export interface TemplateCard {
  id: TemplateId;
  /** The template as the start screen previews it (`data:image/svg+xml`). */
  preview: string;
}

/**
 * The start screen of this window (design 082 E2): shown over a document (or none at start);
 * it disappears by itself as soon as another document is in the window – opened, dropped, from a
 * template or by the AI. Esc closes it only when a document lies behind it.
 */
@Injectable({ providedIn: 'root' })
export class StartService {
  private readonly files = inject(FilesService);
  private readonly api = inject(RecentFilesApi);
  /** The document the screen was shown over; `undefined` = not shown. */
  private readonly shownFor = signal<DocumentStore | null | undefined>(undefined);
  readonly visible = computed(() => {
    const s = this.shownFor();
    return s !== undefined && this.files.store() === s;
  });
  /** The section that takes the focus when the screen appears. */
  readonly section = signal<StartSection>('recent');
  readonly entries = signal<RecentEntry[]>([]);
  /** Bumped by every `show` – the screen moves the focus again. */
  readonly shown = signal(0);
  private cards: TemplateCard[] | null = null;

  /** The template cards (previews built once, on first use). */
  templates(): TemplateCard[] {
    this.cards ??= TEMPLATE_IDS.map((id) => {
      const p = TEMPLATE_PREVIEW[id];
      const doc = IconDocument.fromDto(templateDocument(id));
      const svg = exportSvg(doc, 'light', { mask: p.mask, frame: p.frame, effects: true });
      return { id, preview: svgDataUrl(svg) };
    });
    return this.cards;
  }

  /** A document lies behind the screen (Esc and "Back" go there). */
  readonly canClose = computed(() => this.visible() && this.files.store() !== null);

  /**
   * The window's start (design 082 E1): its file (argv, Finder, second start) first; else the
   * setting decides – a window opened for an action gets an empty document as before.
   */
  async begin(action: string | null, startup: StartupChoice): Promise<void> {
    const screen = startMode({ path: null, action, startup }) === 'screen';
    if (!(await this.files.start(!screen))) await this.show();
  }

  async show(section: StartSection = 'recent'): Promise<void> {
    this.section.set(section);
    this.shownFor.set(this.files.store());
    this.shown.update((n) => n + 1);
    await this.refresh();
  }

  close(): boolean {
    if (!this.canClose()) return false;
    this.shownFor.set(undefined);
    return true;
  }

  async refresh(): Promise<void> {
    try {
      this.entries.set(await this.api.entries());
    } catch {
      // no backend: an empty list
    }
  }

  /** Opens a recent file; opened in another window, the screen closes here too. */
  async openRecent(path: string): Promise<void> {
    await this.files.openRecent(path);
    this.close();
  }

  async openTemplate(id: TemplateId): Promise<boolean> {
    return this.files.newFromTemplate(templateDocument(id));
  }

  async blank(): Promise<void> {
    await this.files.newDocument();
  }

  async open(): Promise<void> {
    await this.files.open();
  }
}
