import { registerClipActions } from './features/clip/clip-actions';
import { ClipService } from './features/clip/clip.service';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { ActionService } from './core/actions/action.service';
import { KeyboardDispatcher } from './core/actions/keyboard-dispatcher';
import { WindowApi } from './core/window/window-api';
import { CanvasView } from './features/canvas/canvas-view';
import { registerAddActions } from './features/commands/add-actions';
import { AddService } from './features/commands/add.service';
import { CommandSidebar } from './features/commands/command-sidebar';
import { CornersService } from './features/corners/corners.service';
import { SymbolService } from './features/symbols/symbol.service';
import { FreehandService } from './features/tools/freehand.service';
import { TextPathService } from './features/tools/text-path.service';
import { registerToolActions } from './features/tools/tools-actions';
import { registerSketchActions } from './features/sketch/sketch-actions';
import { SketchService } from './features/sketch/sketch.service';
import { CanvasTools } from './features/canvas/canvas-tools';
import { PenService } from './features/pen/pen.service';
import { CurvatureService } from './features/pen/curvature.service';
import { FreehandStore } from './features/tools/freehand.store';
import { registerPenActions } from './features/pen/pen-actions';
import { registerPathTools } from './features/pathfinder/path-tools';
import { AppDialogs } from './features/shell/app-dialogs';
import { registerFileActions } from './features/files/file-actions';
import { FILES_TEXTS } from './features/files/files-texts';
import { FilesService } from './features/files/files.service';
import { RecentFilesService } from './features/files/recent-files.service';
import { registerEditActions } from './features/hierarchy/edit-actions';
import { EditService } from './features/hierarchy/edit.service';
import { HierarchyTree } from './features/hierarchy/hierarchy-tree';
import { registerAppActions } from './features/menus/app-actions';
import { MenuBar } from './features/menus/menu-bar';
import { MenuService } from './features/menus/menu.service';
import { registerPropertiesActions } from './features/properties/properties-actions';
import { registerIconActions } from './features/inspector/icon-actions';
import { IconInspectorService } from './features/inspector/icon-inspector.service';
import { PropertiesPanel } from './features/properties/properties-panel';
import { registerToolContexts } from './features/tools/tool-context-providers';
import { ToolContexts } from './features/canvas/tool-context';
import { SketchStore } from './features/sketch/sketch.store';
import { FilletService } from './features/fillet/fillet.service';
import { ConstraintTool } from './features/constraints/constraint-tool';
import { LiveFillTool } from './features/live-fill/live-fill-tool';
import { LiveFillService } from './features/live-fill/live-fill.service';
import { registerBoxActions } from './features/properties/box-actions';
import { BoxService } from './features/properties/box.service';
import { PropertiesService } from './features/properties/properties.service';
import { LayoutStore } from './features/shell/layout.store';
import { SHELL_TEXTS } from './features/shell/shell-texts';
import { PanelStrip, SidePanel } from './features/shell/side-panel';
import { Splitter } from './features/shell/splitter';
import { registerSettingsActions } from './features/settings/settings-actions';
import { SettingsStore } from './features/settings/settings.store';
import { AskService } from './shared/ask/ask.service';
import { DialogService } from './shared/dialog/dialog.service';
import { registerSvgSourceActions } from './features/svg-source/svg-source-actions';
import { registerExportActions } from './features/export/export-actions';
import { ExportService } from './features/export/export.service';
import { SvgSourceService } from './features/svg-source/svg-source.service';
import { McpStore } from './features/mcp/mcp.store';
import { MCP_TEXTS } from './features/mcp/mcp-texts';

/**
 * Root (design 005 E11): one header row – the HTML menu bar (Windows/Linux; macOS has the native
 * menu), the document title and Undo/Redo –, the three side panels (⌘1/⌘2/⌘3; widths 160…480
 * with splitters, legacy defaults 260 / 260 / 300 px, design 015 E10), the canvas and the one
 * modal dialog of the moment. One document per window
 * (design 003 E8). Every function is an action (design 005 E17); this component only wires them.
 */
@Component({
  selector: 'app-root',
  imports: [
    AppDialogs,
    CanvasView,
    CommandSidebar,
    HierarchyTree,
    MenuBar,
    PropertiesPanel,
    SidePanel,
    PanelStrip,
    Splitter,
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
      @if (mcp.connected()) {
        <button
          type="button"
          class="btn quiet ai-badge"
          data-testid="ai-badge"
          [title]="m.badgeTitle(mcp.info().connections) + ' – ' + actions.label('mcp.disconnect')"
          [attr.aria-label]="
            m.badgeTitle(mcp.info().connections) + ' – ' + actions.label('mcp.disconnect')
          "
          (click)="actions.run('mcp.disconnect')"
        >
          {{ m.badge }}
        </button>
      }
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
        <app-side-panel
          class="commands"
          toggle="view.commandSidebar"
          [heading]="t.commands"
          [flush]="true"
          [style.width.px]="widths().commands"
        >
          <app-command-sidebar />
        </app-side-panel>
        <app-splitter panel="commands" side="end" [name]="t.commands" />
      } @else {
        <app-panel-strip
          class="commands-strip"
          toggle="view.commandSidebar"
          [heading]="t.commands"
          [tools]="true"
        >
          <app-command-sidebar [compact]="true" />
        </app-panel-strip>
      }
      @if (panels().hierarchy) {
        <app-side-panel
          class="hierarchy"
          toggle="view.hierarchy"
          [heading]="t.hierarchy"
          [flush]="!!store()"
          [style.width.px]="widths().hierarchy"
        >
          @if (store(); as s) {
            <app-hierarchy-tree [store]="s" />
          } @else {
            {{ t.noDocument }}
          }
        </app-side-panel>
        <app-splitter panel="hierarchy" side="end" [name]="t.hierarchy" />
      } @else {
        <app-panel-strip class="hierarchy-strip" toggle="view.hierarchy" [heading]="t.hierarchy" />
      }
      <app-canvas-view [store]="store()" />
      @if (panels().properties) {
        <app-splitter panel="properties" side="start" [name]="t.properties" />
        <app-side-panel
          class="properties"
          toggle="view.properties"
          side="end"
          [heading]="t.properties"
          [flush]="true"
          [style.width.px]="widths().properties"
        >
          <app-properties-panel [store]="store()" />
        </app-side-panel>
      } @else {
        <app-panel-strip
          class="properties-strip"
          toggle="view.properties"
          side="end"
          [heading]="t.properties"
        />
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
    <app-dialogs />
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
  protected readonly m = MCP_TEXTS;
  protected readonly mcp = inject(McpStore);
  protected readonly store = this.files.store;
  protected readonly panels = inject(LayoutStore).panels;
  protected readonly widths = inject(LayoutStore).widths;
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
    const canvasTools = inject(CanvasTools);
    registerToolActions(
      this.actions,
      inject(AddService),
      inject(FreehandService),
      inject(TextPathService),
      inject(SymbolService),
      this.destroyRef,
      () => canvasTools.stopAll(),
    );
    const penService = inject(PenService);
    registerSketchActions(
      this.actions,
      inject(AddService),
      inject(SketchService),
      this.destroyRef,
      penService.pen,
    );
    const corners = inject(CornersService);
    this.actions.registerAll(
      {
        // Live Corners (prompt 045): with `radius` / `kind` at once, else the dialog
        'corners.set': {
          run: (a) => {
            const args = a as
              { radius?: number; kind?: 'round' | 'inverted' | 'chamfer' } | undefined;
            if (args?.radius === undefined) {
              this.dialogs.show('corners');
              return true;
            }
            return corners.apply(args.radius, args.kind ?? 'round');
          },
          enabled: () => corners.canApply(),
        },
      },
      this.destroyRef,
    );
    registerPathTools(this.actions, canvasTools, this.destroyRef);
    // the context bar of the active tool (prompt 067)
    registerToolContexts(
      inject(ToolContexts),
      {
        settings: inject(SettingsStore),
        sketch: inject(SketchStore),
        freehand: inject(FreehandStore),
        fillet: inject(FilletService),
        constraint: inject(ConstraintTool),
        liveFill: inject(LiveFillTool),
        liveFillService: inject(LiveFillService),
      },
      this.destroyRef,
    );
    registerPenActions(
      this.actions,
      inject(AddService),
      penService,
      canvasTools,
      inject(FreehandStore),
      inject(CurvatureService),
      this.destroyRef,
    );
    registerPropertiesActions(this.actions, inject(PropertiesService), this.destroyRef);
    registerBoxActions(this.actions, inject(BoxService), this.destroyRef);
    registerIconActions(this.actions, inject(IconInspectorService), this.destroyRef);
    registerSvgSourceActions(this.actions, inject(SvgSourceService), this.destroyRef);
    registerExportActions(this.actions, inject(ExportService), this.destroyRef);
    registerClipActions(this.actions, inject(ClipService), this.destroyRef);
    registerSettingsActions(
      this.actions,
      inject(SettingsStore),
      this.dialogs,
      inject(AskService),
      this.destroyRef,
    );
    // AI control (design 018): calls of the MCP sidecar for this window's document
    this.mcp.start(this.destroyRef);
    // where the keyboard is (design 005 E4): a dialog owns it; else hierarchy or canvas first
    this.dispatcher.setContextProvider((target) => {
      if (this.dialogs.open() !== null) return ['dialog'];
      if (target?.closest('app-side-panel.hierarchy')) return ['hierarchy', 'global'];
      // the panel's sliders and buttons keep their arrow keys (no canvas nudge, design 009 E12)
      if (target?.closest('app-side-panel.properties')) return ['global'];
      // while a shape is dragged its keys (↑/↓ sides, Space moves) come first (prompt 041)
      return ['drawing', 'canvas', 'global'];
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
    await this.mcp.ready();
    const action = await this.win.startAction().catch(() => null);
    if (action) this.actions.run(action);
  }
}
