import { DroppedFile } from '../../core/drop/drop.models';
import { Point } from '../../shared/geometry/view-transform';

/** What happens with one dropped file (design 071 E2). */
export type DropStep =
  | { kind: 'open'; path: string }
  | { kind: 'importSvg'; path: string }
  | { kind: 'insertSvg'; path: string; at: Point }
  | { kind: 'image'; path: string; at: Point | null }
  | { kind: 'other'; path: string };

/** Further files of one drop land this far apart (document units), not on top of each other. */
export const DROP_OFFSET = 16;

/**
 * The type switch of a drop (design 071 E2/E3), pure: `.icon` opens (like "Open"), an SVG over the
 * canvas is inserted at the drop point (like "SVG Snippet"), elsewhere imported as a new layer
 * (like "Import SVG"); PNG/JPEG/WebP become an `<image>` at the point (like "Add › Image"),
 * anything else is reported. `at` = drop point in document coordinates, `null` = not over the
 * canvas. Files run in this order, one undo step each.
 */
export function planDrop(files: readonly DroppedFile[], at: Point | null): DropStep[] {
  let placed = 0;
  const next = (): Point | null => {
    if (!at) return null;
    const d = DROP_OFFSET * placed++;
    return { x: at.x + d, y: at.y + d };
  };
  return files.map((f): DropStep => {
    switch (f.kind) {
      case 'icon':
        return { kind: 'open', path: f.path };
      case 'svg': {
        const p = next();
        return p ? { kind: 'insertSvg', path: f.path, at: p } : { kind: 'importSvg', path: f.path };
      }
      case 'image':
        return { kind: 'image', path: f.path, at: next() };
      default:
        return { kind: 'other', path: f.path };
    }
  });
}

/** The hint while dragging (design 071 E4). */
export type DropHintKind = 'open' | 'insert' | 'layer' | 'none';

export function dropHintKind(files: readonly DroppedFile[], overCanvas: boolean): DropHintKind {
  if (!files.length || files.every((f) => f.kind === 'other')) return 'none';
  if (files.every((f) => f.kind === 'icon' || f.kind === 'other')) return 'open';
  return overCanvas ? 'insert' : 'layer';
}
