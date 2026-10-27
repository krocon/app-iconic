import {
  AddAsset,
  AddGroup,
  CompositeCommand,
  InsertDefinition,
  InsertNode,
  MAX_MARKUP,
} from '../document/commands';
import { IconDocument } from '../document/icon-document';
import { layerNames, newGroup, newLayer } from '../document/model/icon-json';
import {
  isContainerElement,
  isDefinitionTag,
  layerRoot,
  topLevelElements,
} from '../document/model/reorder-rules';
import { layerNameFor, uniqueAssetName, uniqueLayerName } from '../document/model/unique-names';
import { parseSvg, SVG_NS } from '../document/svg/node-ids';
import { collectIds, renameCollidingIds } from '../document/svg/svg-references';
import { Planned } from './edit-operations';
import { layerInsertParent } from '../document/model/clip-model';
import { Selection } from './follow-up';

/** Name of the asset a pasted whole SVG becomes (made unique). */
export const PASTED_ASSET = 'Pasted.svg';

const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** Clipboard text → a whole `<svg>` or the elements of a fragment; `null` if it is no SVG. */
export function parseClipboard(text: string): { whole: string | null; elements: Element[] } | null {
  const t = text.trim();
  if (!t || t.length > MAX_MARKUP) return null;
  if (/^(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg[\s>]/i.test(t)) {
    const svg = parseSvg(t);
    return svg ? { whole: t, elements: Array.from(svg.root.children) } : null;
  }
  const wrapped = parseSvg(`<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}">${t}</svg>`);
  const elements = wrapped ? Array.from(wrapped.root.children) : [];
  return elements.length ? { whole: null, elements } : null;
}

/** Where pasted nodes go: into a selected container, after another node, into a layer. */
function destination(doc: IconDocument, sel: Selection): { parent: Element; index: number } | null {
  if (sel.nodes.length) {
    const el = topLevelElements(doc, sel.nodes).at(-1);
    if (!el) return null;
    if (!el.parentElement || isContainerElement(el))
      return { parent: el, index: el.children.length };
    const index = Array.prototype.indexOf.call(el.parentElement.children, el) as number;
    return { parent: el.parentElement, index: index + 1 };
  }
  const layer = sel.items.find((i) => i.kind === 'layer');
  const root = layer?.kind === 'layer' ? layerRoot(doc, layer.group, layer.layer) : null;
  // a layer with a clip: into its clip group (design 014 E3)
  const into = root ? layerInsertParent(root) : null;
  return into ? { parent: into, index: into.children.length } : null;
}

/**
 * Paste of SVG markup (design 006 E12): cleaned and given fresh ids by `InsertNode` / `AddAsset`,
 * colliding `id`s renamed (references inside follow). Without a node or layer to paste into, the
 * markup becomes a new group on top. `null` if the text is no SVG.
 */
export function pasteCommand(doc: IconDocument, text: string, sel: Selection): Planned | null {
  const parsed = parseClipboard(text);
  if (!parsed) return null;
  const dest = destination(doc, sel);
  if (dest) {
    const ref = doc.refOf(dest.parent);
    if (!ref || !parsed.elements.length) return null;
    const taken = collectIds(doc.assets.get(ref.asset)!.svg!.root);
    renameCollidingIds(parsed.elements, taken);
    const ser = new XMLSerializer();
    // `<defs>` of definitions go into the root's defs (design 014 E10), not into the target
    const toDefs = (e: Element) =>
      e.localName === 'defs' && e.children.length > 0 && [...e.children].every(isDefinitionTag);
    const defs = parsed.elements.filter(toDefs).flatMap((d) => [...d.children]);
    const nodes = parsed.elements.filter((e) => !toDefs(e));
    const inserts = nodes.map(
      (el, k) => new InsertNode(ref, ser.serializeToString(el), dest.index + k, 'paste'),
    );
    const definitions = defs.map(
      (d) => new InsertDefinition(ref.asset, ser.serializeToString(d), 'paste'),
    );
    if (!inserts.length && !definitions.length) return null;
    return {
      // definitions last: a new root <defs> must not shift the indices of the inserts
      command: new CompositeCommand('paste', [...inserts, ...definitions]),
      selection: () => ({
        nodes: [...inserts, ...(inserts.length ? [] : definitions)].flatMap((i) =>
          i.ref ? [i.ref] : [],
        ),
        items: [],
      }),
    };
  }
  const markup =
    parsed.whole ??
    `<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}" viewBox="0 0 1024 1024">` +
      parsed.elements.map((e) => new XMLSerializer().serializeToString(e)).join('') +
      '</svg>';
  const asset = uniqueAssetName(PASTED_ASSET, [...doc.assets.keys()]);
  const layer = uniqueLayerName(layerNameFor(asset), layerNames(doc.iconJson));
  return {
    command: new CompositeCommand('paste', [
      new AddAsset(asset, markup),
      new AddGroup(newGroup(newLayer(asset, layer)), 0),
    ]),
    selection: () => ({ nodes: [], items: [{ kind: 'group', group: 0 }] }),
  };
}
