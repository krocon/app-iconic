import { registerEffectsActions } from './features/effects/effects-actions';
import { EffectsService } from './features/effects/effects.service';
import { registerTextActions } from './features/text/text-actions';
import { TextTool } from './features/text/text-tool';
import { TextEdit } from './features/text/text-edit';
import { TextToPathService } from './features/text/text-to-path.service';
import { registerColorActions } from './features/color/color-actions';
import { Eyedropper } from './features/color/eyedropper';
import { registerRenameActions, RenameService } from './features/hierarchy/rename.service';
import { DropHint } from './features/files/drop-hint';
import { FileDropService } from './features/files/file-drop.service';
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
import { registerCornersActions } from './features/corners/corners-actions';
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
import { FILES_TEXTS } from './features/files/files-texts';
import { FilesService } from './features/files/files.service';
import { RecentFilesService } from './features/files/recent-files.service';
import { registerEditActions } from './features/hierarchy/edit-actions';
import { EditService } from './features/hierarchy/edit.service';
import { HierarchyTree } from './features/hierarchy/hierarchy-tree';
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
import { registerShellActions } from './features/shell/shell-actions';
import { SHELL_TEXTS } from './features/shell/shell-texts';
import { PanelStrip, SidePanel } from './features/shell/side-panel';
import { Splitter } from './features/shell/splitter';
import { registerSettingsActions } from './features/settings/settings-actions';
import { SettingsStore } from './features/settings/settings.store';
import { AskService } from './shared/ask/ask.service';
import { DialogService } from './shared/dialog/dialog.service';
import { registerSvgSourceActions } from './features/svg-source/svg-source-actions';
import { registerExportActions } from './features/export/export-actions';
import { registerImageLayerActions } from './features/image-layer/image-layer-actions';
import { ImageLayerService } from './features/image-layer/image-layer.service';
import { ExportService } from './features/export/export.service';
import { SvgSourceService } from './features/svg-source/svg-source.service';
import { McpStore } from './features/mcp/mcp.store';
import { StartScreen } from './features/start/start-screen';
import { StartService } from './features/start/start.service';
import { RecoveryService } from './features/recovery/recovery.service';
import { keyContexts } from './features/shell/key-contexts';
import { McpBadge } from './features/mcp/mcp-badge';

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
    DropHint,
    AppDialogs,
    CanvasView,
    CommandSidebar,
    HierarchyTree,
    MenuBar,
    PropertiesPanel,
    SidePanel,
    PanelStrip,
    Splitter,
    StartScreen,
    McpBadge,
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
      <app-mcp-badge />
      <span class="sep" aria-hidden="true"></span>
      <!-- Save and Export at one click (prompt 069); Undo / Redo only here -->
      <button
        type="button"
        class="btn quiet save"
        data-testid="toolbar-save"
        [title]="actions.tooltip('file.save')"
        [attr.aria-label]="actions.label('file.save')"
        [disabled]="!actions.enabled('file.save')"
        (click)="actions.run('file.save')"
      >
        {{ t.save }}
        @if (files.dirty()) {
          <span class="dot" aria-hidden="true">•</span>
        }
      </button>
      <button
        type="button"
        class="btn quiet export"
        data-testid="toolbar-export"
        [title]="t.exportHint"
        [disabled]="!actions.enabled('file.exportPng')"
        (click)="actions.run('file.exportPng')"
      >
        {{ t.export }}
      </button>
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
    @if (start.visible()) {
      <app-start-screen class="start-screen" />
    }
    <div class="workspace" [class.covered]="start.visible()">
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
    <app-drop-hint />
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
  protected readonly mcp = inject(McpStore);
  protected readonly store = this.files.store;
  protected readonly panels = inject(LayoutStore).panels;
  protected readonly widths = inject(LayoutStore).widths;
  protected readonly mac = this.actions.os === 'mac';
  protected readonly start = inject(StartService);
  private readonly settings = inject(SettingsStore);
  private readonly recovery = inject(RecoveryService);

  constructor() {
    // files, start screen, recovery, panels, shortcuts (split in prompt 085)
    registerShellActions(this.actions, this.files, this.dialogs, this.destroyRef);
    registerEditActions(this.actions, inject(EditService), this.dialogs, this.destroyRef);
    registerRenameActions(this.actions, inject(RenameService), this.files, this.destroyRef);
    registerAddActions(this.actions, inject(AddService), this.destroyRef);
    registerColorActions(
      this.actions,
      inject(Eyedropper),
      inject(CanvasTools),
      inject(FreehandStore),
      this.files,
      this.destroyRef,
    );
    registerTextActions(
      this.actions,
      {
        tool: inject(TextTool),
        edit: inject(TextEdit),
        toPath: inject(TextToPathService),
        tools: inject(CanvasTools),
        freehand: inject(FreehandStore),
        files: this.files,
      },
      this.destroyRef,
    );
    registerEffectsActions(this.actions, inject(EffectsService), this.destroyRef);
    // files from Finder/Explorer (design 071)
    inject(FileDropService).start(this.destroyRef);
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
    registerCornersActions(this.actions, inject(CornersService), this.dialogs, this.destroyRef);
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
    // prompt 080: images as layers
    registerImageLayerActions(this.actions, inject(ImageLayerService), this.destroyRef);
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
    // where the keyboard is (design 005 E4)
    this.dispatcher.setContextProvider(keyContexts(this.dialogs));
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
    void this.begin();
  }

  /**
   * Document (or start screen, design 082 E1) first, then the action this window was opened for
   * (design 005 E6).
   */
  private async begin(): Promise<void> {
    const action = await this.win.startAction().catch(() => null);
    // loaded by the app initializer; a bare component (tests) loads them here
    if (!this.settings.loaded()) await this.settings.load();
    await this.start.begin(action, this.settings.settings().startup);
    await this.recovery.offerAtStart();
    await this.mcp.ready();
    if (action) this.actions.run(action);
  }
}
