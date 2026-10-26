import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { AboutDialog } from './features/about/about-dialog';
import { CanvasView } from './features/canvas/canvas-view';
import { FILES_TEXTS, platformHint } from './features/files/files-texts';
import { FilesService } from './features/files/files.service';
import { ProvisionalShortcuts } from './features/files/provisional-shortcuts';
import { RecentMenu } from './features/files/recent-menu';
import { HierarchyList } from './features/hierarchy/hierarchy-list';
import { SHELL_TEXTS } from './features/shell/shell-texts';
import { SidePanel } from './features/shell/side-panel';
import { AskDialog } from './shared/ask/ask-dialog';
import { DialogService } from './shared/dialog/dialog.service';

/**
 * Root: toolbar with the file actions (until the menus of prompt 005), the three side panels
 * (legacy defaults 260 / 260 / 300 px; 006/009 fill them, 015 makes them resizable), the canvas
 * and the one modal dialog of the moment. One document per window (design 003 E8).
 */
@Component({
  selector: 'app-root',
  imports: [AboutDialog, AskDialog, CanvasView, HierarchyList, RecentMenu, SidePanel],
  template: `
    <header class="toolbar">
      <img class="mark" src="icon.svg" alt="" />
      <span class="name">{{ t.appName }}</span>
      <nav class="actions" [attr.aria-label]="t.fileActions">
        <button
          type="button"
          class="btn quiet"
          [title]="hint(f.newDocumentHint)"
          (click)="files.newDocument()"
        >
          {{ f.newDocument }}
        </button>
        <button type="button" class="btn quiet" [title]="hint(f.openHint)" (click)="files.open()">
          {{ f.open }}
        </button>
        <app-recent-menu />
        <button
          type="button"
          class="btn quiet"
          [title]="hint(f.importSvgHint)"
          (click)="files.importSvg()"
        >
          {{ f.importSvg }}
        </button>
        <button
          type="button"
          class="btn quiet"
          [title]="hint(f.saveHint)"
          [disabled]="!canSave()"
          (click)="files.save()"
        >
          {{ f.save }}
        </button>
        <button
          type="button"
          class="btn quiet"
          [title]="hint(f.saveAsHint)"
          (click)="files.saveAs()"
        >
          {{ f.saveAs }}
        </button>
        <button type="button" class="btn quiet" [title]="hint(f.closeHint)" (click)="files.close()">
          {{ f.close }}
        </button>
        <button
          type="button"
          class="btn quiet"
          [title]="hint(f.newWindowHint)"
          (click)="files.newWindow()"
        >
          {{ f.newWindow }}
        </button>
        <span class="sep" aria-hidden="true"></span>
        <button
          type="button"
          class="btn quiet undo"
          [title]="(store()?.undoLabel() ?? t.undo) + ' ' + hint(f.undoHint)"
          [attr.aria-label]="store()?.undoLabel() ?? t.undo"
          [disabled]="!store()?.canUndo()"
          (click)="files.undo()"
        >
          {{ t.undo }}
        </button>
        <button
          type="button"
          class="btn quiet redo"
          [title]="(store()?.redoLabel() ?? t.redo) + ' ' + hint(f.redoHint)"
          [attr.aria-label]="store()?.redoLabel() ?? t.redo"
          [disabled]="!store()?.canRedo()"
          (click)="files.redo()"
        >
          {{ t.redo }}
        </button>
      </nav>
      <span class="spacer"></span>
      <span class="doc" data-testid="doc-title">
        {{ files.title() }}
        @if (files.dirty()) {
          <span class="edited" [title]="f.edited"
            >• <span class="sr-only">{{ f.edited }}</span></span
          >
        }
      </span>
      <button type="button" class="btn quiet about" (click)="dialogs.show('about')">
        {{ t.about }}
      </button>
    </header>
    <div class="workspace">
      <app-side-panel class="commands" [heading]="t.commands">{{ t.comingSoon }}</app-side-panel>
      <app-side-panel class="hierarchy" [heading]="t.hierarchy">
        @if (store(); as s) {
          <app-hierarchy-list [store]="s" />
        } @else {
          {{ t.noDocument }}
        }
      </app-side-panel>
      <app-canvas-view [store]="store()" />
      <app-side-panel class="properties" [heading]="t.properties">{{
        t.nothingSelected
      }}</app-side-panel>
    </div>
    @if (files.notice(); as n) {
      <div class="status" role="status">
        <span class="notice">{{ n }}</span>
        <button type="button" class="btn quiet" (click)="files.notice.set(null)">
          {{ f.dismiss }}
        </button>
      </div>
    }
    @switch (dialogs.open()) {
      @case ('about') {
        <app-about-dialog />
      }
      @case ('ask') {
        <app-ask-dialog />
      }
    }
  `,
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  protected readonly dialogs = inject(DialogService);
  protected readonly files = inject(FilesService);
  private readonly shortcuts = inject(ProvisionalShortcuts);
  protected readonly t = SHELL_TEXTS;
  protected readonly f = FILES_TEXTS;
  protected readonly store = this.files.store;

  private readonly mac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');

  protected hint(text: string): string {
    return platformHint(text, this.mac);
  }

  protected canSave(): boolean {
    const s = this.store();
    return !!s && (s.dirty() || s.document().path === null);
  }

  ngOnInit(): void {
    this.shortcuts.install();
    void this.files.start();
  }
}
