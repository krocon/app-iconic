import { parsePath, PathSeg, withStarts } from './path-data';
import { Point } from './view-transform';
import { writeKeepingForm } from './path-write';

/**
 * Path data moved by (dx, dy) (design 013 E13), pure: through the tokenizer of design 007 E8 –
 * every absolute point moves, relative segments keep their form (their offsets stay). `null` for
 * data the tokenizer does not read.
 */
export function translatePath(d: string, dx: number, dy: number, precision = 2): string | null {
  const segs = parsePath(d);
  if (!segs) return null;
  const mv = (p: Point | undefined) => (p ? { x: p.x + dx, y: p.y + dy } : p);
  const moved: PathSeg[] = segs.map((s) => ({
    ...s,
    p: mv(s.p)!,
    c1: mv(s.c1),
    c2: mv(s.c2),
  }));
  return writeKeepingForm(withStarts(moved), precision);
}
