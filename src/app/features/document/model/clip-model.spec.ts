import { svgDocument } from '../../../../testing/documents';
import {
  canvasRect,
  clipGroupsOf,
  clipOwner,
  clipPathsOf,
  clipRefOf,
  clipUsers,
  effectiveClips,
  findClipPath,
  isClipGroup,
  layerClipOf,
  resolveClip,
  uniqueClipId,
} from './clip-model';
import { clipUnitsOf } from './clip-units';
import { isDefinitionElement } from './reorder-rules';

/** The root of `a.svg` and an element by its `id` attribute. */
function setup(body: string, attrs?: string) {
  const doc = svgDocument(body, attrs);
  const root = doc.assets.get('a.svg')!.svg!.root;
  const by = (id: string) => root.querySelector(`[id="${id}"]`)!;
  return { doc, root, by };
}

const DEFS =
  '<defs><clipPath id="layer-clip"><circle cx="50" cy="50" r="50"/></clipPath>' +
  '<clipPath id="custom-clip" clipPathUnits="objectBoundingBox"><rect width="1" height="0.5"/></clipPath></defs>';

/**
 * Cases of `SVGClipPathTests.swift` (template, 25 tests) as a table: what the old model stored as
 * fields is plain SVG here (design 014 E1–E4).
 */
describe('clip model (design 014 E1–E4, cases of SVGClipPathTests)', () => {
  it.each([
    ['testClipPathHasDefinitionFlag', '#layer-clip', true],
    ['shapes inside a clip path are definitions too', '#layer-clip circle', true],
    ['a painting node is no definition', '#r', false],
  ])('%s', (_name, selector, definition) => {
    const { root } = setup(`${DEFS}<rect id="r" width="10" height="10"/>`);
    expect(isDefinitionElement(root.querySelector(selector)!)).toBe(definition);
  });

  it.each([
    ['testClipPathSupportsCircle', '<circle cx="50" cy="50" r="25"/>', ['circle']],
    ['testClipPathSupportsRect', '<rect x="10" y="10" width="80" height="80"/>', ['rect']],
    ['testClipPathSupportsEllipse', '<ellipse cx="50" cy="50" rx="40" ry="20"/>', ['ellipse']],
    ['testClipPathSupportsPath', '<path d="M0 0L100 0L100 100Z"/>', ['path']],
    ['testClipPathSupportsPolygon', '<polygon points="0,0 100,0 50,100"/>', ['polygon']],
    ['testClipPathSupportsPolyline', '<polyline points="0,0 50,50 100,0"/>', ['polyline']],
    [
      'testClipPathSupportsMultipleShapes / testClipPathStoresChildren',
      '<circle r="30"/><rect x="40" y="40" width="60" height="60"/><ellipse rx="15" ry="10"/>',
      ['circle', 'rect', 'ellipse'],
    ],
  ])('%s', (_name, shapes, tags) => {
    const { root } = setup(`<defs><clipPath id="c">${shapes}</clipPath></defs>`);
    const clip = findClipPath(root, 'c')!;
    expect(Array.from(clip.children).map((c) => c.localName)).toEqual(tags);
  });

  it('testClipPathDefaultsToUserSpaceOnUse / testClipPathAcceptsCustomUnits', () => {
    const { root } = setup(DEFS);
    expect(clipUnitsOf(findClipPath(root, 'layer-clip')!)).toBe('userSpaceOnUse');
    expect(clipUnitsOf(findClipPath(root, 'custom-clip')!)).toBe('objectBoundingBox');
  });

  it('testClipPathCanHaveTransform: kept as written (the browser applies it)', () => {
    const { root } = setup('<defs><clipPath id="t" transform="translate(10 20)"/></defs>');
    expect(findClipPath(root, 't')!.getAttribute('transform')).toBe('translate(10 20)');
  });

  it('testGroupCanStoreClipPath: a layer clip is a clip group at the layer level (E3)', () => {
    const { root, by } = setup(
      `${DEFS}<g id="g" clip-path="url(#layer-clip)"><rect id="r" width="10" height="10"/></g>`,
    );
    expect(isClipGroup(by('g'), root)).toBe(true);
    expect(layerClipOf(root)).toBe('layer-clip');
    expect(clipGroupsOf(root, 'layer-clip')).toEqual([by('g')]);
  });

  it.each([
    ['transform', '<g clip-path="url(#layer-clip)" transform="scale(2)"><rect/></g>'],
    ['opacity', '<g clip-path="url(#layer-clip)" opacity="0.5"><rect/></g>'],
    ['deeper than the layer', '<g><g clip-path="url(#layer-clip)"><rect/></g></g>'],
    ['no url', '<g clip-path="circle(50%)"><rect/></g>'],
  ])('a group with %s is no clip group', (_name, body) => {
    const { root } = setup(DEFS + body);
    expect(layerClipOf(root)).toBeNull();
  });

  it('testNodeCanReferenceClipPathById / testNodeClipPathIdDefaultsToNil', () => {
    const { root, by } = setup(
      `${DEFS}<rect id="a" clip-path="url(#custom-clip)"/><rect id="b"/>` +
        `<rect id="s" style="fill:red; clip-path: url(&quot;#custom-clip&quot;)"/>`,
    );
    expect(clipRefOf(by('a'))).toEqual({ id: 'custom-clip' });
    expect(clipRefOf(by('b'))).toBeNull();
    expect(clipRefOf(by('s'))).toEqual({ id: 'custom-clip' });
    expect(clipUsers(root, 'custom-clip')).toEqual([by('a'), by('s')]);
  });

  it.each<[string, string, string, ReturnType<typeof resolveClip>['mode'], string | null, boolean]>(
    [
      [
        'testClipPathInheritanceFromLayer',
        '<g clip-path="url(#layer-clip)"><rect id="x"/></g>',
        'x',
        'inherit',
        'layer-clip',
        true,
      ],
      [
        'testNodeCanOverrideLayerClipPath',
        '<g clip-path="url(#layer-clip)"><rect id="x" clip-path="url(#custom-clip)"/></g>',
        'x',
        'own',
        'custom-clip',
        false,
      ],
      [
        'testNodeCanOptOutWithNone: “none” is no own clip, the layer still clips (E2)',
        '<g clip-path="url(#layer-clip)"><rect id="x" clip-path="none"/></g>',
        'x',
        'inherit',
        'layer-clip',
        true,
      ],
      [
        'opt-out by structure: next to the clip group (E4)',
        '<g clip-path="url(#layer-clip)"><rect/></g><rect id="x"/>',
        'x',
        'none',
        null,
        false,
      ],
      [
        'from an ordinary clipped group',
        '<g transform="scale(2)" clip-path="url(#custom-clip)"><g><rect id="x"/></g></g>',
        'x',
        'inherit',
        'custom-clip',
        false,
      ],
    ],
  )('%s', (_name, body, id, mode, clip, layer) => {
    const { root, by } = setup(DEFS + body);
    const r = resolveClip(by(id), root);
    expect([r.mode, r.clip, r.layer]).toEqual([mode, clip, layer]);
  });

  it('other values stay, but are no id (E1)', () => {
    const { root, by } = setup('<rect id="x" clip-path="inset(10%)"/>');
    expect(resolveClip(by('x'), root)).toMatchObject({
      mode: 'own',
      clip: null,
      other: 'inset(10%)',
    });
  });

  it('effective clips intersect: own first, then outwards', () => {
    const { root, by } = setup(
      `${DEFS}<g clip-path="url(#layer-clip)"><g clip-path="url(#custom-clip)"><rect id="x" clip-path="url(#layer-clip)"/></g></g>`,
    );
    expect(effectiveClips(by('x'), root)).toEqual(['layer-clip', 'custom-clip', 'layer-clip']);
  });

  it('testClipPathFrameUnionOfChildren: the owner is the first painting user', () => {
    const { root, by } = setup(
      `${DEFS}<rect id="a"/><g id="g" clip-path="url(#layer-clip)"><rect id="b"/></g><rect id="c" clip-path="url(#layer-clip)"/>`,
    );
    expect(clipOwner(root, findClipPath(root, 'layer-clip')!)).toBe(by('g'));
    expect(clipOwner(root, findClipPath(root, 'custom-clip')!)).toBeNull();
    expect(clipPathsOf(root).map((c) => c.id)).toEqual(['layer-clip', 'custom-clip']);
  });

  it('unique ids and the canvas rectangle (E6)', () => {
    const { root } = setup(`${DEFS}<rect id="clip"/><rect id="clip-2"/>`);
    expect(uniqueClipId(root)).toBe('clip-3');
    expect(uniqueClipId(root, 'mask')).toBe('mask');
    expect(canvasRect(root)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(canvasRect(setup('', 'width="24px" height="12"').root)).toEqual({
      x: 0,
      y: 0,
      width: 24,
      height: 12,
    });
    expect(canvasRect(setup('', '').root).width).toBe(1024);
  });
});
