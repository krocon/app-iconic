import { inject, Injectable } from '@angular/core';
import { describeFsError, toFsError } from '../../core/errors/fs-error';
import { FontFamilyDto } from '../../core/fonts/fonts.models';
import { translatePath } from '../../shared/geometry/path-translate';
import { AskService } from '../../shared/ask/ask.service';
import { CompositeCommand, ReplaceNode } from '../document/commands';
import { NodeRef } from '../document/icon-document';
import { FilesService } from '../files/files.service';
import { editableRefs } from '../lock/lock';
import { TextPathService } from '../tools/text-path.service';
import { linesOf } from './text-lines';
import { chooseFont, pathMarkupFor, weightOf } from './text-to-path';
import { TEXT_TEXTS as T } from './text-texts';

interface Line {
  text: string;
  x: number;
  y: number;
}

/** The lines of a text where the browser placed them (anchor and `dy` included). */
function placedLines(text: SVGTextElement): Line[] {
  const parts: SVGTextContentElement[] = Array.from(text.children).filter(
    (t): t is SVGTSpanElement =>
      t.localName === 'tspan' && (t.hasAttribute('x') || t.hasAttribute('dy')),
  );
  const nodes: SVGTextContentElement[] = parts.length ? parts : [text];
  const texts = parts.length ? linesOf(text) : [text.textContent ?? ''];
  return nodes.flatMap((n, i) => {
    const t = texts[i] ?? '';
    if (!t.trim()) return [];
    // leading spaces: start at the first visible character
    const lead = t.length - t.trimStart().length;
    let p: { x: number; y: number };
    try {
      p = n.getStartPositionOfChar(lead);
    } catch {
      p = {
        x: Number(n.getAttribute('x') ?? text.getAttribute('x') ?? 0) || 0,
        y: Number(text.getAttribute('y') ?? 0) || 0,
      };
    }
    return [{ text: t.trim(), x: p.x, y: p.y }];
  });
}

/**
 * "Convert Text to Path" (prompt 075 E5, `text.toPath`): each selected `<text>` becomes one
 * `<path>` – font, weight, slant, size and letter spacing from the computed styles, outlines from
 * Rust (`text_to_path`, harfrust/skrifa), every line at the position the browser gave it (anchor,
 * `dy`, transforms of the text stay on the path). Paint and classes stay. One undo step for all.
 * A font that is not installed: the user is asked whether the default font may stand in.
 */
@Injectable({ providedIn: 'root' })
export class TextToPathService {
  private readonly files = inject(FilesService);
  private readonly fonts = inject(TextPathService);
  private readonly ask = inject(AskService);

  canConvert(): boolean {
    const s = this.files.store();
    return !!s && s.selection().some((r) => s.document().node(r)?.localName === 'text');
  }

  async convert(refs?: readonly NodeRef[]): Promise<boolean> {
    const store = this.files.store();
    if (!store) return false;
    const doc = store.document();
    const texts = editableRefs(doc, refs ?? store.selection()).filter(
      (r) => doc.node(r)?.localName === 'text',
    );
    if (!texts.length) {
      this.files.notice.set(T.noText);
      return false;
    }
    const fonts = await this.fonts.loadFonts();
    const cmds: ReplaceNode[] = [];
    try {
      for (const ref of texts) {
        const el = doc.node(ref) as SVGTextElement;
        const d = await this.outline(el, fonts);
        if (d === null) return false;
        if (d) cmds.push(new ReplaceNode(ref, pathMarkupFor(el, d)));
      }
    } catch (e) {
      this.files.notice.set(`${T.failed} ${describeFsError(toFsError(e))}`);
      return false;
    }
    if (!cmds.length) return false;
    store.execute(new CompositeCommand('textToPath', cmds));
    store.select(cmds.flatMap((c) => (c.newRef ? [c.newRef] : [])));
    return true;
  }

  /** Path data of one text; `''` without ink, `null` when the user declined a stand-in font. */
  private async outline(el: SVGTextElement, fonts: FontFamilyDto[]): Promise<string | null> {
    const cs = getComputedStyle(el);
    // the computed value; without layout (jsdom in tests) the attribute of the text or an ancestor
    const layout = typeof el.getStartPositionOfChar === 'function';
    const prop = (css: string, attr: string) =>
      (layout ? css : '') || el.closest(`[${attr}]`)?.getAttribute(attr) || '';
    const fontStyle = prop(cs.fontStyle, 'font-style');
    const italic = fontStyle === 'italic' || fontStyle.startsWith('oblique');
    const weight = weightOf(prop(cs.fontWeight, 'font-weight') || '400');
    const choice = chooseFont(fonts, prop(cs.fontFamily, 'font-family'), weight, italic);
    const missing = choice.missing;
    let style = choice.style;
    if (!style) {
      const fallback = chooseFont(fonts, 'sans-serif', weight, italic).style;
      if (!fallback) throw { code: 'not_found', message: 'no fonts' };
      const fam = fonts.find((f) => f.styles.includes(fallback))?.family ?? fallback.name;
      const answer = await this.ask.ask({
        title: T.missingTitle(missing ?? ''),
        message: T.missingMessage(fam),
        buttons: [
          { id: 'cancel', label: T.cancel },
          { id: 'use', label: T.useFallback, primary: true },
        ],
        cancel: 'cancel',
      });
      if (answer !== 'use') return null;
      style = fallback;
    }
    const size = parseFloat(prop(cs.fontSize, 'font-size')) || 16;
    const spacing = parseFloat(prop(cs.letterSpacing, 'letter-spacing')) || 0;
    const parts: string[] = [];
    for (const line of placedLines(el)) {
      const r = await this.fonts.textToPath(line.text, style.id, size, spacing);
      const d = r.d ? translatePath(r.d, line.x, line.y) : null;
      if (d) parts.push(d);
    }
    return parts.join(' ');
  }
}
