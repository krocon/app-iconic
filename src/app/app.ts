import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AboutDialog } from './features/about/about-dialog';
import { CanvasView } from './features/canvas/canvas-view';
import { SHELL_TEXTS } from './features/shell/shell-texts';
import { SidePanel } from './features/shell/side-panel';
import { DialogService } from './shared/dialog/dialog.service';

/**
 * Root: toolbar, the three side panels (legacy defaults 260 / 260 / 300 px, prompt 006/009 fill
 * them, 015 makes them resizable and hideable), the canvas and the one modal dialog of the moment.
 */
@Component({
  selector: 'app-root',
  imports: [AboutDialog, CanvasView, SidePanel],
  template: `
    <header class="toolbar">
      <img class="mark" src="icon.svg" alt="" />
      <span class="name">{{ t.appName }}</span>
      <span class="doc">{{ t.noDocument }}</span>
      <span class="spacer"></span>
      <button type="button" class="btn quiet about" (click)="dialogs.show('about')">
        {{ t.about }}
      </button>
    </header>
    <div class="workspace">
      <app-side-panel class="commands" [heading]="t.commands">{{ t.comingSoon }}</app-side-panel>
      <app-side-panel class="hierarchy" [heading]="t.hierarchy">{{ t.comingSoon }}</app-side-panel>
      <app-canvas-view />
      <app-side-panel class="properties" [heading]="t.properties">{{
        t.nothingSelected
      }}</app-side-panel>
    </div>
    @switch (dialogs.open()) {
      @case ('about') {
        <app-about-dialog />
      }
    }
  `,
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly dialogs = inject(DialogService);
  protected readonly t = SHELL_TEXTS;
}
