import { findAsset } from '../../core/icon-file/asset-names';
import {
  AssetKind,
  IconDocumentDto,
  IconFormat,
  IconJson,
  IconWarningCode,
  SaveAsset,
  SaveIconRequest,
  SaveResult,
} from '../../core/icon-file/icon-file.models';
import { nameKey } from './model/unique-names';
import { assignIds, goLive, ID_ATTR, parseSvg, serializeAsset, SvgText } from './svg/node-ids';
import { SanitizeKind, sanitizeSvg } from './svg/sanitize-svg';

/** Addresses one element: asset name + `data-ai-id` (design 003 E2). Never a DOM reference. */
export interface NodeRef {
  readonly asset: string;
  readonly id: string;
}

/** One asset of the document. */
export interface AssetState {
  readonly name: string;
  readonly kind: AssetKind;
  /** Parsed and cleaned SVG – the editable document of this asset. */
  svg?: SvgText;
  /** SVG text the browser could not parse (kept as is, not editable). */
  text?: string;
  /** PNG as data URL. */
  dataUrl?: string;
  /** Serialisation at the last open/save (`''` for non-SVG); missing = the backend has never
   * seen this asset. */
  saved?: string;
  /** Its name in the backend session when it was renamed since (design 010 E9). */
  source?: string;
}

/** What the user should know about an opened or imported file. */
export interface DocumentNotice {
  code: IconWarningCode | SanitizeKind | 'unparsable_svg';
  name: string;
}

/**
 * One open `.icon` (design 003 E1–E3): `icon.json` as an immutable value plus one SVG document per
 * asset. Pure – no Angular, no backend. Changed only by the commands in `commands/`.
 */
export class IconDocument {
  path: string | null = null;
  /** File name for the title (from the backend). */
  name: string | null = null;
  format: IconFormat = 'bundle';
  iconJson: IconJson = {};
  /** In file order; commands keep it. */
  assets = new Map<string, AssetState>();
  readonly notices: DocumentNotice[] = [];
  /** Counts every change (set by the `DocumentStore`). */
  revision = 0;
  /** The backend holds a session for `path` (opened or saved) with every `saved` asset. */
  private session = false;
  private idSeq = 0;

  static fromDto(dto: IconDocumentDto): IconDocument {
    const doc = new IconDocument();
    doc.path = dto.path;
    doc.name = dto.name;
    doc.format = dto.format;
    doc.iconJson = dto.iconJson;
    doc.session = dto.path !== null;
    doc.notices.push(...dto.warnings);
    for (const a of dto.assets) doc.assets.set(a.name, doc.loadAsset(a.name, a.kind, a));
    return doc;
  }

  private loadAsset(
    name: string,
    kind: AssetKind,
    content: { text?: string; dataUrl?: string },
  ): AssetState {
    // `saved` = the backend has it; for assets we cannot edit only that matters
    if (kind !== 'svg' || content.text === undefined) {
      return { name, kind, dataUrl: content.dataUrl, text: content.text, saved: '' };
    }
    const svg = parseSvg(content.text);
    if (!svg) {
      this.notices.push({ code: 'unparsable_svg', name });
      return { name, kind, text: content.text, saved: content.text };
    }
    for (const code of this.prepareSvg(svg)) this.notices.push({ code, name });
    // the base line is taken after cleaning: an asset nobody edits keeps its bytes (E4)
    return { name, kind, svg, saved: serializeAsset(svg) };
  }

  /** Cleans foreign markup and gives it ids (open, import, insert – design 003 E4). */
  prepare(root: Element): SanitizeKind[] {
    const found = sanitizeSvg(root);
    assignIds(root, () => this.nextId());
    return found;
  }

  /** `prepare` for a whole parsed asset, then its root goes live (design 004 E1). */
  prepareSvg(svg: SvgText): SanitizeKind[] {
    const found = this.prepare(svg.root);
    goLive(svg);
    return found;
  }

  nextId(): string {
    return `n${++this.idSeq}`;
  }

  /** The asset an `image-name` refers to (NFC, design 002 E11). */
  asset(name: string): AssetState | undefined {
    return this.assets.get(name) ?? findAsset([...this.assets.values()], name);
  }

  /** The element `ref` points to, `null` if it is gone. */
  node(ref: NodeRef): Element | null {
    const root = this.assets.get(ref.asset)?.svg?.root;
    if (!root || !/^n\d+$/.test(ref.id)) return null;
    if (root.getAttribute(ID_ATTR) === ref.id) return root;
    return root.querySelector(`[${ID_ATTR}="${ref.id}"]`);
  }

  /** The ref of an element of one of the assets. */
  refOf(el: Element): NodeRef | null {
    const id = el.getAttribute(ID_ATTR);
    if (!id) return null;
    for (const a of this.assets.values()) {
      if (a.svg && (a.svg.root === el || a.svg.root.contains(el))) return { asset: a.name, id };
    }
    return null;
  }

  /** Puts an asset at `index` of the file order (default: the end). */
  insertAsset(state: AssetState, index = this.assets.size): void {
    const list = [...this.assets.values()].filter((a) => a.name !== state.name);
    list.splice(Math.min(index, list.length), 0, state);
    this.assets = new Map(list.map((a) => [a.name, a]));
  }

  /** Removes an asset; returns its state and position (for undo). */
  removeAsset(name: string): { state: AssetState; index: number } | null {
    const list = [...this.assets.keys()];
    const index = list.indexOf(name);
    const state = this.assets.get(name);
    if (!state) return null;
    this.assets.delete(name);
    return { state, index };
  }

  /**
   * Renames an asset in place (design 010 E9): same position, same content; remembers the name the
   * backend session knows it by (undo = renaming back, so a save in between stays right).
   * `false` if `from` is missing or `to` is taken by another asset.
   */
  renameAsset(from: string, to: string): boolean {
    const old = this.assets.get(from);
    const key = nameKey(to);
    const taken = [...this.assets.values()].some((a) => a !== old && nameKey(a.name) === key);
    if (!old || !to || taken) return false;
    const source = old.saved === undefined ? undefined : (old.source ?? old.name);
    const next: AssetState = { ...old, name: to, source: source === to ? undefined : source };
    this.assets = new Map(
      [...this.assets.values()].map((a) => (a === old ? [to, next] : [a.name, a])),
    );
    return true;
  }

  /** Unchanged since the last open/save, and the backend still has it (design 003 E3). */
  private isUnchanged(a: AssetState): boolean {
    if (!this.session || a.saved === undefined) return false;
    return !a.svg || serializeAsset(a.svg) === a.saved;
  }

  /**
   * The request for `save_icon` (design 002 E5, 003 E3): every asset, unchanged ones by name
   * only. `path` other than the document's ("Save As") takes them from the old session.
   */
  saveRequest(path: string, format: IconFormat): SaveIconRequest {
    const assets: SaveAsset[] = [...this.assets.values()].map((a) =>
      this.isUnchanged(a)
        ? { name: a.name, unchanged: true, ...(a.source ? { source: a.source } : {}) }
        : { name: a.name, unchanged: false, text: a.svg ? serializeAsset(a.svg) : a.text },
    );
    const from = this.session && this.path !== null && this.path !== path ? this.path : null;
    return { path, format, iconJson: this.iconJson, assets, from };
  }

  /** After a successful save: new path/format, every asset is now known to the backend. */
  markSaved(result: SaveResult): void {
    this.path = result.path;
    this.name = result.name;
    this.format = result.format;
    this.session = true;
    for (const a of this.assets.values()) {
      a.saved = a.svg ? serializeAsset(a.svg) : (a.text ?? '');
      delete a.source;
    }
  }

  /** Everything that makes up the document, ids included (tests: "identical after undo"). */
  snapshot(): string {
    const assets = [...this.assets.values()].map((a) => [
      a.name,
      a.svg ? serializeAsset(a.svg, true) : (a.text ?? a.dataUrl ?? ''),
    ]);
    return JSON.stringify({ iconJson: this.iconJson, assets });
  }
}
