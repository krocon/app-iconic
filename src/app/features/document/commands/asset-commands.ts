import { IconDocument, AssetState } from '../icon-document';
import { parseSvg, SvgText } from '../svg/node-ids';
import { CommandError, DocCommand } from './command';
import { CommandJson } from './command-json';

/**
 * Replaces the whole markup of an SVG asset ("Edit SVG…", prompt 011). The markup is cleaned and
 * gets fresh ids once; undo puts back the old document with its ids.
 */
export class ReplaceAssetMarkup implements DocCommand {
  readonly label = 'editSvgCode';
  private next: SvgText | null = null;
  private old: SvgText | null = null;

  constructor(
    readonly asset: string,
    readonly markup: string,
  ) {}

  do(doc: IconDocument): void {
    const a = doc.assets.get(this.asset);
    if (!a?.svg) throw new CommandError(`no SVG asset ${this.asset}`);
    if (!this.next) {
      const parsed = parseSvg(this.markup);
      if (!parsed) throw new CommandError('invalid SVG');
      doc.prepareSvg(parsed);
      this.next = parsed;
    }
    this.old = a.svg;
    a.svg = this.next;
  }

  undo(doc: IconDocument): void {
    const a = doc.assets.get(this.asset);
    if (a && this.old) a.svg = this.old;
  }

  toJSON(): CommandJson {
    return { type: 'replaceAssetMarkup', asset: this.asset, markup: this.markup };
  }
}

/**
 * A new SVG asset from its markup (design 005 E15: serialisable – the import hands over the
 * markup after cleaning and resolving styles). Parsed, cleaned and given ids once; redo puts
 * back the same document.
 */
export class AddAsset implements DocCommand {
  readonly label = 'addAsset';
  private svg: SvgText | null = null;

  constructor(
    readonly name: string,
    readonly markup: string,
  ) {}

  do(doc: IconDocument): void {
    if (doc.asset(this.name)) throw new CommandError(`asset ${this.name} exists`);
    if (!this.svg) {
      const parsed = parseSvg(this.markup);
      if (!parsed) throw new CommandError('invalid SVG');
      doc.prepareSvg(parsed);
      this.svg = parsed;
    }
    const state: AssetState = { name: this.name, kind: 'svg', svg: this.svg };
    doc.insertAsset(state);
  }

  undo(doc: IconDocument): void {
    doc.removeAsset(this.name);
  }

  toJSON(): CommandJson {
    return { type: 'addAsset', name: this.name, markup: this.markup };
  }
}

export class RemoveAsset implements DocCommand {
  readonly label = 'removeAsset';
  private removed: { state: AssetState; index: number } | null = null;

  constructor(readonly name: string) {}

  do(doc: IconDocument): void {
    this.removed = doc.removeAsset(this.name);
    if (!this.removed) throw new CommandError(`no asset ${this.name}`);
  }

  undo(doc: IconDocument): void {
    if (this.removed) doc.insertAsset(this.removed.state, this.removed.index);
  }

  toJSON(): CommandJson {
    return { type: 'removeAsset', name: this.name };
  }
}
