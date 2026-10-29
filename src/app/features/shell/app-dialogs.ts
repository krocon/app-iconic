import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DialogService } from '../../shared/dialog/dialog.service';
import { TransformDialog } from '../transform/transform-dialog';
import { AboutDialog } from '../../features/about/about-dialog';
import { AskDialog } from '../../shared/ask/ask-dialog';
import { CommandPalette } from '../../features/menus/command-palette';
import { ShortcutsDialog } from '../../features/menus/shortcuts-dialog';
import { SvgSnippetDialog } from '../../features/commands/svg-snippet-dialog';
import { SvgSourceDialog } from '../../features/svg-source/svg-source-dialog';
import { OptimizePathDialog } from '../../features/svg-source/optimize-path-dialog';
import { ExportDialog } from '../../features/export/export-dialog';
import { TextPathDialog } from '../../features/tools/text-path-dialog';
import { SymbolPickerDialog } from '../../features/symbols/symbol-picker-dialog';
import { OffsetDialog } from '../../features/offset/offset-dialog';
import { FilletDialog } from '../../features/fillet/fillet-dialog';
import { PatternDialog } from '../../features/pattern/pattern-dialog';
import { CornersDialog } from '../../features/corners/corners-dialog';
import { ShapeSizeDialog } from '../../features/sketch/shape-size-dialog';
import { SettingsDialog } from '../../features/settings/settings-dialog';

/** The modal dialogs of the window, one at a time (`DialogService.open`). */
@Component({
  selector: 'app-dialogs',
  imports: [
    TransformDialog,
    AboutDialog,
    AskDialog,
    CommandPalette,
    ShortcutsDialog,
    SvgSnippetDialog,
    SvgSourceDialog,
    OptimizePathDialog,
    ExportDialog,
    TextPathDialog,
    SymbolPickerDialog,
    OffsetDialog,
    FilletDialog,
    PatternDialog,
    CornersDialog,
    ShapeSizeDialog,
    SettingsDialog,
  ],
  template: `
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
      @case ('transform') {
        <app-transform-dialog />
      }
      @case ('offset') {
        <app-offset-dialog />
      }
      @case ('fillet') {
        <app-fillet-dialog />
      }
      @case ('pattern') {
        <app-pattern-dialog />
      }
      @case ('corners') {
        <app-corners-dialog />
      }
      @case ('shapeSize') {
        <app-shape-size-dialog />
      }
      @case ('settings') {
        <app-settings-dialog />
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppDialogs {
  protected readonly dialogs = inject(DialogService);
}
