import { treeDocument } from '../../../testing/tree-documents';
import { panelModel } from './panel-model';
import { pairRows } from './row-pairs';
import { popoverPosition } from '../../shared/dialog/popover-position';

describe('pairs of the panel (prompt 073 E1)', () => {
  it('a rect: X/Y, W/H, RX/RY side by side; the rest single', () => {
    const doc = treeDocument();
    const m = panelModel(doc, [{ asset: 'a.svg', id: 'n7' }])!;
    const geo = m.sections.find((s) => s.section === 'geometry')!;
    const items = pairRows(geo.rows);
    expect(items.map((i) => i.key)).toEqual(['x+y', 'width+height', 'rx+ry']);
    const stroke = pairRows(m.sections.find((s) => s.section === 'stroke')!.rows);
    expect(stroke.every((i) => i.kind === 'single')).toBe(true);
  });

  it('a circle: CX/CY paired, R alone', () => {
    const m = panelModel(treeDocument(), [{ asset: 'a.svg', id: 'n8' }])!;
    const geo = m.sections.find((s) => s.section === 'geometry')!;
    expect(pairRows(geo.rows).map((i) => i.key)).toEqual(['cx+cy', 'r']);
  });
});

describe('popover position (prompt 073 E3)', () => {
  const view = { width: 1440, height: 900 };
  const size = { width: 300, height: 200 };

  it('left of an opener in the right half, right of one in the left half', () => {
    expect(popoverPosition({ left: 1200, top: 300, right: 1260, bottom: 324 }, size, view)).toEqual(
      {
        left: 892,
        top: 300,
      },
    );
    expect(popoverPosition({ left: 100, top: 300, right: 160, bottom: 324 }, size, view)).toEqual({
      left: 168,
      top: 300,
    });
  });

  it('inside a big opener at its top right; always in the window', () => {
    expect(popoverPosition({ left: 500, top: 100, right: 1100, bottom: 800 }, size, view)).toEqual({
      left: 784,
      top: 116,
    });
    expect(popoverPosition({ left: 100, top: 850, right: 160, bottom: 870 }, size, view).top).toBe(
      692,
    );
    expect(popoverPosition(null, size, view)).toEqual({ left: 1116, top: 72 });
  });
});
