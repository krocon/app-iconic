import { guideMarkup } from '../guides/guide.service';

/**
 * The motifs of the templates (design 082 E7): own, abstract shapes on the 1024 canvas – square,
 * unmasked layers as Apple asks for ("Produce appropriately shaped, unmasked layers", HIG App
 * icons); the mask comes from the view or the system. Pure.
 */

const open =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">';
const svg = (...body: string[]) => `${open}\n${body.map((b) => `  ${b}\n`).join('')}</svg>\n`;

/**
 * Keylines of the iOS template (prompt 056 guides, locked): the centre lines, the 512 keyline
 * circle's edges (256 / 768) and the outer lines of the Apple grid (128 / 896).
 */
export const KEYLINES: readonly number[] = [128, 256, 512, 768, 896];

function keylines(): string[] {
  return KEYLINES.flatMap((at) => [
    guideMarkup('horizontal', at, undefined, true).replace(
      ' xmlns="http://www.w3.org/2000/svg"',
      '',
    ),
    guideMarkup('vertical', at, undefined, true).replace(' xmlns="http://www.w3.org/2000/svg"', ''),
  ]);
}

/** iOS: a ring with a dot inside the 512 keyline circle, plus the keylines. */
export const IOS_GLYPH = svg(
  '<circle cx="512" cy="512" r="224" fill="none" stroke="#ffffff" stroke-width="72"/>',
  '<circle cx="512" cy="512" r="84" fill="#ffffff"/>',
  ...keylines(),
);

/** macOS, back group: a light plate. */
export const MACOS_PLATE = svg(
  '<rect x="232" y="272" width="560" height="480" rx="80" fill="#fff7ea"/>',
);

/** macOS, front group: a disc over the plate. */
export const MACOS_MARK = svg('<circle cx="512" cy="512" r="132" fill="#ff8a1f"/>');

/** watchOS: a centred leaf well inside the 820 circle (HIG: centre content in round icons). */
export const WATCH_GLYPH = svg(
  '<path d="M512 252 C 652 332 712 452 652 592 C 612 682 552 732 512 772 C 472 732 412 682 372 592 C 312 452 372 332 512 252 Z" fill="#ffffff"/>',
  '<path d="M512 352 L 512 712" stroke="#2a7f5f" stroke-width="28" stroke-linecap="round"/>',
);

/** Light/Dark: a sun disc (its colour comes from the layer fill per appearance). */
export const SUN_GLYPH = svg(
  '<circle cx="512" cy="512" r="200" fill="#ffffff"/>',
  '<circle cx="512" cy="512" r="300" fill="none" stroke="#ffffff" stroke-width="40" stroke-dasharray="60 58"/>',
);
