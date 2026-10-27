import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { DialogService } from '../../shared/dialog/dialog.service';
import { FilesService } from '../files/files.service';
import { LayoutStore, PanelId } from '../shell/layout.store';

/**
 * Actions of the window shell (design 005 E17): palette, shortcut overview, About, the side
 * panels (⌘1/⌘2/⌘3, widths since 015) and `edit.runCommand` – a serialised document command (design 005 E15), the
 * way the AI of prompt 018 changes the document. Throws `CommandError` for an invalid one.
 */
export function registerAppActions(
  actions: ActionService,
  dialogs: DialogService,
  layout: LayoutStore,
  files: FilesService,
  destroyRef?: DestroyRef,
): void {
  const noDialog = () => dialogs.open() === null;
  const panel = (id: PanelId) => ({
    run: () => layout.toggle(id),
    checked: () => layout.panels()[id],
  });
  actions.registerAll(
    {
      'app.palette': { run: () => dialogs.show('palette'), enabled: noDialog },
      'app.shortcuts': { run: () => dialogs.show('shortcuts'), enabled: noDialog },
      'app.about': { run: () => dialogs.show('about'), enabled: noDialog },
      'view.commandSidebar': panel('commands'),
      'view.hierarchy': panel('hierarchy'),
      'view.properties': panel('properties'),
      // width of a side panel (design 015 E10): without `width` the default
      'view.panelWidth': {
        run: (args) => {
          const { panel: id, width } = args as { panel: PanelId; width?: number };
          if (width === undefined) layout.resetWidth(id);
          else layout.setWidth(id, width);
        },
        enabled: (args) => args !== undefined,
      },
      'edit.runCommand': {
        run: (args) => files.store()?.runCommand((args as { command: unknown }).command),
        enabled: () => files.store() !== null,
      },
    },
    destroyRef,
  );
}
