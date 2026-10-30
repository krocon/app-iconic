import { ActionContext } from '../../core/actions/catalog/action-def';
import { DialogService } from '../../shared/dialog/dialog.service';

/**
 * Where the keyboard is (design 005 E4; split from `app.ts` in prompt 082): a dialog owns it;
 * else hierarchy or canvas first. The start screen (082) keeps the global shortcuts only – its
 * grids handle their own keys.
 */
export function keyContexts(dialogs: DialogService) {
  return (target: Element | null): ActionContext[] => {
    if (dialogs.modal()) return ['dialog'];
    // a popover (prompt 073) owns the keys inside it; the canvas keeps its own
    if (dialogs.popover() && target?.closest('[data-popover]')) return ['dialog'];
    if (target?.closest('app-start-screen')) return ['global'];
    if (target?.closest('app-side-panel.hierarchy')) return ['hierarchy', 'global'];
    // the panel's sliders and buttons keep their arrow keys (no canvas nudge, design 009 E12)
    if (target?.closest('app-side-panel.properties')) return ['global'];
    // while a shape is dragged its keys (↑/↓ sides, Space moves) come first (prompt 041)
    return ['drawing', 'canvas', 'global'];
  };
}
