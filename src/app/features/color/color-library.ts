import { computed, inject, Injectable } from '@angular/core';
import { MAX_PALETTE_COLORS, MAX_RECENT_COLORS } from '../../core/settings/settings.models';
import { hexColor } from '../../core/settings/settings-rules';
import { ColorSwatches, SwatchGroup } from '../../shared/controls/color-swatches';
import { FilesService } from '../files/files.service';
import { SettingsStore } from '../settings/settings.store';
import { COLOR_TEXTS as T } from './color-texts';
import { documentColors } from './document-colors';

/** Most document colours in the popover. */
const DOCUMENT_SWATCHES = 24;

/**
 * The swatches of the colour popover (prompt 074 E1/E5): the document's colours (most used
 * first), the recently used ones and the user's palette – both in `settings.json`
 * (`colors.recent`, `colors.palette`, shared by every window).
 */
@Injectable({ providedIn: 'root' })
export class ColorLibrary extends ColorSwatches {
  private readonly files = inject(FilesService);
  private readonly settings = inject(SettingsStore);

  readonly documentColors = computed(() => {
    const s = this.files.store();
    if (!s) return [];
    s.revision();
    return documentColors(s.document());
  });

  private readonly all = computed((): SwatchGroup[] => {
    const c = this.settings.settings().colors;
    return [
      {
        id: 'document',
        label: T.document,
        colors: this.documentColors()
          .slice(0, DOCUMENT_SWATCHES)
          .map((d) => d.color),
      },
      { id: 'recent', label: T.recent, colors: c?.recent ?? [] },
      { id: 'palette', label: T.palette, colors: c?.palette ?? [] },
    ];
  });

  groups(): readonly SwatchGroup[] {
    return this.all();
  }

  used(color: string): void {
    const c = hexColor(color);
    if (!c) return;
    const recent = this.settings.settings().colors?.recent ?? [];
    const next = [c, ...recent.filter((x) => x !== c)].slice(0, MAX_RECENT_COLORS);
    this.settings.update({ colors: { recent: next } });
  }

  addToPalette(color: string): void {
    const c = hexColor(color);
    const palette = this.settings.settings().colors?.palette ?? [];
    if (!c || palette.includes(c) || palette.length >= MAX_PALETTE_COLORS) return;
    this.settings.update({ colors: { palette: [...palette, c] } });
  }
}
