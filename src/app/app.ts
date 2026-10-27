import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { ActionService } from './core/actions/action.service';
import { KeyboardDispatcher } from './core/actions/keyboard-dispatcher';
import { WindowApi } from './core/window/window-api';
import { AboutDialog } from './features/about/about-dialog';
import { CanvasView } from './features/canvas/canvas-view';
import { registerAddActions } from './features/commands/add-actions';
import { AddService } from './features/commands/add.service';
import { CommandSidebar } from './features/commands/command-sidebar';
import { SvgSnippetDialog } from './features/commands/svg-snippet-dialog';
import { SymbolPickerDialog } from './features/symbols/symbol-picker-dialog';
import { SymbolService } from './features/symbols/symbol.service';
import { FreehandService } from './features/tools/freehand.service';
import { TextPathDialog } from './features/tools/text-path-dialog';
import { TextPathService } from './features/tools/text-path.service';
import { registerToolActions } from './features/tools/tools-actions';
import { registerFileActions } from './features/files/file-actions';
import { FILES_TEXTS } from './features/files/files-texts';
import { FilesService } from './features/files/files.service';
import { RecentFilesService } from './features/files/recent-files.service';
import { registerEditActions } from './features/hierarchy/edit-actions';
import { EditService } from './features/hierarchy/edit.service';
import { HierarchyTree } from './features/hierarchy/hierarchy-tree';
import { registerAppActions } from './features/menus/app-actions';
import { CommandPalette } from './features/menus/command-palette';
import { MenuBar } from './features/menus/menu-bar';
import { MenuService } from './features/menus/menu.service';
import { registerPropertiesActions } from './features/properties/properties-actions';
import { registerIconActions } from './features/inspector/icon-actions';
import { IconInspectorService } from './features/inspector/icon-inspector.service';
import { PropertiesPanel } from './features/properties/properties-panel';
import { PropertiesService } from './features/properties/properties.service';
import { ShortcutsDialog } from './features/menus/shortcuts-dialog';
import { LayoutStore } from './features/shell/layout.store';
import { SHELL_TEXTS } from './features/shell/shell-texts';
import { SidePanel } from './features/shell/side-panel';
import { AskDialog } from './shared/ask/ask-dialog';
import { DialogService } from './shared/dialog/dialog.service';
import { OptimizePathDialog } from './features/svg-source/optimize-path-dialog';
import { registerSvgSourceActions } from './features/svg-source/svg-source-actions';
import { registerExportActions } from './features/export/export-actions';
import { ExportService } from './features/export/export.service';
import { ExportDialog } from './features/export/export-dialog';
import { SvgSourceDialog } from './features/svg-source/svg-source-dialog';
import { SvgSourceService } from './features/svg-source/svg-source.service';

/**
 * Root (design 005 E11): one header row – the HTML menu bar (Windows/Linux; macOS has the native
 * menu), the document title and Undo/Redo –, the three side panels (⌘1/⌘2/⌘3; legacy defaults
 * 260 / 260 / 300 px), the canvas and the one modal dialog of the moment. One document per window
 * (design 003 E8). Every function is an action (design 005 E17); this component only wires them.
 */
@Component({
  selector: 'app-root',
  imports: [
    AboutDialog,
    AskDialog,
    CanvasView,
    CommandPalette,
    CommandSidebar,
    HierarchyTree,
    MenuBar,
    OptimizePathDialog,
    ExportDialog,
    PropertiesPanel,
    ShortcutsDialog,
    SidePanel,
    SvgSnippetDialog,
    SymbolPickerDialog,
    TextPathDialog,
    SvgSourceDialog,
  ],
  template: `
    <header class="toolbar">
      <img class="mark" src="icon.svg" alt="" />
      @if (mac) {
        <span class="name">{{ t.appName }}</span>
      } @else {
        <app-menu-bar class="menus" />
      }
      <span class="spacer"></span>
      <span class="doc" data-testid="doc-title">
        {{ files.title() }}
        @if (files.dirty()) {
          <span class="edited" [title]="f.edited"
            >• <span class="sr-only">{{ f.edited }}</span></span
          >
        }
      </span>
      <span class="sep" aria-hidden="true"></span>
      <button
        type="button"
        class="btn quiet undo"
        [title]="actions.tooltip('edit.undo')"
        [attr.aria-label]="actions.label('edit.undo')"
        [disabled]="!actions.enabled('edit.undo')"
        (click)="actions.run('edit.undo')"
      >
        {{ t.undo }}
      </button>
      <button
        type="button"
        class="btn quiet redo"
        [title]="actions.tooltip('edit.redo')"
        [attr.aria-label]="actions.label('edit.redo')"
        [disabled]="!actions.enabled('edit.redo')"
        (click)="actions.run('edit.redo')"
      >
        {{ t.redo }}
      </button>
    </header>
    <div class="workspace">
      @if (panels().commands) {
        <app-side-panel class="commands" [heading]="t.commands" [flush]="true">
          <app-command-sidebar />
        </app-side-panel>
      }
      @if (panels().hierarchy) {
        <app-side-panel class="hierarchy" [heading]="t.hierarchy" [flush]="!!store()">
          @if (store(); as s) {
            <app-hierarchy-tree [store]="s" />
          } @else {
            {{ t.noDocument }}
          }
        </app-side-panel>
      }
      <app-canvas-view [store]="store()" />
      @if (panels().properties) {
        <app-side-panel class="properties" [heading]="t.properties" [flush]="true">
          <app-properties-panel [store]="store()" />
        </app-side-panel>
      }
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
      @case ('palette') {
        <app-command-palette />
      }
      @case ('shortcuts') {
        <app-shortcuts-dialog />
      }
      @case ('svgSnippet') {
        <app-svg-snippet-dialog />
      }
      @case ('svgSource') {
        <app-svg-source-dialog />
      }
      @case ('optimizePath') {
        <app-optimize-path-dialog />
      }
      @case ('export') {
        <app-export-dialog />
      }
      @case ('textPath') {
        <app-text-path-dialog />
      }
      @case ('symbolPicker') {
        <app-symbol-picker-dialog />
      }
    }
  `,
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  protected readonly dialogs = inject(DialogService);
  protected readonly files = inject(FilesService);
  protected readonly actions = inject(ActionService);
  private readonly dispatcher = inject(KeyboardDispatcher);
  private readonly menus = inject(MenuService);
  private readonly recent = inject(RecentFilesService);
  private readonly win = inject(WindowApi);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly t = SHELL_TEXTS;
  protected readonly f = FILES_TEXTS;
  protected readonly store = this.files.store;
  protected readonly panels = inject(LayoutStore).panels;
  protected readonly mac = this.actions.os === 'mac';

  constructor() {
    registerFileActions(this.actions, this.files, this.recent, this.destroyRef);
    registerAppActions(
      this.actions,
      this.dialogs,
      inject(LayoutStore),
      this.files,
      this.destroyRef,
    );
    registerEditActions(this.actions, inject(EditService), this.dialogs, this.destroyRef);
    registerAddActions(this.actions, inject(AddService), this.destroyRef);
    registerToolActions(
      this.actions,
      inject(AddService),
      inject(FreehandService),
      inject(TextPathService),
      inject(SymbolService),
      this.destroyRef,
    );
    registerPropertiesActions(this.actions, inject(PropertiesService), this.destroyRef);
    registerIconActions(this.actions, inject(IconInspectorService), this.destroyRef);
    registerSvgSourceActions(this.actions, inject(SvgSourceService), this.destroyRef);
    registerExportActions(this.actions, inject(ExportService), this.destroyRef);
    // where the keyboard is (design 005 E4): a dialog owns it; else hierarchy or canvas first
    this.dispatcher.setContextProvider((target) => {
      if (this.dialogs.open() !== null) return ['dialog'];
      if (target?.closest('app-side-panel.hierarchy')) return ['hierarchy', 'global'];
      // the panel's sliders and buttons keep their arrow keys (no canvas nudge, design 009 E12)
      if (target?.closest('app-side-panel.properties')) return ['global'];
      return ['canvas', 'global'];
    });
  }

  ngOnInit(): void {
    this.dispatcher.attach(document);
    this.menus.start();
    void this.actions.loadOverrides();
    void this.recent.refresh();
    // other windows may have opened files: "Open Recent" is checked when the window comes back
    const refresh = () => void this.recent.refresh();
    window.addEventListener('focus', refresh);
    this.destroyRef.onDestroy(() => window.removeEventListener('focus', refresh));
    void this.start();
  }

  /** Document first, then the action this window was opened for (design 005 E6). */
  private async start(): Promise<void> {
    await this.files.start();
    const action = await this.win.startAction().catch(() => null);
    if (action) this.actions.run(action);
  }
}
