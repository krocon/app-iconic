import { AttributeChange, DocCommand, SetAttributes } from '../document/commands';
import { IconDocument, NodeRef } from '../document/icon-document';
import { elementsOf } from '../document/svg/node-ids';

/**
 * Renaming an SVG element in the tree (prompt 072 E1): its `id` – SVG's own name, shown as the
 * label and kept in the export. The new id must be a valid XML name and unique in the asset; every
 * reference to the old one (`url(#…)` in any attribute, `href="#…"`) follows in the same step, so
 * a gradient or clip stays attached. Pure – reads the DOM, returns a serialisable command.
 */
export type RenameError = 'invalid' | 'taken' | 'referenced';

/** Most characters of an id. */
export const MAX_ID = 255;

/** An XML name without colons (they would look like a namespace prefix). */
const NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

const URL_REF = /url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g;

/** Every attribute of the asset that refers to `id`, with its value after the rename. */
function referenceChanges(
  doc: IconDocument,
  root: Element,
  from: string,
  to: string,
): AttributeChange[] {
  const out: AttributeChange[] = [];
  for (const el of elementsOf(root)) {
    for (const a of Array.from(el.attributes)) {
      let v = a.value;
      if (a.localName === 'href' && v === `#${from}`) v = `#${to}`;
      v = v.replace(URL_REF, (all, q: string, id: string) =>
        id === from ? `url(${q}#${to}${q})` : all,
      );
      if (v === a.value) continue;
      const ref = doc.refOf(el);
      if (ref) out.push({ ref, name: a.name, value: v });
    }
  }
  return out;
}

/** The command for `ref` → `id`; `null` if nothing changes; an error the user is told. */
export function renameElementCommand(
  doc: IconDocument,
  ref: NodeRef,
  id: string,
): DocCommand | RenameError | null {
  const el = doc.node(ref);
  const root = doc.assets.get(ref.asset)?.svg?.root;
  if (!el || !root) return 'invalid';
  const to = id.trim();
  const from = el.getAttribute('id') ?? '';
  if (to === from) return null;
  if (to.length > MAX_ID || (to && !NAME.test(to))) return 'invalid';
  const refs = from ? referenceChanges(doc, root, from, to) : [];
  if (!to) {
    // without a name the references would break
    return refs.length
      ? 'referenced'
      : new SetAttributes([{ ref, name: 'id', value: null }], 'renameElement');
  }
  const taken = elementsOf(root).some((e) => e !== el && e.getAttribute('id') === to);
  if (taken) return 'taken';
  return new SetAttributes([{ ref, name: 'id', value: to }, ...refs], 'renameElement');
}
